<?php

namespace App\Services;

use App\Models\EmployeeAttendance;
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
                    $table->text('clock_in_notes')->nullable();

                    $table->dateTime('clock_out_at')->nullable();
                    $table->string('clock_out_photo')->nullable();
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
        $ref = $referenceDate ? $referenceDate->copy() : Carbon::today();
        $day = $resetDay ?? $this->getSettings()['monthly_reset_day'];
        $day = max(1, min(28, (int) $day));

        if ($day === 1) {
            $startDate = $ref->copy()->startOfMonth()->startOfDay();
            $endDate = $ref->copy()->endOfMonth()->endOfDay();
            $nextResetDate = $ref->copy()->addMonthNoOverflow()->startOfMonth()->startOfDay();
        } else {
            if ($ref->day >= $day) {
                $startDate = Carbon::create($ref->year, $ref->month, $day)->startOfDay();
                $nextResetDate = Carbon::create($ref->year, $ref->month, $day)->addMonthNoOverflow()->startOfDay();
                $endDate = $nextResetDate->copy()->subDay()->endOfDay();
            } else {
                $startDate = Carbon::create($ref->year, $ref->month, $day)->subMonthNoOverflow()->startOfDay();
                $nextResetDate = Carbon::create($ref->year, $ref->month, $day)->startOfDay();
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
        $today = Carbon::today();
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

        // Check if currently late compared to scheduled work_start_time
        $startTime = Carbon::createFromTimeString($settings['work_start_time']);
        $workStartToday = $today->copy()->setTime($startTime->hour, $startTime->minute, 0)
            ->addMinutes($settings['late_tolerance_minutes']);
        $now = Carbon::now();
        $isPastWorkStart = $now->greaterThan($workStartToday);
        $currentLateMinutes = $isPastWorkStart ? $now->diffInMinutes($workStartToday) : 0;

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

        $today = Carbon::today();
        $todayDate = $today->toDateString();

        $existing = EmployeeAttendance::where('user_id', $user->id)
            ->where('date', $todayDate)
            ->first();

        if ($existing && $existing->clock_in_at) {
            throw ValidationException::withMessages([
                'attendance' => 'Anda sudah melakukan absen masuk hari ini pada pukul ' . $existing->clock_in_at->format('H:i') . ' WIB.',
            ]);
        }

        $settings = $this->getSettings();
        $now = Carbon::now();

        // Calculate schedule and late status
        $startTime = Carbon::createFromTimeString($settings['work_start_time']);
        $workStartThreshold = $today->copy()->setTime($startTime->hour, $startTime->minute, 0)
            ->addMinutes($settings['late_tolerance_minutes']);

        $isLate = $now->greaterThan($workStartThreshold);
        $lateMinutes = $isLate ? (int) $now->diffInMinutes($workStartThreshold) : 0;
        $clockInStatus = $isLate ? 'late' : 'on_time';
        $status = $isLate ? 'late' : 'present';

        // Process selfie photo
        $photoPath = null;
        if (!empty($data['photo'])) {
            $photoPath = $this->saveBase64Photo($data['photo'], 'in', $user->id);
        }

        $smileScore = isset($data['smile_score']) ? (float) $data['smile_score'] : null;

        $attendance = $existing ?: new EmployeeAttendance();
        $attendance->user_id = $user->id;
        $attendance->date = $todayDate;
        $attendance->clock_in_at = $now;
        $attendance->clock_in_photo = $photoPath ?: $attendance->clock_in_photo;
        $attendance->clock_in_status = $clockInStatus;
        $attendance->clock_in_late_minutes = $lateMinutes;
        $attendance->clock_in_notes = $data['notes'] ?? null;
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

        $today = Carbon::today();
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
                'attendance' => 'Anda sudah melakukan absen pulang hari ini pada pukul ' . $attendance->clock_out_at->format('H:i') . ' WIB.',
            ]);
        }

        $now = Carbon::now();

        // Calculate work duration
        $workDurationMinutes = (int) $attendance->clock_in_at->diffInMinutes($now);

        // Process selfie photo
        $photoPath = null;
        if (!empty($data['photo'])) {
            $photoPath = $this->saveBase64Photo($data['photo'], 'out', $user->id);
        }

        $smileScore = isset($data['smile_score']) ? (float) $data['smile_score'] : null;

        $attendance->clock_out_at = $now;
        if ($photoPath) {
            $attendance->clock_out_photo = $photoPath;
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

        $clockInAt = !empty($data['clock_in_at']) ? Carbon::parse($data['clock_in_at']) : null;
        $clockOutAt = !empty($data['clock_out_at']) ? Carbon::parse($data['clock_out_at']) : null;

        $durationMinutes = null;
        if ($clockInAt && $clockOutAt && $clockOutAt->greaterThan($clockInAt)) {
            $durationMinutes = (int) $clockInAt->diffInMinutes($clockOutAt);
        }

        $settings = $this->getSettings();
        $lateMinutes = (int) ($data['clock_in_late_minutes'] ?? 0);
        $clockInStatus = $data['clock_in_status'] ?? ($lateMinutes > 0 ? 'late' : 'on_time');

        if ($clockInAt && empty($data['clock_in_status'])) {
            $startTime = Carbon::createFromTimeString($settings['work_start_time']);
            $threshold = Carbon::parse($date)->setTime($startTime->hour, $startTime->minute, 0);
            if ($clockInAt->greaterThan($threshold)) {
                $clockInStatus = 'late';
                $lateMinutes = (int) $clockInAt->diffInMinutes($threshold);
            }
        }

        $status = $data['status'] ?? ($clockInStatus === 'late' ? 'late' : 'present');

        $record = new EmployeeAttendance();
        $record->user_id = $userId;
        $record->date = $date;
        $record->clock_in_at = $clockInAt;
        $record->clock_in_status = $clockInStatus;
        $record->clock_in_late_minutes = $lateMinutes;
        $record->clock_in_notes = $data['clock_in_notes'] ?? 'Dibuat manual oleh Admin';
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
            $record->clock_in_at = !empty($data['clock_in_at']) ? Carbon::parse($data['clock_in_at']) : null;
        }

        if (array_key_exists('clock_out_at', $data)) {
            $record->clock_out_at = !empty($data['clock_out_at']) ? Carbon::parse($data['clock_out_at']) : null;
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

        if (isset($data['status'])) {
            $record->status = $data['status'];
        }

        if ($record->clock_in_at && $record->clock_out_at && $record->clock_out_at->greaterThan($record->clock_in_at)) {
            $record->work_duration_minutes = (int) $record->clock_in_at->diffInMinutes($record->clock_out_at);
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
}
