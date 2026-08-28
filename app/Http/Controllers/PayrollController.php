<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Models\Borrower;
use App\Models\PayrollMember;
use App\Models\PayrollMemberPayment;
use App\Models\PayrollProject;
use App\Models\PayrollProjectDetail;
use App\Models\User;
use App\Services\BorrowerLoanService;
use App\Services\FinancialLedgerService;
use App\Services\InventoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class PayrollController extends Controller
{
    public function __construct(
        private FinancialLedgerService $ledgerService,
        private InventoryService $inventoryService,
        private BorrowerLoanService $borrowerLoanService,
    )
    {
    }

    /**
     * Dashboard payroll: ringkasan gaji belum dibayar + daftar proyek
     */
    public function index(Request $request)
    {
        // Ringkasan gaji per anggota: total bagian - total pembayaran
        $unpaidSummary = PayrollMember::select('payroll_members.id', 'payroll_members.nama', 'payroll_members.telepon')
            ->selectRaw('COALESCE((
                SELECT SUM(ppm.bagian) FROM payroll_project_members ppm WHERE ppm.payroll_member_id = payroll_members.id
            ), 0) as total_bagian')
            ->selectRaw('COALESCE((
                SELECT SUM(pmp.nominal) FROM payroll_member_payments pmp WHERE pmp.payroll_member_id = payroll_members.id
            ), 0) as total_paid')
            ->selectRaw('COALESCE((
                SELECT SUM(ppm.bagian) FROM payroll_project_members ppm WHERE ppm.payroll_member_id = payroll_members.id
            ), 0) - COALESCE((
                SELECT SUM(pmp.nominal) FROM payroll_member_payments pmp WHERE pmp.payroll_member_id = payroll_members.id
            ), 0) as total_unpaid')
            ->orderByDesc('total_unpaid')
            ->get()
            ->map(function (PayrollMember $member) {
                $loanContext = $this->resolvePayrollBorrowerContext($member);

                return [
                    ...$member->toArray(),
                    'borrower' => $loanContext['borrower'],
                    'borrower_outstanding' => $loanContext['outstanding'],
                ];
            });

        // Daftar proyek
        $query = PayrollProject::with(['members', 'details.inventoryItem.type'])
            ->orderByDesc('tanggal')
            ->orderByDesc('id');

        if ($request->has('status') && in_array($request->status, ['unpaid', 'paid'])) {
            $query->where('status', $request->status);
        }

        $projects = $query->get();

        return response()->json([
            'unpaid_summary' => $unpaidSummary,
            'projects' => $projects,
        ]);
    }

    /**
     * Daftar semua anggota
     */
    public function members()
    {
        $members = PayrollMember::orderBy('nama')->get();
        return response()->json(['data' => $members]);
    }

    /**
     * Tambah anggota baru
     */
    public function storeMember(Request $request)
    {
        $validated = $request->validate([
            'nama' => 'required|string|max:255',
            'telepon' => 'nullable|string|max:20',
        ]);

        $member = PayrollMember::create($validated);

        return response()->json(['data' => $member, 'message' => 'Anggota berhasil ditambahkan'], 201);
    }

    /**
     * Update anggota
     */
    public function updateMember(Request $request, $id)
    {
        $member = PayrollMember::findOrFail($id);
        $validated = $request->validate([
            'nama' => 'required|string|max:255',
            'telepon' => 'nullable|string|max:20',
        ]);

        $member->update($validated);

        return response()->json(['data' => $member, 'message' => 'Anggota berhasil diperbarui']);
    }

    /**
     * Hapus anggota (hanya jika tidak punya proyek)
     */
    public function destroyMember($id)
    {
        $member = PayrollMember::findOrFail($id);
        
        if ($member->projects()->count() > 0) {
            return response()->json(['error' => 'Anggota tidak bisa dihapus karena masih terdaftar di proyek'], 422);
        }

        $member->delete();

        return response()->json(['message' => 'Anggota berhasil dihapus']);
    }

    /**
     * Simpan proyek baru
     */
    public function storeProject(Request $request)
    {
        $validated = $request->validate([
            'tanggal' => 'required|date',
            'catatan' => 'nullable|string',
            'member_ids' => 'required|array|min:1',
            'member_ids.*' => 'exists:payroll_members,id',
            'details' => 'required|array|min:1',
            'details.*.tipe' => 'required|in:pemasangan,kabel,kustom',
            'details.*.deskripsi' => 'nullable|string',
            'details.*.inventory_item_id' => 'nullable|integer|exists:inventory_items,id',
            'details.*.jumlah' => 'required|numeric|min:0',
            'details.*.harga_satuan' => 'required|numeric|min:0',
        ]);

        try {
            DB::beginTransaction();

            $inventoryItemIds = collect($validated['details'])
                ->pluck('inventory_item_id')
                ->filter()
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values();

            $inventoryItemNames = $inventoryItemIds->count() > 0
                ? InventoryItem::whereIn('id', $inventoryItemIds)->pluck('name', 'id')
                : collect();

            $project = PayrollProject::create([
                'tanggal' => $validated['tanggal'],
                'catatan' => $validated['catatan'] ?? null,
                'total' => 0,
                'status' => 'unpaid',
            ]);

            // Attach members
            foreach ($validated['member_ids'] as $memberId) {
                $project->members()->attach($memberId, ['bagian' => 0]);
            }

            // Create details
            foreach ($validated['details'] as $detail) {
                $subtotal = $detail['jumlah'] * $detail['harga_satuan'];
                $inventoryItemId = !empty($detail['inventory_item_id']) ? (int) $detail['inventory_item_id'] : null;
                $description = $detail['deskripsi'] ?? null;

                if (!$description && $inventoryItemId) {
                    $description = $inventoryItemNames->get($inventoryItemId);
                }

                PayrollProjectDetail::create([
                    'payroll_project_id' => $project->id,
                    'tipe' => $detail['tipe'],
                    'deskripsi' => $description,
                    'inventory_item_id' => $inventoryItemId,
                    'jumlah' => $detail['jumlah'],
                    'harga_satuan' => $detail['harga_satuan'],
                    'subtotal' => $subtotal,
                ]);
            }

            // Recalculate total and distribute to members
            $project->recalculate();
            $this->inventoryService->syncPayrollProjectOutflow($project, auth()->id());

            DB::commit();

            $project->load(['members', 'details.inventoryItem.type']);
            return response()->json(['data' => $project, 'message' => 'Proyek berhasil ditambahkan'], 201);
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to create payroll project', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Gagal membuat proyek: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Update proyek
     */
    public function updateProject(Request $request, $id)
    {
        $validated = $request->validate([
            'tanggal' => 'required|date',
            'catatan' => 'nullable|string',
            'member_ids' => 'required|array|min:1',
            'member_ids.*' => 'exists:payroll_members,id',
            'details' => 'required|array|min:1',
            'details.*.tipe' => 'required|in:pemasangan,kabel,kustom',
            'details.*.deskripsi' => 'nullable|string',
            'details.*.inventory_item_id' => 'nullable|integer|exists:inventory_items,id',
            'details.*.jumlah' => 'required|numeric|min:0',
            'details.*.harga_satuan' => 'required|numeric|min:0',
        ]);

        try {
            DB::beginTransaction();

            $inventoryItemIds = collect($validated['details'])
                ->pluck('inventory_item_id')
                ->filter()
                ->map(fn ($id) => (int) $id)
                ->unique()
                ->values();

            $inventoryItemNames = $inventoryItemIds->count() > 0
                ? InventoryItem::whereIn('id', $inventoryItemIds)->pluck('name', 'id')
                : collect();

            $project = PayrollProject::findOrFail($id);

            $project->update([
                'tanggal' => $validated['tanggal'],
                'catatan' => $validated['catatan'] ?? null,
            ]);

            // Sync members
            $syncData = [];
            foreach ($validated['member_ids'] as $memberId) {
                $syncData[$memberId] = ['bagian' => 0];
            }
            $project->members()->sync($syncData);

            // Replace details
            $project->details()->delete();
            foreach ($validated['details'] as $detail) {
                $subtotal = $detail['jumlah'] * $detail['harga_satuan'];
                $inventoryItemId = !empty($detail['inventory_item_id']) ? (int) $detail['inventory_item_id'] : null;
                $description = $detail['deskripsi'] ?? null;

                if (!$description && $inventoryItemId) {
                    $description = $inventoryItemNames->get($inventoryItemId);
                }

                PayrollProjectDetail::create([
                    'payroll_project_id' => $project->id,
                    'tipe' => $detail['tipe'],
                    'deskripsi' => $description,
                    'inventory_item_id' => $inventoryItemId,
                    'jumlah' => $detail['jumlah'],
                    'harga_satuan' => $detail['harga_satuan'],
                    'subtotal' => $subtotal,
                ]);
            }

            // Recalculate
            $project->recalculate();
            $this->inventoryService->syncPayrollProjectOutflow($project, auth()->id());

            DB::commit();

            $project->load(['members', 'details.inventoryItem.type']);
            return response()->json(['data' => $project, 'message' => 'Proyek berhasil diperbarui']);
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage(), 'errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to update payroll project', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Gagal memperbarui proyek: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Konfirmasi pembayaran proyek
     */
    public function confirmPayment($id)
    {
        $project = PayrollProject::findOrFail($id);

        if ($project->status === 'paid') {
            return response()->json(['message' => 'Proyek ini sudah dibayar'], 422);
        }

        $project->update([
            'status' => 'paid',
            'paid_at' => now(),
        ]);

        $project->load(['members', 'details']);
        return response()->json(['data' => $project, 'message' => 'Pembayaran berhasil dikonfirmasi']);
    }

    /**
     * Bayar anggota - input nominal pembayaran (bisa sebagian)
     */
    public function payMember(Request $request, $memberId)
    {
        $validated = $request->validate([
            'nominal' => 'required|numeric|min:1',
            'catatan' => 'nullable|string|max:255',
            'loan_handling' => 'nullable|in:cash,deduct_loan',
            'loan_deduction_amount' => 'nullable|numeric|min:0',
        ]);

        $member = PayrollMember::findOrFail($memberId);

        // Hitung sisa unpaid
        $totalBagian = DB::table('payroll_project_members')
            ->where('payroll_member_id', $memberId)
            ->sum('bagian');
        $totalPayments = DB::table('payroll_member_payments')
            ->where('payroll_member_id', $memberId)
            ->sum('nominal');
        $remaining = $totalBagian - $totalPayments;

        if ($remaining <= 0) {
            return response()->json(['message' => 'Tidak ada saldo yang belum dibayar untuk anggota ini'], 422);
        }

        $nominal = (int) min($validated['nominal'], $remaining); // jangan lebih dari sisa
        $loanHandling = $validated['loan_handling'] ?? 'cash';
        $loanDeductionAmount = 0;
        $borrower = null;

        if ($loanHandling === 'deduct_loan') {
            $loanContext = $this->resolvePayrollBorrowerContext($member);
            $borrowerData = $loanContext['borrower'];
            $borrower = $borrowerData ? Borrower::query()->find((int) $borrowerData['id']) : null;

            if (!$borrower) {
                return response()->json(['message' => 'Karyawan ini belum memiliki mapping borrower aktif.'], 422);
            }

            $requestedDeduction = (int) ($validated['loan_deduction_amount'] ?? 0);
            $loanDeductionAmount = $requestedDeduction > 0 ? $requestedDeduction : $nominal;

            if ($loanDeductionAmount <= 0) {
                return response()->json(['message' => 'Nominal potong pinjaman harus lebih dari 0.'], 422);
            }

            if ($loanDeductionAmount > $nominal) {
                return response()->json(['message' => 'Nominal bayar pinjaman tidak boleh lebih besar dari jumlah payroll.'], 422);
            }

            if ($loanDeductionAmount > (int) $loanContext['outstanding']) {
                return response()->json(['message' => 'Nominal potong pinjaman melebihi sisa pinjaman karyawan.'], 422);
            }
        }

        $cashPaidAmount = max(0, $nominal - $loanDeductionAmount);

        try {
            $payment = DB::transaction(function () use ($memberId, $nominal, $validated, $loanHandling, $loanDeductionAmount, $cashPaidAmount, $borrower) {
                $payment = PayrollMemberPayment::create([
                    'payroll_member_id' => $memberId,
                    'nominal' => $nominal,
                    'catatan' => $validated['catatan'] ?? null,
                    'loan_handling' => $loanHandling,
                    'gross_nominal' => $nominal,
                    'loan_deduction_amount' => $loanDeductionAmount,
                    'cash_paid_amount' => $cashPaidAmount,
                    'borrower_id' => $borrower?->id,
                ]);

                if ($borrower && $loanDeductionAmount > 0) {
                    $settlement = $this->borrowerLoanService->settleBorrowerTotal(
                        $borrower,
                        $loanDeductionAmount,
                        now()->toDateString(),
                        auth()->user(),
                        'Potong pinjaman dari pembayaran payroll #' . $payment->id
                    );

                    $payment->forceFill([
                        'borrower_loan_settlement_action_group_key' => $settlement['action_group_key'] ?? null,
                    ])->save();
                }

                $this->ledgerService->syncPayrollPayment($payment->fresh('member'), auth()->id());

                return $payment->fresh(['member', 'borrower']);
            });

            $newRemaining = $remaining - $nominal;

            return response()->json([
                'message' => 'Pembayaran ' . number_format($nominal, 0, ',', '.') . ' untuk ' . $member->nama . ' berhasil',
                'payment' => $payment,
                'remaining' => $newRemaining,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to pay member', ['member_id' => $memberId, 'error' => $e->getMessage()]);
            return response()->json(['message' => 'Gagal memproses pembayaran: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Riwayat pembayaran anggota
     */
    public function memberPayments($memberId)
    {
        $member = PayrollMember::findOrFail($memberId);
        $payments = \App\Models\PayrollMemberPayment::where('payroll_member_id', $memberId)
            ->with('borrower:id,name')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'member' => $member,
            'payments' => $payments,
            'loan_context' => $this->resolvePayrollBorrowerContext($member),
        ]);
    }

    /**
     * Hapus proyek
     */
    public function destroyProject($id)
    {
        DB::beginTransaction();

        try {
            $project = PayrollProject::findOrFail($id);
            $this->inventoryService->removePayrollProjectOutflow($project);
            $project->delete();

            DB::commit();

            return response()->json(['message' => 'Proyek berhasil dihapus']);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Failed to delete payroll project', ['project_id' => $id, 'error' => $e->getMessage()]);
            return response()->json(['message' => 'Gagal menghapus proyek: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Detail satu proyek
     */
    public function showProject($id)
    {
        $project = PayrollProject::with(['members', 'details.inventoryItem.type'])->findOrFail($id);
        return response()->json(['data' => $project]);
    }

    private function resolvePayrollBorrowerContext(PayrollMember $member): array
    {
        $user = User::query()
            ->where('payroll_member_id', $member->id)
            ->first();

        if (!$user) {
            return [
                'user' => null,
                'borrower' => null,
                'outstanding' => 0,
            ];
        }

        $borrower = $this->borrowerLoanService->borrowerForUser($user);
        if (!$borrower) {
            return [
                'user' => $user->only(['id', 'name', 'email']),
                'borrower' => null,
                'outstanding' => 0,
            ];
        }

        return [
            'user' => $user->only(['id', 'name', 'email']),
            'borrower' => [
                'id' => $borrower->id,
                'name' => $borrower->name,
            ],
            'outstanding' => $this->borrowerLoanService->outstandingForBorrower($borrower),
        ];
    }
}
