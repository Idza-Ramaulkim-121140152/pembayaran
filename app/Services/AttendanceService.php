<?php

namespace App\Services;

use App\Models\EmployeeAttendance;
use App\Models\PayrollMember;
use App\Models\SiteSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AttendanceService
{
    public const SETTING_WORK_START_TIME = 'attendance_work_start_time';
    public const SETTING_WORK_END_TIME = 'attendance_work_end_time';
    public const SETTING_MONTHLY_RESET_DAY = 'attendance_monthly_reset_day';
    public const SETTING_LATE_TOLERANCE = 'attendance_late_tolerance_minutes';

    public const DEFAULT_WORK_START = '08:00';
    public const DEFAULT_WORK_END = '17:00';
    public const DEFAULT_RESET_DAY = 25;
    public const DEFAULT_LATE_TOLERANCE = 0;

    /**
     * Ensure attendance table exists (auto-bootstrap if migration not yet run).
     */
    public function ensureTableExists(): void
    {
        if (!Schema::hasTable('employee_attendances')) {
            try {
                Schema::create('employee_attendances', function (Blueprint $table) {
                    $table->id();
                    $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                    $table->date('date')->index();
                    $table->dateTime('clock_in_at')->nullable();
                    $table->string('clock_in_photo')->nullable();
                    $table->string('clock_in_status', 30)->default('on_time');
                    $table->unsignedInteger('clock_in_late_minutes')->default(0);
                    $table->string('late_reason', 255)->nullable();
                    $table->decimal('clock_in_latitude', 10, 8)->nullable();
                    $table->decimal('clock_in_longitude', 11, 8)->nullable();
                    $table->text('clock_in_notes')->nullable();

                    $table->dateTime('clock_out_at')->nullable();
                    $table->string('clock_out_photo')->nullable();
                    $table->decimal('clock_out_latitude', 10, 8)->nullable();
                    $table->decimal('clock_out_longitude', 11, 8)->nullable();
                    $table->text('clock_out_notes')->nullable();

                    $table->unsignedInteger('work_duration_minutes')->nullable();
                    $table->string('status', 30)->default('present');
                    $table->float('smile_score_in')->nullable();
                    $table->float('smile_score_out')->nullable();

                    $table->string('ip_address', 45)->nullable();
                    $table->text('user_agent')->nullable();
                    $table->timestamps();

                    $table->unique(['user_id', 'date'], 'emp_att_user_date_unique');
                });
            } catch (\Exception $e) {
                Log::warning('Could not auto-create employee_attendances table: ' . $e->getMessage());
            }
        }
    }

    /**
     * Get global attendance settings.
     */
    public function getSettings(): array
    {
        $resetDay = (int) SiteSetting::get(self::SETTING_MONTHLY_RESET_DAY, self::DEFAULT_RESET_DAY);
        if ($resetDay < 1 || $resetDay > 28) {
            $resetDay = self::DEFAULT_RESET_DAY;
        }

        return [
            'work_start_time' => (string) SiteSetting::get(self::SETTING_WORK_START_TIME, self::DEFAULT_WORK_START),
            'work_end_time' => (string) SiteSetting::get(self::SETTING_WORK_END_TIME, self::DEFAULT_WORK_END),
            'monthly_reset_day' => $resetDay,
            'late_tolerance_minutes' => (int) SiteSetting::get(self::SETTING_LATE_TOLERANCE, self::DEFAULT_LATE_TOLERANCE),
        ];
    }

    /**
     * Update global attendance settings.
     */
    public function updateSettings(array $data): array
    {
        if (isset($data['work_start_time'])) {
            SiteSetting::set(self::SETTING_WORK_START_TIME, trim($data['work_start_time']));
        }
        if (isset($data['work_end_time'])) {
            SiteSetting::set(self::SETTING_WORK_END_TIME, trim($data['work_end_time']));
        }
        if (isset($data['monthly_reset_day'])) {
            $day = max(1, min(28, (int) $data['monthly_reset_day']));
            SiteSetting::set(self::SETTING_MONTHLY_RESET_DAY, (string) $day);
        }
        if (isset($data['late_tolerance_minutes'])) {
            $tolerance = max(0, min(120, (int) $data['late_tolerance_minutes']));
            SiteSetting::set(self::SETTING_LATE_TOLERANCE, (string) $tolerance);
        }

        return $this->getSettings();
    }

    /**
     * Calculate period date range based on monthly reset day.
     * Rule: From reset day of previous period until day before next reset day.
     */
    public function getPeriodRange(?Carbon $referenceDate = null, ?int $resetDay = null): array
    {
        $ref = $referenceDate ? $referenceDate->copy()->setTimezone('Asia/Jakarta') : Carbon::today('Asia/Jakarta');
        $day = $resetDay ?? $this->getSettings()['monthly_reset_day'];
        $day = max(1, min(28, (int) $day));

        if ($day === 1) {
            $startDate = $ref->copy()->startOfMonth()->startOfDay();
            $endDate = $ref->copy()->endOfMonth()->endOfDay();
            $nextResetDate = $ref->copy()->addMonthNoOverflow()->startOfMonth()->startOfDay();
        } else {
            if ($ref->day >= $day) {
                $startDate = Carbon::create($ref->year, $ref->month, $day, 0, 0, 0, 'Asia/Jakarta')->startOfDay();
                $nextResetDate = Carbon::create($ref->year, $ref->month, $day, 0, 0, 0, 'Asia/Jakarta')->addMonthNoOverflow()->startOfDay();
                $endDate = $nextResetDate->copy()->subDay()->endOfDay();
            } else {
                $startDate = Carbon::create($ref->year, $ref->month, $day, 0, 0, 0, 'Asia/Jakarta')->subMonthNoOverflow()->startOfDay();
                $nextResetDate = Carbon::create($ref->year, $ref->month, $day, 0, 0, 0, 'Asia/Jakarta')->startOfDay();
                $endDate = $nextResetDate->copy()->subDay()->endOfDay();
            }
        }

        $formattedStart = $startDate->translatedFormat('d M Y');
        $formattedEnd = $endDate->translatedFormat('d M Y');

        return [
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'start_datetime' => $startDate,
            'end_datetime' => $endDate,
            'next_reset_date' => $nextResetDate->toDateString(),
            'reset_day' => $day,
            'label' => "{$formattedStart} - {$formattedEnd}",
        ];
    }

    /**
     * Get employee's today status and current period summary.
     */
    public function getTodayStatus(User $user): array
    {
        $this->ensureTableExists();

        $settings = $this->getSettings();
        $today = Carbon::today('Asia/Jakarta');
        $period = $this->getPeriodRange($today, $settings['monthly_reset_day']);

        $isEmployee = (bool) ($user->is_employee ?? false);

        $attendanceToday = null;
        if ($isEmployee) {
            $attendanceToday = EmployeeAttendance::where('user_id', $user->id)
                ->where('date', $today->toDateString())
                ->first();
        }

        // Summary for current reset period for this employee
        $monthlySummary = [
            'total_present' => 0,
            'total_on_time' => 0,
            'total_late' => 0,
            'total_hours_formatted' => '0 jam',
            'period_label' => $period['label'],
        ];

        if ($isEmployee) {
            $periodRecords = EmployeeAttendance::where('user_id', $user->id)
                ->whereBetween('date', [$period['start_date'], $period['end_date']])
                ->get();

            $totalPresent = $periodRecords->count();
            $totalOnTime = $periodRecords->where('clock_in_status', 'on_time')->count();
            $totalLate = $periodRecords->where('clock_in_status', 'late')->count();
            $totalMinutes = $periodRecords->sum('work_duration_minutes');

            $hours = floor($totalMinutes / 60);
            $mins = $totalMinutes % 60;
            $hoursFormatted = $hours > 0 ? "{$hours} jam {$mins} mnt" : "{$mins} mnt";

            $monthlySummary = [
                'total_present' => $totalPresent,
                'total_on_time' => $totalOnTime,
                'total_late' => $totalLate,
                'total_hours_formatted' => $hoursFormatted,
                'period_label' => $period['label'],
            ];
        }

        // Check if currently late compared to scheduled work_start_time (WIB)
        $startTime = Carbon::createFromTimeString($settings['work_start_time'], 'Asia/Jakarta');
        $workStartToday = $today->copy()->setTime($startTime->hour, $startTime->minute, 0)
            ->addMinutes($settings['late_tolerance_minutes']);
        $now = Carbon::now('Asia/Jakarta');
        $isPastWorkStart = $now->greaterThan($workStartToday);
        $currentLateMinutes = $isPastWorkStart ? (int) $now->diffInMinutes($workStartToday, true) : 0;

        return [
            'is_employee' => $isEmployee,
            'today_date' => $today->toDateString(),
            'today_formatted' => $today->translatedFormat('l, d F Y'),
            'current_time' => $now->format('H:i'),
            'settings' => $settings,
            'period' => $period,
            'attendance_today' => $attendanceToday,
            'monthly_summary' => $monthlySummary,
            'is_past_work_start' => $isPastWorkStart,
            'current_late_minutes' => $currentLateMinutes,
        ];
    }

    /**
     * Process employee Clock In.
     */
    public function clockIn(User $user, array $data, ?string $ip = null, ?string $userAgent = null): EmployeeAttendance
    {
        $this->ensureTableExists();

        if (!(bool) ($user->is_employee ?? false)) {
            throw ValidationException::withMessages([
                'attendance' => 'Akun Anda tidak terdaftar sebagai karyawan.',
            ]);
        }

        $today = Carbon::today('Asia/Jakarta');
        $todayDate = $today->toDateString();

        $existing = EmployeeAttendance::where('user_id', $user->id)
            ->where('date', $todayDate)
            ->first();

        if ($existing && $existing->clock_in_at) {
            throw ValidationException::withMessages([
                'attendance' => 'Anda sudah melakukan absen masuk hari ini pada pukul ' . $existing->clock_in_at->copy()->setTimezone('Asia/Jakarta')->format('H:i') . ' WIB.',
            ]);
        }

        $settings = $this->getSettings();
        $nowWib = Carbon::now('Asia/Jakarta');
        $now = $nowWib->copy()->setTimezone(config('app.timezone', 'UTC'));

        // Calculate schedule and late status in WIB
        $startTime = Carbon::createFromTimeString($settings['work_start_time'], 'Asia/Jakarta');
        $workStartThreshold = $today->copy()->setTime($startTime->hour, $startTime->minute, 0)
            ->addMinutes($settings['late_tolerance_minutes']);

        $isLate = $nowWib->greaterThan($workStartThreshold);
        $lateMinutes = $isLate ? (int) $nowWib->diffInMinutes($workStartThreshold, true) : 0;
        $clockInStatus = $isLate ? 'late' : 'on_time';
        $status = $isLate ? 'late' : 'present';

        $lateReason = null;
        if ($isLate) {
            $lateReason = trim((string) ($data['late_reason'] ?? ''));
            if ($lateReason === '') {
                throw ValidationException::withMessages([
                    'late_reason' => 'Alasan keterlambatan wajib dipilih atau diisi.',
                ]);
            }
        }

        // Process selfie photo
        $photoPath = null;
        if (!empty($data['photo'])) {
            $photoPath = $this->saveBase64Photo($data['photo'], 'in', $user->id);
        }

        $smileScore = isset($data['smile_score']) ? (float) $data['smile_score'] : null;

        $notes = $data['notes'] ?? null;
        if ($lateReason) {
            $notes = "[Alasan Terlambat: {$lateReason}]" . ($notes ? ' ' . $notes : '');
        }

        $latitude = isset($data['latitude']) && is_numeric($data['latitude']) ? (float) $data['latitude'] : null;
        $longitude = isset($data['longitude']) && is_numeric($data['longitude']) ? (float) $data['longitude'] : null;

        $attendance = $existing ?: new EmployeeAttendance();
        $attendance->user_id = $user->id;
        $attendance->date = $todayDate;
        $attendance->clock_in_at = $now;
        $attendance->clock_in_photo = $photoPath ?: $attendance->clock_in_photo;
        $attendance->clock_in_status = $clockInStatus;
        $attendance->clock_in_late_minutes = $lateMinutes;
        if (Schema::hasColumn('employee_attendances', 'late_reason')) {
            $attendance->late_reason = $lateReason;
        }
        if (Schema::hasColumn('employee_attendances', 'clock_in_latitude')) {
            $attendance->clock_in_latitude = $latitude ?: $attendance->clock_in_latitude;
            $attendance->clock_in_longitude = $longitude ?: $attendance->clock_in_longitude;
        }
        $attendance->clock_in_notes = $notes;
        $attendance->status = $status;
        $attendance->smile_score_in = $smileScore;
        $attendance->ip_address = $ip;
        $attendance->user_agent = $userAgent;
        $attendance->save();

        return $attendance->fresh(['user']);
    }

    /**
     * Process employee Clock Out (Optional, max 1x per day).
     */
    public function clockOut(User $user, array $data, ?string $ip = null, ?string $userAgent = null): EmployeeAttendance
    {
        $this->ensureTableExists();

        if (!(bool) ($user->is_employee ?? false)) {
            throw ValidationException::withMessages([
                'attendance' => 'Akun Anda tidak terdaftar sebagai karyawan.',
            ]);
        }

        $today = Carbon::today('Asia/Jakarta');
        $todayDate = $today->toDateString();

        $attendance = EmployeeAttendance::where('user_id', $user->id)
            ->where('date', $todayDate)
            ->first();

        if (!$attendance || !$attendance->clock_in_at) {
            throw ValidationException::withMessages([
                'attendance' => 'Anda belum melakukan absen masuk hari ini. Silakan absen masuk terlebih dahulu.',
            ]);
        }

        if ($attendance->clock_out_at) {
            throw ValidationException::withMessages([
                'attendance' => 'Anda sudah melakukan absen pulang hari ini pada pukul ' . $attendance->clock_out_at->copy()->setTimezone('Asia/Jakarta')->format('H:i') . ' WIB.',
            ]);
        }

        $now = Carbon::now('Asia/Jakarta')->setTimezone(config('app.timezone', 'UTC'));

        // Calculate work duration
        $workDurationMinutes = (int) $attendance->clock_in_at->diffInMinutes($now, true);

        // Process selfie photo
        $photoPath = null;
        if (!empty($data['photo'])) {
            $photoPath = $this->saveBase64Photo($data['photo'], 'out', $user->id);
        }

        $smileScore = isset($data['smile_score']) ? (float) $data['smile_score'] : null;
        $latitude = isset($data['latitude']) && is_numeric($data['latitude']) ? (float) $data['latitude'] : null;
        $longitude = isset($data['longitude']) && is_numeric($data['longitude']) ? (float) $data['longitude'] : null;

        $attendance->clock_out_at = $now;
        if ($photoPath) {
            $attendance->clock_out_photo = $photoPath;
        }
        if (Schema::hasColumn('employee_attendances', 'clock_out_latitude')) {
            $attendance->clock_out_latitude = $latitude;
            $attendance->clock_out_longitude = $longitude;
        }
        $attendance->clock_out_notes = $data['notes'] ?? $attendance->clock_out_notes;
        $attendance->work_duration_minutes = $workDurationMinutes;
        $attendance->smile_score_out = $smileScore;
        $attendance->save();

        return $attendance->fresh(['user']);
    }

    /**
     * Get paginated attendance records with flexible filters.
     */
    public function getRecords(array $filters, int $perPage = 25)
    {
        $this->ensureTableExists();

        $query = EmployeeAttendance::with('user:id,name,email,role,is_employee');

        $this->applyFilters($query, $filters);

        return $query->orderBy('date', 'desc')
            ->orderBy('clock_in_at', 'desc')
            ->paginate($perPage);
    }

    /**
     * Get period KPI summary for superadmin dashboard.
     */
    public function getSummary(array $filters): array
    {
        $this->ensureTableExists();

        $query = EmployeeAttendance::query();
        $this->applyFilters($query, $filters);

        $totalRecords = (clone $query)->count();
        $totalOnTime = (clone $query)->where('clock_in_status', 'on_time')->count();
        $totalLate = (clone $query)->where('clock_in_status', 'late')->count();
        $totalWithClockOut = (clone $query)->whereNotNull('clock_out_at')->count();
        $punctualityRate = $totalRecords > 0 ? round(($totalOnTime / $totalRecords) * 100, 1) : 100;

        return [
            'total_attendances' => $totalRecords,
            'total_on_time' => $totalOnTime,
            'total_late' => $totalLate,
            'total_clock_out' => $totalWithClockOut,
            'punctuality_rate' => $punctualityRate,
        ];
    }

    /**
     * Create manual attendance record by Superadmin.
     */
    public function createManualRecord(array $data): EmployeeAttendance
    {
        $this->ensureTableExists();

        $userId = (int) $data['user_id'];
        $date = Carbon::parse($data['date'])->toDateString();

        $existing = EmployeeAttendance::where('user_id', $userId)
            ->where('date', $date)
            ->first();

        if ($existing) {
            throw ValidationException::withMessages([
                'date' => 'Data absensi untuk karyawan ini pada tanggal tersebut sudah ada.',
            ]);
        }

        $clockInAt = !empty($data['clock_in_at'])
            ? Carbon::parse($data['clock_in_at'], 'Asia/Jakarta')->setTimezone(config('app.timezone', 'UTC'))
            : null;
        $clockOutAt = !empty($data['clock_out_at'])
            ? Carbon::parse($data['clock_out_at'], 'Asia/Jakarta')->setTimezone(config('app.timezone', 'UTC'))
            : null;

        $durationMinutes = null;
        if ($clockInAt && $clockOutAt && $clockOutAt->greaterThan($clockInAt)) {
            $durationMinutes = (int) $clockInAt->diffInMinutes($clockOutAt, true);
        }

        $settings = $this->getSettings();
        $lateMinutes = (int) ($data['clock_in_late_minutes'] ?? 0);
        $clockInStatus = $data['clock_in_status'] ?? ($lateMinutes > 0 ? 'late' : 'on_time');

        if ($clockInAt && empty($data['clock_in_status'])) {
            $startTime = Carbon::createFromTimeString($settings['work_start_time'], 'Asia/Jakarta');
            $threshold = Carbon::parse($date, 'Asia/Jakarta')->setTime($startTime->hour, $startTime->minute, 0);
            $clockInWib = $clockInAt->copy()->setTimezone('Asia/Jakarta');
            if ($clockInWib->greaterThan($threshold)) {
                $clockInStatus = 'late';
                $lateMinutes = (int) $clockInWib->diffInMinutes($threshold, true);
            }
        }

        $status = $data['status'] ?? ($clockInStatus === 'late' ? 'late' : 'present');

        $lateReason = !empty($data['late_reason']) ? trim((string) $data['late_reason']) : null;
        $notes = $data['clock_in_notes'] ?? 'Dibuat manual oleh Admin';
        if ($lateReason && !str_contains($notes, $lateReason)) {
            $notes = "[Alasan Terlambat: {$lateReason}] " . $notes;
        }

        $record = new EmployeeAttendance();
        $record->user_id = $userId;
        $record->date = $date;
        $record->clock_in_at = $clockInAt;
        $record->clock_in_status = $clockInStatus;
        $record->clock_in_late_minutes = $lateMinutes;
        if (Schema::hasColumn('employee_attendances', 'late_reason')) {
            $record->late_reason = $lateReason;
        }
        if (Schema::hasColumn('employee_attendances', 'clock_in_latitude')) {
            $record->clock_in_latitude = isset($data['clock_in_latitude']) && is_numeric($data['clock_in_latitude']) ? (float) $data['clock_in_latitude'] : null;
            $record->clock_in_longitude = isset($data['clock_in_longitude']) && is_numeric($data['clock_in_longitude']) ? (float) $data['clock_in_longitude'] : null;
            $record->clock_out_latitude = isset($data['clock_out_latitude']) && is_numeric($data['clock_out_latitude']) ? (float) $data['clock_out_latitude'] : null;
            $record->clock_out_longitude = isset($data['clock_out_longitude']) && is_numeric($data['clock_out_longitude']) ? (float) $data['clock_out_longitude'] : null;
        }
        $record->clock_in_notes = $notes;
        $record->clock_out_at = $clockOutAt;
        $record->clock_out_notes = $data['clock_out_notes'] ?? null;
        $record->work_duration_minutes = $durationMinutes;
        $record->status = $status;
        $record->save();

        return $record->fresh(['user']);
    }

    /**
     * Edit attendance record by Superadmin.
     */
    public function updateRecord(int $id, array $data): EmployeeAttendance
    {
        $this->ensureTableExists();

        $record = EmployeeAttendance::findOrFail($id);

        if (!empty($data['date'])) {
            $newDate = Carbon::parse($data['date'])->toDateString();
            if ($newDate !== $record->date->toDateString()) {
                $conflict = EmployeeAttendance::where('user_id', $record->user_id)
                    ->where('date', $newDate)
                    ->where('id', '!=', $record->id)
                    ->exists();

                if ($conflict) {
                    throw ValidationException::withMessages([
                        'date' => 'Sudah terdapat data absensi untuk karyawan ini pada tanggal tersebut.',
                    ]);
                }
                $record->date = $newDate;
            }
        }

        if (array_key_exists('clock_in_at', $data)) {
            $record->clock_in_at = !empty($data['clock_in_at'])
                ? Carbon::parse($data['clock_in_at'], 'Asia/Jakarta')->setTimezone(config('app.timezone', 'UTC'))
                : null;
        }

        if (array_key_exists('clock_out_at', $data)) {
            $record->clock_out_at = !empty($data['clock_out_at'])
                ? Carbon::parse($data['clock_out_at'], 'Asia/Jakarta')->setTimezone(config('app.timezone', 'UTC'))
                : null;
        }

        if (isset($data['clock_in_status'])) {
            $record->clock_in_status = $data['clock_in_status'];
        }

        if (isset($data['clock_in_late_minutes'])) {
            $record->clock_in_late_minutes = (int) $data['clock_in_late_minutes'];
        }

        if (isset($data['clock_in_notes'])) {
            $record->clock_in_notes = $data['clock_in_notes'];
        }

        if (isset($data['clock_out_notes'])) {
            $record->clock_out_notes = $data['clock_out_notes'];
        }

        if (array_key_exists('late_reason', $data) && Schema::hasColumn('employee_attendances', 'late_reason')) {
            $record->late_reason = $data['late_reason'] ? trim((string) $data['late_reason']) : null;
        }

        if (Schema::hasColumn('employee_attendances', 'clock_in_latitude')) {
            if (array_key_exists('clock_in_latitude', $data)) {
                $record->clock_in_latitude = is_numeric($data['clock_in_latitude']) ? (float) $data['clock_in_latitude'] : null;
            }
            if (array_key_exists('clock_in_longitude', $data)) {
                $record->clock_in_longitude = is_numeric($data['clock_in_longitude']) ? (float) $data['clock_in_longitude'] : null;
            }
            if (array_key_exists('clock_out_latitude', $data)) {
                $record->clock_out_latitude = is_numeric($data['clock_out_latitude']) ? (float) $data['clock_out_latitude'] : null;
            }
            if (array_key_exists('clock_out_longitude', $data)) {
                $record->clock_out_longitude = is_numeric($data['clock_out_longitude']) ? (float) $data['clock_out_longitude'] : null;
            }
        }

        if (isset($data['status'])) {
            $record->status = $data['status'];
        }

        if ($record->clock_in_at && $record->clock_out_at && $record->clock_out_at->greaterThan($record->clock_in_at)) {
            $record->work_duration_minutes = (int) $record->clock_in_at->diffInMinutes($record->clock_out_at, true);
        }

        $record->save();

        return $record->fresh(['user']);
    }

    /**
     * Delete attendance record.
     */
    public function deleteRecord(int $id): bool
    {
        $this->ensureTableExists();

        $record = EmployeeAttendance::findOrFail($id);

        if ($record->clock_in_photo) {
            Storage::disk('public')->delete($record->clock_in_photo);
        }
        if ($record->clock_out_photo) {
            Storage::disk('public')->delete($record->clock_out_photo);
        }

        return $record->delete();
    }

    /**
     * Helper to apply common query filters.
     */
    protected function applyFilters(Builder $query, array $filters): void
    {
        // Period filtering
        $periodType = $filters['period_type'] ?? 'current';
        $settings = $this->getSettings();

        if ($periodType === 'current') {
            $period = $this->getPeriodRange(Carbon::today(), $settings['monthly_reset_day']);
            $query->whereBetween('date', [$period['start_date'], $period['end_date']]);
        } elseif ($periodType === 'last_month') {
            $period = $this->getPeriodRange(Carbon::today(), $settings['monthly_reset_day']);
            $lastStart = Carbon::parse($period['start_date'])->subMonthNoOverflow();
            $lastPeriod = $this->getPeriodRange($lastStart, $settings['monthly_reset_day']);
            $query->whereBetween('date', [$lastPeriod['start_date'], $lastPeriod['end_date']]);
        } elseif ($periodType === 'custom' && !empty($filters['start_date']) && !empty($filters['end_date'])) {
            $query->whereBetween('date', [$filters['start_date'], $filters['end_date']]);
        }

        // Employee filter
        if (!empty($filters['user_id'])) {
            $query->where('user_id', (int) $filters['user_id']);
        }

        // Status filter
        if (!empty($filters['status']) && $filters['status'] !== 'all') {
            if ($filters['status'] === 'late') {
                $query->where('clock_in_status', 'late');
            } elseif ($filters['status'] === 'on_time') {
                $query->where('clock_in_status', 'on_time');
            } else {
                $query->where('status', $filters['status']);
            }
        }

        // Search user
        if (!empty($filters['search'])) {
            $search = '%' . trim($filters['search']) . '%';
            $query->whereHas('user', function ($q) use ($search) {
                $q->where('name', 'like', $search)
                    ->orWhere('email', 'like', $search);
            });
        }
    }

    /**
     * Save base64 image data to public storage.
     */
    protected function saveBase64Photo(string $base64Data, string $prefix, int $userId): ?string
    {
        try {
            if (preg_match('/^data:image\/(\w+);base64,/', $base64Data, $type)) {
                $data = substr($base64Data, strpos($base64Data, ',') + 1);
                $type = strtolower($type[1]); // jpg, png, jpeg
                if (!in_array($type, ['jpg', 'jpeg', 'png', 'webp'])) {
                    $type = 'jpg';
                }
            } else {
                $data = $base64Data;
                $type = 'jpg';
            }

            $decoded = base64_decode($data);
            if (!$decoded) {
                return null;
            }

            $dateStr = Carbon::now()->format('Ymd_His');
            $random = Str::random(6);
            $filename = "attendance/photos/{$prefix}_{$userId}_{$dateStr}_{$random}.{$type}";

            Storage::disk('public')->put($filename, $decoded);

            return $filename;
        } catch (\Exception $e) {
            Log::error('Failed to save attendance base64 photo: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Resolve the linked user account for a payroll member.
     *
     * @return array{user: ?User, match_method: string}
     */
    public function resolveUserLinkForPayrollMember(PayrollMember $member): array
    {
        if (!Schema::hasTable('users')) {
            return ['user' => null, 'match_method' => 'unlinked'];
        }

        $directUser = User::query()
            ->where('payroll_member_id', $member->id)
            ->first();

        if ($directUser) {
            return ['user' => $directUser, 'match_method' => 'payroll_link'];
        }

        $memberPhoneDigits = $this->normalizePhoneDigits((string) ($member->telepon ?? ''));
        if ($memberPhoneDigits !== '') {
            $phoneMatches = User::query()
                ->whereNotNull('phone')
                ->where('phone', '!=', '')
                ->get()
                ->filter(fn (User $user) => $this->normalizePhoneDigits((string) $user->phone) === $memberPhoneDigits)
                ->values();

            if ($phoneMatches->count() === 1) {
                return ['user' => $phoneMatches->first(), 'match_method' => 'phone_match'];
            }
        }

        $memberName = mb_strtolower(trim((string) ($member->nama ?? '')));
        if ($memberName !== '') {
            $nameMatches = User::query()
                ->where('is_employee', true)
                ->get()
                ->filter(fn (User $user) => mb_strtolower(trim((string) $user->name)) === $memberName)
                ->values();

            if ($nameMatches->count() === 1) {
                return ['user' => $nameMatches->first(), 'match_method' => 'name_match'];
            }
        }

        return ['user' => null, 'match_method' => 'unlinked'];
    }

    public function resolveUserForPayrollMember(PayrollMember $member): ?User
    {
        return $this->resolveUserLinkForPayrollMember($member)['user'];
    }

    /**
     * Summarize attendance & work duration for payroll verification and slip delivery.
     */
    public function getEmployeePayrollAttendanceSummary(
        PayrollMember $member,
        ?string $startDate = null,
        ?string $endDate = null
    ): array {
        $this->ensureTableExists();

        $period = $this->resolveAttendancePeriod($startDate, $endDate);
        $link = $this->resolveUserLinkForPayrollMember($member);
        /** @var ?User $user */
        $user = $link['user'];

        $baseSummary = [
            'linked' => $user !== null,
            'match_method' => $link['match_method'],
            'user' => $user ? [
                'id' => $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
                'role' => $user->role,
            ] : null,
            'period_start' => $period['start_date'],
            'period_end' => $period['end_date'],
            'period_label' => $period['label'],
            'total_present' => 0,
            'total_on_time' => 0,
            'total_late' => 0,
            'total_late_minutes' => 0,
            'total_with_clock_out' => 0,
            'total_work_minutes' => 0,
            'total_hours_formatted' => '0 mnt',
            'average_clock_in' => null,
            'last_clock_in_at' => null,
            'recent_records' => [],
        ];

        if (!$user || !Schema::hasTable('employee_attendances')) {
            return $baseSummary;
        }

        $records = EmployeeAttendance::query()
            ->where('user_id', $user->id)
            ->whereBetween('date', [$period['start_date'], $period['end_date']])
            ->orderByDesc('date')
            ->get();

        $presentRecords = $records->filter(
            fn (EmployeeAttendance $r) => $r->clock_in_at !== null || in_array($r->status, ['present', 'late'], true)
        );

        $totalPresent = $presentRecords->count();
        $totalOnTime = $presentRecords->where('clock_in_status', 'on_time')->count();
        $totalLate = $presentRecords->where('clock_in_status', 'late')->count();
        $totalLateMinutes = (int) $presentRecords->sum('clock_in_late_minutes');
        $totalWithClockOut = $presentRecords->filter(fn (EmployeeAttendance $r) => $r->clock_out_at !== null)->count();
        $totalWorkMinutes = (int) $presentRecords->sum('work_duration_minutes');

        $clockInSeconds = $presentRecords
            ->filter(fn (EmployeeAttendance $r) => $r->clock_in_at !== null)
            ->map(function (EmployeeAttendance $r): int {
                $t = $r->clock_in_at->copy()->setTimezone('Asia/Jakarta');
                return ($t->hour * 3600) + ($t->minute * 60) + $t->second;
            });

        $avgClockIn = null;
        if ($clockInSeconds->count() > 0) {
            $avgSecs = (int) round($clockInSeconds->avg());
            $avgClockIn = sprintf('%02d:%02d', intdiv($avgSecs, 3600), intdiv($avgSecs % 3600, 60));
        }

        $latest = $presentRecords->first(fn (EmployeeAttendance $r) => $r->clock_in_at !== null);

        $hours = intdiv($totalWorkMinutes, 60);
        $mins = $totalWorkMinutes % 60;
        $totalHoursFormatted = $hours > 0 ? "{$hours} jam {$mins} mnt" : "{$mins} mnt";

        $baseSummary['total_present'] = $totalPresent;
        $baseSummary['total_on_time'] = $totalOnTime;
        $baseSummary['total_late'] = $totalLate;
        $baseSummary['total_late_minutes'] = $totalLateMinutes;
        $baseSummary['total_with_clock_out'] = $totalWithClockOut;
        $baseSummary['total_work_minutes'] = $totalWorkMinutes;
        $baseSummary['total_hours_formatted'] = $totalHoursFormatted;
        $baseSummary['average_clock_in'] = $avgClockIn;
        $baseSummary['last_clock_in_at'] = $latest?->clock_in_at?->copy()?->setTimezone('Asia/Jakarta')?->format('d/m H:i');
        $baseSummary['recent_records'] = $records->take(31)->map(function (EmployeeAttendance $record): array {
            return [
                'id' => $record->id,
                'date' => $record->date?->toDateString(),
                'date_formatted' => $record->date?->translatedFormat('d M Y'),
                'clock_in_at' => $record->clock_in_at?->copy()?->setTimezone('Asia/Jakarta')?->format('H:i'),
                'clock_out_at' => $record->clock_out_at?->copy()?->setTimezone('Asia/Jakarta')?->format('H:i'),
                'clock_in_status' => $record->clock_in_status,
                'clock_in_late_minutes' => (int) ($record->clock_in_late_minutes ?? 0),
                'work_duration_minutes' => (int) ($record->work_duration_minutes ?? 0),
                'work_duration_formatted' => $record->work_duration_formatted,
                'status' => $record->status,
            ];
        })->values()->all();

        return $baseSummary;
    }

    /**
     * Provide period presets for UI inspection inside payroll modal.
     *
     * @return array<int, array{key: string, label: string, start_date: string, end_date: string}>
     */
    public function getPayrollAttendancePeriodPresets(): array
    {
        $today = Carbon::today('Asia/Jakarta');
        $resetPeriod = $this->getPeriodRange($today);
        $prevResetPeriod = $this->getPeriodRange(
            Carbon::parse($resetPeriod['start_date'], 'Asia/Jakarta')->subDay(),
            (int) $resetPeriod['reset_day']
        );
        $currentMonthStart = $today->copy()->startOfMonth();
        $currentMonthEnd = $today->copy()->endOfMonth();
        $prevMonthStart = $today->copy()->subMonthNoOverflow()->startOfMonth();
        $prevMonthEnd = $today->copy()->subMonthNoOverflow()->endOfMonth();

        return [
            [
                'key' => 'reset_current',
                'label' => 'Periode Absensi Berjalan (' . $resetPeriod['label'] . ')',
                'start_date' => $resetPeriod['start_date'],
                'end_date' => $resetPeriod['end_date'],
            ],
            [
                'key' => 'reset_previous',
                'label' => 'Periode Absensi Sebelumnya (' . $prevResetPeriod['label'] . ')',
                'start_date' => $prevResetPeriod['start_date'],
                'end_date' => $prevResetPeriod['end_date'],
            ],
            [
                'key' => 'month_current',
                'label' => 'Bulan Ini (' . $currentMonthStart->translatedFormat('F Y') . ')',
                'start_date' => $currentMonthStart->toDateString(),
                'end_date' => $currentMonthEnd->toDateString(),
            ],
            [
                'key' => 'month_previous',
                'label' => 'Bulan Lalu (' . $prevMonthStart->translatedFormat('F Y') . ')',
                'start_date' => $prevMonthStart->toDateString(),
                'end_date' => $prevMonthEnd->toDateString(),
            ],
        ];
    }

    private function resolveAttendancePeriod(?string $startDate, ?string $endDate): array
    {
        if ($startDate && $endDate) {
            try {
                $start = Carbon::parse($startDate)->startOfDay();
                $end = Carbon::parse($endDate)->endOfDay();
                if ($start->gt($end)) {
                    [$start, $end] = [$end->copy()->startOfDay(), $start->copy()->endOfDay()];
                }

                return [
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
                    'label' => $start->translatedFormat('d M Y') . ' - ' . $end->translatedFormat('d M Y'),
                ];
            } catch (\Throwable) {
                // Fall back to configured reset period if query dates are malformed.
            }
        }

        return $this->getPeriodRange(Carbon::today());
    }

    private function normalizePhoneDigits(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '0')) {
            return '62' . substr($digits, 1);
        }

        return $digits;
    }
}
