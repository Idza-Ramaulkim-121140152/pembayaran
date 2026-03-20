<?php

namespace App\Http\Controllers;

use App\Models\PayrollMember;
use App\Models\PayrollProject;
use App\Models\PayrollProjectDetail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PayrollController extends Controller
{
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
            ->get();

        // Daftar proyek
        $query = PayrollProject::with(['members', 'details'])
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
            'details.*.jumlah' => 'required|numeric|min:0',
            'details.*.harga_satuan' => 'required|numeric|min:0',
        ]);

        try {
            DB::beginTransaction();

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
                PayrollProjectDetail::create([
                    'payroll_project_id' => $project->id,
                    'tipe' => $detail['tipe'],
                    'deskripsi' => $detail['deskripsi'] ?? null,
                    'jumlah' => $detail['jumlah'],
                    'harga_satuan' => $detail['harga_satuan'],
                    'subtotal' => $subtotal,
                ]);
            }

            // Recalculate total and distribute to members
            $project->recalculate();

            DB::commit();

            $project->load(['members', 'details']);
            return response()->json(['data' => $project, 'message' => 'Proyek berhasil ditambahkan'], 201);
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
            'details.*.jumlah' => 'required|numeric|min:0',
            'details.*.harga_satuan' => 'required|numeric|min:0',
        ]);

        try {
            DB::beginTransaction();

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
                PayrollProjectDetail::create([
                    'payroll_project_id' => $project->id,
                    'tipe' => $detail['tipe'],
                    'deskripsi' => $detail['deskripsi'] ?? null,
                    'jumlah' => $detail['jumlah'],
                    'harga_satuan' => $detail['harga_satuan'],
                    'subtotal' => $subtotal,
                ]);
            }

            // Recalculate
            $project->recalculate();

            DB::commit();

            $project->load(['members', 'details']);
            return response()->json(['data' => $project, 'message' => 'Proyek berhasil diperbarui']);
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

        $nominal = min($validated['nominal'], $remaining); // jangan lebih dari sisa

        try {
            $payment = \App\Models\PayrollMemberPayment::create([
                'payroll_member_id' => $memberId,
                'nominal' => $nominal,
                'catatan' => $validated['catatan'] ?? null,
            ]);

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
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'member' => $member,
            'payments' => $payments,
        ]);
    }

    /**
     * Hapus proyek
     */
    public function destroyProject($id)
    {
        $project = PayrollProject::findOrFail($id);
        $project->delete();

        return response()->json(['message' => 'Proyek berhasil dihapus']);
    }

    /**
     * Detail satu proyek
     */
    public function showProject($id)
    {
        $project = PayrollProject::with(['members', 'details'])->findOrFail($id);
        return response()->json(['data' => $project]);
    }
}
