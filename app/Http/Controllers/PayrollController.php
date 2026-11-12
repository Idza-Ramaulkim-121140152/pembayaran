<?php

namespace App\Http\Controllers;

use App\Models\InventoryItem;
use App\Models\Borrower;
use App\Models\PayrollMember;
use App\Models\PayrollMemberPayment;
use App\Models\PayrollProject;
use App\Models\PayrollProjectDetail;
use App\Models\User;
use App\Services\AttendanceService;
use App\Services\BorrowerLoanService;
use App\Services\FinancialLedgerService;
use App\Services\InventoryService;
use App\Services\PayrollWhatsAppService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class PayrollController extends Controller
{
    public function __construct(
        private FinancialLedgerService $ledgerService,
        private InventoryService $inventoryService,
        private BorrowerLoanService $borrowerLoanService,
        private AttendanceService $attendanceService,
        private PayrollWhatsAppService $payrollWhatsAppService,
    )
    {
    }

    /**
     * Dashboard payroll: ringkasan gaji belum dibayar + daftar proyek
     */
    public function index(Request $request)
    {
        $hasAtasNamaColumn = Schema::hasColumn('payroll_members', 'atas_nama_rekening');

        $selectColumns = [
            'payroll_members.id',
            'payroll_members.nama',
            'payroll_members.telepon',
            'payroll_members.tipe_gaji',
            'payroll_members.gaji_pokok',
            'payroll_members.tunjangan',
            'payroll_members.tanggal_gajian',
            'payroll_members.nama_bank',
            'payroll_members.nomor_rekening',
            'payroll_members.is_active',
        ];
        if ($hasAtasNamaColumn) {
            $selectColumns[] = 'payroll_members.atas_nama_rekening';
        }

        // Ringkasan gaji per anggota: total bagian - total pembayaran + info gaji bulanan & tunjangan
        $memberQuery = PayrollMember::select($selectColumns);
        if (Schema::hasTable('payroll_member_allowances')) {
            $memberQuery->with('allowances');
        }

        $unpaidSummary = $memberQuery
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
                    ...$member->getAllowanceSummaryAttributes(),
                    'borrower'             => $loanContext['borrower'],
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
        $query = PayrollMember::orderBy('nama');
        if (Schema::hasTable('payroll_member_allowances')) {
            $query->with('allowances');
        }

        $members = $query->get()->map(function (PayrollMember $m) {
            return [
                ...$m->toArray(),
                ...$m->getAllowanceSummaryAttributes(),
            ];
        });
        return response()->json(['data' => $members]);
    }

    /**
     * Tambah anggota baru
     */
    public function storeMember(Request $request)
    {
        $validated = $request->validate([
            'nama'               => 'required|string|max:255',
            'telepon'            => 'nullable|string|max:20',
            'tipe_gaji'          => 'nullable|in:bulanan,proyek,campuran',
            'gaji_pokok'         => 'nullable|numeric|min:0',
            'tunjangan'          => 'nullable|numeric|min:0',
            'allowances'         => 'nullable|array',
            'allowances.*.nama'  => 'required|string|max:120',
            'allowances.*.jenis' => 'required|in:bulanan,harian',
            'allowances.*.nominal' => 'required|numeric|min:0',
            'tanggal_gajian'     => 'nullable|integer|min:1|max:31',
            'nama_bank'          => 'nullable|string|max:100',
            'nomor_rekening'     => 'nullable|string|max:100',
            'atas_nama_rekening' => 'nullable|string|max:150',
            'is_active'          => 'nullable|boolean',
        ]);

        $member = DB::transaction(function () use ($request, $validated) {
            $payload = [
                'nama'           => $validated['nama'],
                'telepon'        => $validated['telepon'] ?? null,
                'tipe_gaji'      => $validated['tipe_gaji'] ?? 'bulanan',
                'gaji_pokok'     => $validated['gaji_pokok'] ?? 0,
                'tunjangan'      => $validated['tunjangan'] ?? 0,
                'tanggal_gajian' => $validated['tanggal_gajian'] ?? 1,
                'nama_bank'      => $validated['nama_bank'] ?? null,
                'nomor_rekening' => $validated['nomor_rekening'] ?? null,
                'is_active'      => $validated['is_active'] ?? true,
            ];

            if (Schema::hasColumn('payroll_members', 'atas_nama_rekening')) {
                $payload['atas_nama_rekening'] = $validated['atas_nama_rekening'] ?? null;
            }

            $member = PayrollMember::create($payload);
            $member->syncAllowancesFromRequest(
                $request->has('allowances'),
                $validated['allowances'] ?? null,
                $request->has('tunjangan'),
                isset($validated['tunjangan']) ? (float) $validated['tunjangan'] : null
            );

            return $member->fresh(Schema::hasTable('payroll_member_allowances') ? ['allowances'] : []);
        });

        return response()->json([
            'data' => [
                ...$member->toArray(),
                ...$member->getAllowanceSummaryAttributes(),
            ],
            'message' => 'Karyawan / Anggota berhasil ditambahkan',
        ], 201);
    }

    /**
     * Update anggota
     */
    public function updateMember(Request $request, $id)
    {
        $member = PayrollMember::findOrFail($id);
        $validated = $request->validate([
            'nama'               => 'required|string|max:255',
            'telepon'            => 'nullable|string|max:20',
            'tipe_gaji'          => 'nullable|in:bulanan,proyek,campuran',
            'gaji_pokok'         => 'nullable|numeric|min:0',
            'tunjangan'          => 'nullable|numeric|min:0',
            'allowances'         => 'nullable|array',
            'allowances.*.nama'  => 'required|string|max:120',
            'allowances.*.jenis' => 'required|in:bulanan,harian',
            'allowances.*.nominal' => 'required|numeric|min:0',
            'tanggal_gajian'     => 'nullable|integer|min:1|max:31',
            'nama_bank'          => 'nullable|string|max:100',
            'nomor_rekening'     => 'nullable|string|max:100',
            'atas_nama_rekening' => 'nullable|string|max:150',
            'is_active'          => 'nullable|boolean',
        ]);

        if (!Schema::hasColumn('payroll_members', 'atas_nama_rekening')) {
            unset($validated['atas_nama_rekening']);
        }

        $memberUpdates = Arr::except($validated, ['allowances']);
        if (!$request->has('tunjangan')) {
            unset($memberUpdates['tunjangan']);
        }

        $member = DB::transaction(function () use ($member, $request, $validated, $memberUpdates) {
            $member->update($memberUpdates);
            $member->syncAllowancesFromRequest(
                $request->has('allowances'),
                $validated['allowances'] ?? null,
                $request->has('tunjangan'),
                isset($validated['tunjangan']) ? (float) $validated['tunjangan'] : null
            );

            return $member->fresh(Schema::hasTable('payroll_member_allowances') ? ['allowances'] : []);
        });

        return response()->json([
            'data' => [
                ...$member->toArray(),
                ...$member->getAllowanceSummaryAttributes(),
            ],
            'message' => 'Data gaji karyawan berhasil diperbarui',
        ]);
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

            $project = PayrollProject::query()->lockForUpdate()->findOrFail($id);

            if ($project->status === 'paid') {
                DB::rollBack();
                return response()->json(['message' => 'Proyek yang sudah dibayar tidak dapat diubah'], 422);
            }

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
        $project = DB::transaction(function () use ($id) {
            $project = PayrollProject::query()->lockForUpdate()->findOrFail($id);

            if ($project->status === 'paid') {
                return null;
            }

            $project->update([
                'status' => 'paid',
                'paid_at' => now(),
            ]);

            return $project;
        });

        if (!$project) {
            return response()->json(['message' => 'Proyek ini sudah dibayar'], 422);
        }

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
            'payment_method' => 'nullable|in:transfer,cash',
            'bank_name' => 'nullable|string|max:100',
            'account_number' => 'nullable|string|max:100',
            'account_holder' => 'nullable|string|max:150',
            'save_bank_to_member' => 'nullable|boolean',
            'telepon' => 'nullable|string|max:30',
            'attendance_start_date' => 'nullable|date',
            'attendance_end_date' => 'nullable|date',
            'attendance_confirmed' => 'nullable|boolean',
            'attendance_note' => 'nullable|string|max:255',
            'send_whatsapp' => 'nullable|boolean',
        ]);

        $member = PayrollMember::findOrFail($memberId);
        $isMonthly = in_array($member->tipe_gaji ?? 'bulanan', ['bulanan', 'campuran']);
        $loanHandling = $validated['loan_handling'] ?? 'cash';

        $requestedBankName = trim((string) ($validated['bank_name'] ?? ''));
        $requestedAccountNumber = trim((string) ($validated['account_number'] ?? ''));
        $requestedAccountHolder = trim((string) ($validated['account_holder'] ?? ''));

        $effectiveBankName = $requestedBankName !== '' ? $requestedBankName : trim((string) ($member->nama_bank ?? ''));
        $effectiveAccountNumber = $requestedAccountNumber !== '' ? $requestedAccountNumber : trim((string) ($member->nomor_rekening ?? ''));
        $effectiveAccountHolder = $requestedAccountHolder !== ''
            ? $requestedAccountHolder
            : trim((string) ($member->atas_nama_rekening ?: $member->nama));

        $paymentMethod = $validated['payment_method'] ?? null;
        if (!$paymentMethod) {
            $isBankTransfer = $effectiveBankName !== '' && !in_array(strtolower($effectiveBankName), ['cash', 'tunai'], true);
            $paymentMethod = $isBankTransfer ? 'transfer' : 'cash';
        }

        if ($paymentMethod === 'transfer' && $effectiveBankName === '') {
            return response()->json(['message' => 'Nama bank tujuan wajib diisi jika memilih metode transfer bank.'], 422);
        }

        if ($paymentMethod === 'cash') {
            $snapshotBankName = null;
            $snapshotAccountNumber = null;
            $snapshotAccountHolder = null;
        } else {
            $snapshotBankName = $effectiveBankName;
            $snapshotAccountNumber = $effectiveAccountNumber !== '' ? $effectiveAccountNumber : null;
            $snapshotAccountHolder = $effectiveAccountHolder !== '' ? $effectiveAccountHolder : null;
        }

        $attendanceFull = $this->attendanceService->getEmployeePayrollAttendanceSummary(
            $member,
            $validated['attendance_start_date'] ?? null,
            $validated['attendance_end_date'] ?? null
        );
        $attendanceSnapshot = array_merge(Arr::except($attendanceFull, ['recent_records']), [
            'confirmed' => (bool) ($validated['attendance_confirmed'] ?? true),
            'note' => !empty($validated['attendance_note']) ? trim((string) $validated['attendance_note']) : null,
        ]);

        try {
            $result = DB::transaction(function () use (
                $memberId,
                $isMonthly,
                $validated,
                $loanHandling,
                $paymentMethod,
                $snapshotBankName,
                $snapshotAccountNumber,
                $snapshotAccountHolder,
                $attendanceFull,
                $attendanceSnapshot,
                $requestedBankName,
                $requestedAccountNumber,
                $requestedAccountHolder
            ) {
                $member = PayrollMember::query()->lockForUpdate()->findOrFail($memberId);

                $totalBagian = DB::table('payroll_project_members')
                    ->where('payroll_member_id', $memberId)
                    ->sum('bagian');
                $totalPayments = DB::table('payroll_member_payments')
                    ->where('payroll_member_id', $memberId)
                    ->sum('nominal');
                $remaining = max(0, $totalBagian - $totalPayments);

                $nominal = (int) $validated['nominal'];

                if (!$isMonthly && $remaining <= 0) {
                    throw ValidationException::withMessages([
                        'nominal' => ['Tidak ada saldo yang belum dibayar untuk anggota ini'],
                    ]);
                }

                if (!$isMonthly && $nominal > $remaining) {
                    $nominal = (int) $remaining;
                }

                $loanDeductionAmount = 0;
                $borrower = null;

                if ($loanHandling === 'deduct_loan') {
                    $loanContext = $this->resolvePayrollBorrowerContext($member);
                    $borrowerData = $loanContext['borrower'];
                    $borrower = $borrowerData ? Borrower::query()->lockForUpdate()->find((int) $borrowerData['id']) : null;

                    if (!$borrower) {
                        throw ValidationException::withMessages([
                            'loan_handling' => ['Karyawan ini belum memiliki mapping borrower aktif.'],
                        ]);
                    }

                    $requestedDeduction = (int) ($validated['loan_deduction_amount'] ?? 0);
                    $loanDeductionAmount = $requestedDeduction > 0 ? $requestedDeduction : $nominal;

                    if ($loanDeductionAmount <= 0) {
                        throw ValidationException::withMessages([
                            'loan_deduction_amount' => ['Nominal potong pinjaman harus lebih dari 0.'],
                        ]);
                    }

                    if ($loanDeductionAmount > $nominal) {
                        throw ValidationException::withMessages([
                            'loan_deduction_amount' => ['Nominal bayar pinjaman tidak boleh lebih besar dari jumlah payroll.'],
                        ]);
                    }

                    $freshOutstanding = $this->borrowerLoanService->outstandingForBorrower($borrower);
                    if ($loanDeductionAmount > $freshOutstanding) {
                        throw ValidationException::withMessages([
                            'loan_deduction_amount' => ['Nominal potong pinjaman melebihi sisa pinjaman karyawan.'],
                        ]);
                    }
                }

                $cashPaidAmount = max(0, $nominal - $loanDeductionAmount);

                $salaryBreakdown = $member->calculateSalaryBreakdown((int) ($attendanceFull['total_present'] ?? 0));
                $allowanceSnapshot = array_merge($salaryBreakdown, [
                    'attendance_period_start' => $attendanceFull['period_start'],
                    'attendance_period_end' => $attendanceFull['period_end'],
                    'paid_nominal' => $nominal,
                ]);

                $previousPaidInPeriod = (float) PayrollMemberPayment::query()
                    ->where('payroll_member_id', $memberId)
                    ->whereBetween('created_at', [
                        Carbon::parse($attendanceFull['period_start'])->startOfDay(),
                        Carbon::parse($attendanceFull['period_end'])->endOfDay(),
                    ])
                    ->sum('nominal');

                $memberUpdates = [];
                $shouldSaveBank = (bool) ($validated['save_bank_to_member'] ?? true);
                if ($shouldSaveBank && $paymentMethod === 'transfer' && $requestedBankName !== '') {
                    $memberUpdates['nama_bank'] = $requestedBankName;
                    if ($requestedAccountNumber !== '' || array_key_exists('account_number', $validated)) {
                        $memberUpdates['nomor_rekening'] = $requestedAccountNumber !== '' ? $requestedAccountNumber : null;
                    }
                    if (
                        Schema::hasColumn('payroll_members', 'atas_nama_rekening')
                        && ($requestedAccountHolder !== '' || array_key_exists('account_holder', $validated))
                    ) {
                        $memberUpdates['atas_nama_rekening'] = $requestedAccountHolder !== '' ? $requestedAccountHolder : null;
                    }
                }
                if (!empty($validated['telepon'])) {
                    $memberUpdates['telepon'] = trim((string) $validated['telepon']);
                }
                if (!empty($memberUpdates)) {
                    $member->update($memberUpdates);
                }

                $paymentAttributes = [
                    'payroll_member_id' => $memberId,
                    'nominal' => $nominal,
                    'catatan' => $validated['catatan'] ?? null,
                    'loan_handling' => $loanHandling,
                    'gross_nominal' => $nominal,
                    'loan_deduction_amount' => $loanDeductionAmount,
                    'cash_paid_amount' => $cashPaidAmount,
                    'borrower_id' => $borrower?->id,
                ];

                if (Schema::hasColumn('payroll_member_payments', 'payment_method')) {
                    $paymentAttributes['payment_method'] = $paymentMethod;
                    $paymentAttributes['bank_name'] = $snapshotBankName;
                    $paymentAttributes['account_number'] = $snapshotAccountNumber;
                    $paymentAttributes['account_holder'] = $snapshotAccountHolder;
                    $paymentAttributes['attendance_summary'] = $attendanceSnapshot;
                }
                if (Schema::hasColumn('payroll_member_payments', 'allowance_breakdown')) {
                    $paymentAttributes['allowance_breakdown'] = $allowanceSnapshot;
                }

                $payment = PayrollMemberPayment::create($paymentAttributes);

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

                return [
                    'payment' => $payment->fresh(['member', 'borrower']),
                    'member' => $member->fresh(),
                    'nominal' => $nominal,
                    'remaining' => max(0, $remaining - $nominal),
                    'previous_paid_in_period' => $previousPaidInPeriod,
                    'allowance_snapshot' => $allowanceSnapshot,
                ];
            });

            $payment = $result['payment'];
            $member = $result['member'];
            $nominal = $result['nominal'];
            $newRemaining = $result['remaining'];
            $previousPaidInPeriod = $result['previous_paid_in_period'];
            $allowanceSnapshot = $result['allowance_snapshot'];

            $loanAfter = $this->resolvePayrollBorrowerContext($member);
            $whatsappResult = null;
            if ((bool) ($validated['send_whatsapp'] ?? true)) {
                $whatsappResult = $this->payrollWhatsAppService->sendSalarySlip($payment, [
                    'previous_paid_in_period' => $previousPaidInPeriod,
                    'remaining_loan_after' => $loanAfter['outstanding'] ?? 0,
                    'attendance_summary' => $attendanceSnapshot,
                    'allowance_breakdown' => $allowanceSnapshot,
                ]);
                $payment = $payment->fresh(['member', 'borrower']);
            }

            return response()->json([
                'message' => 'Pembayaran ' . number_format($nominal, 0, ',', '.') . ' untuk ' . $member->nama . ' berhasil',
                'payment' => $payment,
                'remaining' => $newRemaining,
                'attendance_summary' => $attendanceSnapshot,
                'allowance_breakdown' => $allowanceSnapshot,
                'whatsapp' => $whatsappResult,
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => collect($e->errors())->flatten()->first() ?: $e->getMessage(),
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Failed to pay member', ['member_id' => $memberId, 'error' => $e->getMessage()]);
            return response()->json(['message' => 'Gagal memproses pembayaran: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Riwayat pembayaran anggota + ringkasan absensi
     */
    public function memberPayments(Request $request, $memberId)
    {
        $member = PayrollMember::findOrFail($memberId);
        if (Schema::hasTable('payroll_member_allowances')) {
            $member->load('allowances');
        }

        $payments = \App\Models\PayrollMemberPayment::where('payroll_member_id', $memberId)
            ->with('borrower:id,name')
            ->orderByDesc('created_at')
            ->get();

        $attendanceSummary = $this->attendanceService->getEmployeePayrollAttendanceSummary(
            $member,
            $request->query('start_date'),
            $request->query('end_date')
        );

        $salaryBreakdown = $member->calculateSalaryBreakdown((int) ($attendanceSummary['total_present'] ?? 0));

        $alreadyPaidInPeriod = (float) PayrollMemberPayment::query()
            ->where('payroll_member_id', $memberId)
            ->whereBetween('created_at', [
                Carbon::parse($attendanceSummary['period_start'])->startOfDay(),
                Carbon::parse($attendanceSummary['period_end'])->endOfDay(),
            ])
            ->sum('nominal');

        return response()->json([
            'member' => [
                ...$member->toArray(),
                ...$member->getAllowanceSummaryAttributes(),
            ],
            'payments' => $payments,
            'loan_context' => $this->resolvePayrollBorrowerContext($member),
            'attendance_summary' => $attendanceSummary,
            'salary_breakdown' => $salaryBreakdown,
            'already_paid_in_period' => $alreadyPaidInPeriod,
            'attendance_presets' => $this->attendanceService->getPayrollAttendancePeriodPresets(),
        ]);
    }

    /**
     * Hapus proyek
     */
    public function destroyProject($id)
    {
        DB::beginTransaction();

        try {
            $project = PayrollProject::query()->lockForUpdate()->findOrFail($id);
            if ($project->status === 'paid') {
                DB::rollBack();
                return response()->json(['message' => 'Proyek yang sudah dibayar tidak dapat dihapus'], 422);
            }
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
