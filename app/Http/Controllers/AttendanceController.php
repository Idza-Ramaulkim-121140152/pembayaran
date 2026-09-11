<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\AttendanceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttendanceController extends Controller
{
    public function __construct(protected AttendanceService $attendanceService)
    {
    }

    /**
     * Get employee's today attendance status and monthly stats.
     */
    public function today(Request $request): JsonResponse
    {
        $user = $request->user();
        $status = $this->attendanceService->getTodayStatus($user);

        return response()->json([
            'success' => true,
            'data' => $status,
        ]);
    }

    /**
     * Employee Clock In (wajib, max 1x per hari).
     */
    public function clockIn(Request $request): JsonResponse
    {
        $request->validate([
            'photo' => 'nullable|string',
            'smile_score' => 'nullable|numeric|min:0|max:1',
            'late_reason' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:500',
        ]);

        $attendance = $this->attendanceService->clockIn(
            $request->user(),
            $request->only(['photo', 'smile_score', 'late_reason', 'notes']),
            $request->ip(),
            $request->userAgent()
        );

        $statusLabel = $attendance->clock_in_status === 'late'
            ? " (Terlambat {$attendance->clock_in_late_minutes} menit)"
            : " (Tepat Waktu)";

        return response()->json([
            'success' => true,
            'message' => "Absensi masuk berhasil dicatat{$statusLabel}. Selamat bekerja!",
            'data' => $attendance,
        ]);
    }

    /**
     * Employee Clock Out (opsional, max 1x per hari).
     */
    public function clockOut(Request $request): JsonResponse
    {
        $request->validate([
            'photo' => 'nullable|string',
            'smile_score' => 'nullable|numeric|min:0|max:1',
            'notes' => 'nullable|string|max:500',
        ]);

        $attendance = $this->attendanceService->clockOut(
            $request->user(),
            $request->only(['photo', 'smile_score', 'notes']),
            $request->ip(),
            $request->userAgent()
        );

        return response()->json([
            'success' => true,
            'message' => "Absensi pulang berhasil dicatat (Durasi: {$attendance->work_duration_formatted}). Sampai jumpa!",
            'data' => $attendance,
        ]);
    }

    /**
     * Get global settings for Superadmin.
     */
    public function getSettings(): JsonResponse
    {
        $settings = $this->attendanceService->getSettings();
        $currentPeriod = $this->attendanceService->getPeriodRange(Carbon::today(), $settings['monthly_reset_day']);

        return response()->json([
            'success' => true,
            'data' => [
                'settings' => $settings,
                'current_period' => $currentPeriod,
            ],
        ]);
    }

    /**
     * Update global settings for Superadmin.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'work_start_time' => 'required|string|regex:/^\d{2}:\d{2}$/',
            'work_end_time' => 'required|string|regex:/^\d{2}:\d{2}$/',
            'monthly_reset_day' => 'required|integer|min:1|max:28',
            'late_tolerance_minutes' => 'nullable|integer|min:0|max:120',
        ]);

        $settings = $this->attendanceService->updateSettings($validated);
        $period = $this->attendanceService->getPeriodRange(Carbon::today(), $settings['monthly_reset_day']);

        return response()->json([
            'success' => true,
            'message' => 'Pengaturan jam kerja dan tanggal reset bulanan berhasil disimpan.',
            'data' => [
                'settings' => $settings,
                'current_period' => $period,
            ],
        ]);
    }

    /**
     * List attendance records for Superadmin with filtering and summary.
     */
    public function records(Request $request): JsonResponse
    {
        $filters = $request->only(['period_type', 'start_date', 'end_date', 'user_id', 'status', 'search']);
        $perPage = max(10, min(100, (int) $request->get('per_page', 25)));

        $records = $this->attendanceService->getRecords($filters, $perPage);
        $summary = $this->attendanceService->getSummary($filters);
        $settings = $this->attendanceService->getSettings();
        $currentPeriod = $this->attendanceService->getPeriodRange(Carbon::today(), $settings['monthly_reset_day']);

        // List of all employees for dropdown filter
        $employees = User::where('is_employee', true)
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role']);

        return response()->json([
            'success' => true,
            'data' => [
                'records' => $records,
                'summary' => $summary,
                'settings' => $settings,
                'current_period' => $currentPeriod,
                'employees' => $employees,
            ],
        ]);
    }

    /**
     * Create manual attendance record by Superadmin.
     */
    public function storeRecord(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'date' => 'required|date',
            'clock_in_at' => 'nullable|date',
            'clock_in_status' => 'nullable|string|in:on_time,late',
            'clock_in_late_minutes' => 'nullable|integer|min:0',
            'late_reason' => 'nullable|string|max:255',
            'clock_in_notes' => 'nullable|string|max:500',
            'clock_out_at' => 'nullable|date|after_or_equal:clock_in_at',
            'clock_out_notes' => 'nullable|string|max:500',
            'status' => 'nullable|string|in:present,late,leave,sick,alpha',
        ]);

        $record = $this->attendanceService->createManualRecord($validated);

        return response()->json([
            'success' => true,
            'message' => 'Data absensi manual berhasil ditambahkan.',
            'data' => $record,
        ]);
    }

    /**
     * Update attendance record by Superadmin.
     */
    public function updateRecord(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'date' => 'sometimes|required|date',
            'clock_in_at' => 'nullable|date',
            'clock_in_status' => 'nullable|string|in:on_time,late',
            'clock_in_late_minutes' => 'nullable|integer|min:0',
            'late_reason' => 'nullable|string|max:255',
            'clock_in_notes' => 'nullable|string|max:500',
            'clock_out_at' => 'nullable|date',
            'clock_out_notes' => 'nullable|string|max:500',
            'status' => 'nullable|string|in:present,late,leave,sick,alpha',
        ]);

        $record = $this->attendanceService->updateRecord($id, $validated);

        return response()->json([
            'success' => true,
            'message' => 'Data absensi berhasil diperbarui.',
            'data' => $record,
        ]);
    }

    /**
     * Delete attendance record by Superadmin.
     */
    public function destroyRecord(int $id): JsonResponse
    {
        $this->attendanceService->deleteRecord($id);

        return response()->json([
            'success' => true,
            'message' => 'Data absensi berhasil dihapus.',
        ]);
    }

    /**
     * Export attendance data as CSV.
     */
    public function export(Request $request): StreamedResponse
    {
        $filters = $request->only(['period_type', 'start_date', 'end_date', 'user_id', 'status', 'search']);
        $records = $this->attendanceService->getRecords($filters, 5000);

        $dateStr = Carbon::now()->format('Y-m-d_His');
        $filename = "rekap_absensi_{$dateStr}.csv";

        return response()->streamDownload(function () use ($records) {
            $handle = fopen('php://output', 'w');
            // Write UTF-8 BOM for Excel compatibility
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF));

            fputcsv($handle, [
                'ID',
                'Tanggal',
                'Nama Karyawan',
                'Email',
                'Role',
                'Jam Masuk',
                'Status Masuk',
                'Keterlambatan (Menit)',
                'Alasan Terlambat',
                'Jam Pulang',
                'Durasi Kerja',
                'Status Absensi',
                'Catatan Masuk',
                'Catatan Pulang',
            ]);

            foreach ($records as $item) {
                fputcsv($handle, [
                    $item->id,
                    $item->date ? $item->date->format('Y-m-d') : '',
                    $item->user?->name ?? '-',
                    $item->user?->email ?? '-',
                    $item->user?->role ?? '-',
                    $item->clock_in_at ? $item->clock_in_at->format('H:i:s') : '-',
                    $item->clock_in_status === 'late' ? 'Terlambat' : 'Tepat Waktu',
                    $item->clock_in_late_minutes ?? 0,
                    $item->late_reason ?? '-',
                    $item->clock_out_at ? $item->clock_out_at->format('H:i:s') : '-',
                    $item->work_duration_formatted ?? '-',
                    $item->status ?? 'present',
                    $item->clock_in_notes ?? '',
                    $item->clock_out_notes ?? '',
                ]);
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
