<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class EmployeeAttendance extends Model
{
    use HasFactory;

    protected $table = 'employee_attendances';

    protected $fillable = [
        'user_id',
        'date',
        'clock_in_at',
        'clock_in_photo',
        'clock_in_status',
        'clock_in_late_minutes',
        'late_reason',
        'clock_in_latitude',
        'clock_in_longitude',
        'clock_in_notes',
        'clock_out_at',
        'clock_out_photo',
        'clock_out_latitude',
        'clock_out_longitude',
        'clock_out_notes',
        'work_duration_minutes',
        'status',
        'smile_score_in',
        'smile_score_out',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'date' => 'date',
        'clock_in_at' => 'datetime',
        'clock_out_at' => 'datetime',
        'clock_in_late_minutes' => 'integer',
        'clock_in_latitude' => 'float',
        'clock_in_longitude' => 'float',
        'clock_out_latitude' => 'float',
        'clock_out_longitude' => 'float',
        'work_duration_minutes' => 'integer',
        'smile_score_in' => 'float',
        'smile_score_out' => 'float',
    ];

    protected $appends = [
        'work_duration_formatted',
        'photo_in_url',
        'photo_out_url',
        'clock_in_maps_url',
        'clock_out_maps_url',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function getWorkDurationFormattedAttribute(): ?string
    {
        if ($this->work_duration_minutes === null) {
            return null;
        }

        $hours = floor($this->work_duration_minutes / 60);
        $minutes = $this->work_duration_minutes % 60;

        if ($hours > 0 && $minutes > 0) {
            return "{$hours} jam {$minutes} mnt";
        } elseif ($hours > 0) {
            return "{$hours} jam";
        } else {
            return "{$minutes} mnt";
        }
    }

    public function getPhotoInUrlAttribute(): ?string
    {
        if (!$this->clock_in_photo) {
            return null;
        }

        if (str_starts_with($this->clock_in_photo, 'http://') || str_starts_with($this->clock_in_photo, 'https://')) {
            return $this->clock_in_photo;
        }

        return Storage::disk('public')->url($this->clock_in_photo);
    }

    public function getPhotoOutUrlAttribute(): ?string
    {
        if (!$this->clock_out_photo) {
            return null;
        }

        if (str_starts_with($this->clock_out_photo, 'http://') || str_starts_with($this->clock_out_photo, 'https://')) {
            return $this->clock_out_photo;
        }

        return Storage::disk('public')->url($this->clock_out_photo);
    }

    public function getClockInMapsUrlAttribute(): ?string
    {
        if ($this->clock_in_latitude !== null && $this->clock_in_longitude !== null) {
            return "https://www.google.com/maps?q={$this->clock_in_latitude},{$this->clock_in_longitude}";
        }
        return null;
    }

    public function getClockOutMapsUrlAttribute(): ?string
    {
        if ($this->clock_out_latitude !== null && $this->clock_out_longitude !== null) {
            return "https://www.google.com/maps?q={$this->clock_out_latitude},{$this->clock_out_longitude}";
        }
        return null;
    }

    public function scopePeriod($query, $startDate, $endDate)
    {
        return $query->whereBetween('date', [$startDate, $endDate]);
    }
}
