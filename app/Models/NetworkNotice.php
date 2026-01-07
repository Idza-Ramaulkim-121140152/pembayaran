<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NetworkNotice extends Model
{
    protected $fillable = [
        'title',
        'message',
        'type',
        'severity',
        'is_mass',
        'affected_area',
        'affected_odp',
        'start_time',
        'end_time',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'is_mass' => 'boolean',
        'is_active' => 'boolean',
        'start_time' => 'datetime',
        'end_time' => 'datetime',
    ];

    // Relasi ke user yang membuat
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // Scope untuk notice yang aktif
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // Scope untuk gangguan
    public function scopeGangguan($query)
    {
        return $query->where('type', 'gangguan');
    }

    // Scope untuk maintenance
    public function scopeMaintenance($query)
    {
        return $query->where('type', 'maintenance');
    }

    // Scope untuk gangguan massal
    public function scopeMass($query)
    {
        return $query->where('is_mass', true);
    }

    // Cek apakah notice masih berlaku (berdasarkan waktu)
    public function isOngoing()
    {
        $now = now();
        
        // Jika tidak ada waktu, dianggap ongoing selama aktif
        if (!$this->start_time && !$this->end_time) {
            return $this->is_active;
        }

        // Jika ada start_time tapi belum waktunya
        if ($this->start_time && $now->lt($this->start_time)) {
            return false;
        }

        // Jika ada end_time dan sudah lewat
        if ($this->end_time && $now->gt($this->end_time)) {
            return false;
        }

        return $this->is_active;
    }

    // Scope untuk notice yang sedang berlaku
    public function scopeOngoing($query)
    {
        $now = now();
        
        return $query->where('is_active', true)
            ->where(function ($q) use ($now) {
                $q->where(function ($q2) use ($now) {
                    // Sudah mulai atau tidak ada start_time
                    $q2->whereNull('start_time')
                       ->orWhere('start_time', '<=', $now);
                })
                ->where(function ($q2) use ($now) {
                    // Belum selesai atau tidak ada end_time
                    $q2->whereNull('end_time')
                       ->orWhere('end_time', '>=', $now);
                });
            });
    }

    // Get severity color
    public function getSeverityColorAttribute()
    {
        return match($this->severity) {
            'low' => 'blue',
            'medium' => 'yellow',
            'high' => 'orange',
            'critical' => 'red',
            default => 'gray',
        };
    }

    // Get type label
    public function getTypeLabelAttribute()
    {
        return match($this->type) {
            'gangguan' => 'Gangguan',
            'maintenance' => 'Perbaikan Terjadwal',
            default => $this->type,
        };
    }

    // Get severity label
    public function getSeverityLabelAttribute()
    {
        return match($this->severity) {
            'low' => 'Ringan',
            'medium' => 'Sedang',
            'high' => 'Tinggi',
            'critical' => 'Kritis',
            default => $this->severity,
        };
    }

    // Get affected ODP as array
    public function getAffectedOdpArrayAttribute()
    {
        if (!$this->affected_odp) {
            return [];
        }
        return array_map('trim', explode(',', $this->affected_odp));
    }
}
