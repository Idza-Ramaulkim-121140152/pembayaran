<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TechnicianJob extends Model
{
    use HasFactory;

    protected $table = 'technician_jobs';

    const TYPE_GANGGUAN_PELANGGAN = 'gangguan_pelanggan';
    const TYPE_GANGGUAN_MASSAL = 'gangguan_massal';
    const TYPE_PEMASANGAN_BARU = 'pemasangan_baru';
    const TYPE_LAINNYA = 'lainnya';

    const STATUS_ACTIVE = 'active';
    const STATUS_COMPLETED = 'completed';
    const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'job_number',
        'type',
        'title',
        'description',
        'customer_id',
        'scope_type',
        'wilayah_type',
        'wilayah_id',
        'odp_id',
        'status',
        'priority',
        'created_by',
        'completed_by',
        'completed_at',
        'completion_proof_url',
        'completion_notes',
        'scheduled_notify_at',
        'notified_at',
        'last_reminder_at',
    ];

    protected $casts = [
        'completed_at' => 'datetime',
        'scheduled_notify_at' => 'datetime',
        'notified_at' => 'datetime',
        'last_reminder_at' => 'datetime',
    ];

    protected $appends = [
        'type_label',
        'status_label',
        'target_summary',
        'formatted_copy_text',
    ];

    public function technicians()
    {
        return $this->belongsToMany(User::class, 'technician_job_assignments', 'job_id', 'user_id')
            ->withTimestamps();
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function customers()
    {
        return $this->belongsToMany(Customer::class, 'technician_job_customers', 'job_id', 'customer_id')
            ->withTimestamps();
    }

    public function odp()
    {
        return $this->belongsTo(Odp::class, 'odp_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function completer()
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function scopeActive($query)
    {
        return $query->where('status', self::STATUS_ACTIVE);
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', self::STATUS_COMPLETED);
    }

    public function scopeForUser($query, User $user)
    {
        if ($user->isAdmin() || $user->isSuperAdmin()) {
            return $query;
        }

        return $query->whereHas('technicians', function ($q) use ($user) {
            $q->where('users.id', $user->id);
        });
    }

    public function getTypeLabelAttribute(): string
    {
        return match ($this->type) {
            self::TYPE_GANGGUAN_PELANGGAN => 'Gangguan Pelanggan (1 Rumah)',
            self::TYPE_GANGGUAN_MASSAL => 'Gangguan Massal',
            self::TYPE_PEMASANGAN_BARU => 'Pemasangan Baru',
            self::TYPE_LAINNYA => 'Pekerjaan Lainnya',
            default => ucfirst(str_replace('_', ' ', $this->type ?? 'Pekerjaan')),
        };
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            self::STATUS_ACTIVE => 'Aktif',
            self::STATUS_COMPLETED => 'Selesai',
            self::STATUS_CANCELLED => 'Dibatalkan',
            default => ucfirst($this->status ?? 'Aktif'),
        };
    }

    public function getTargetSummaryAttribute(): string
    {
        if ($this->type === self::TYPE_GANGGUAN_PELANGGAN || $this->type === self::TYPE_PEMASANGAN_BARU) {
            if ($this->customer) {
                $phone = $this->customer->phone ? ' (' . $this->customer->phone . ')' : '';
                $addr = $this->customer->address ? ' - ' . $this->customer->address : '';
                return $this->customer->name . $phone . $addr;
            }
        }

        if ($this->scope_type === 'odp' && $this->odp) {
            $odpName = $this->odp->nama ?: $this->odp->name ?: ('ODP #' . $this->odp->id);
            $count = $this->customers()->count();
            return "ODP {$odpName}" . ($count > 0 ? " ({$count} Pelanggan)" : '');
        }

        if ($this->scope_type === 'wilayah') {
            $wilayahName = $this->resolveWilayahName();
            if ($wilayahName) {
                $count = $this->customers()->count();
                return "Wilayah {$wilayahName}" . ($count > 0 ? " ({$count} Pelanggan)" : '');
            }
        }

        $customerCount = $this->customers()->count();
        if ($customerCount > 0) {
            return "{$customerCount} Pelanggan Terkait";
        }

        return $this->title ?? 'Pekerjaan Operasional';
    }

    public function resolveWilayahName(): ?string
    {
        if (!$this->wilayah_id || !$this->wilayah_type) {
            return null;
        }

        try {
            if ($this->wilayah_type === 'desa') {
                return MasterWilayahDesa::find($this->wilayah_id)?->name;
            }
            if ($this->wilayah_type === 'dusun') {
                return MasterWilayahDusun::find($this->wilayah_id)?->name;
            }
            if ($this->wilayah_type === 'kecamatan') {
                return MasterWilayahKecamatan::find($this->wilayah_id)?->name;
            }
        } catch (\Throwable) {
            return null;
        }

        return null;
    }

    public function getFormattedCopyTextAttribute(): string
    {
        $techNames = $this->technicians->pluck('name')->filter()->join(', ') ?: 'Belum ditentukan';
        $priorityEmoji = match ($this->priority) {
            'urgent' => '🚨 Mendesak',
            'high' => '⚠️ Tinggi',
            default => '🔵 Normal',
        };

        $statusEmoji = match ($this->status) {
            self::STATUS_COMPLETED => '✅ SELESAI',
            self::STATUS_CANCELLED => '❌ DIBATALKAN',
            default => '⚡ AKTIF (Dalam Pengerjaan)',
        };

        $appUrl = rtrim((string) config('app.url', 'http://localhost'), '/');
        $jobUrl = "{$appUrl}/monitoring-pekerjaan?job={$this->id}";

        $lines = [
            "📋 *MONITORING PEKERJAAN*",
            "🆔 *No. Tiket:* {$this->job_number}",
            "📌 *Jenis:* {$this->type_label}",
            "⚡ *Prioritas:* {$priorityEmoji}",
            "🎯 *Target / Lokasi:* {$this->target_summary}",
            "📝 *Catatan / Kendala:* " . ($this->description ?: '-'),
            "👷 *Teknisi Bertugas:* {$techNames}",
            "📊 *Status:* {$statusEmoji}",
        ];

        if ($this->status === self::STATUS_COMPLETED && $this->completed_at) {
            $lines[] = "🏁 *Diselesaikan oleh:* " . ($this->completer?->name ?: 'Admin') . " pada " . $this->completed_at->format('d/m/Y H:i');
            if ($this->completion_notes) {
                $lines[] = "📄 *Catatan Hasil:* {$this->completion_notes}";
            }
        }

        $lines[] = "🔗 *Detail Tugas:* {$jobUrl}";

        return implode("\n", $lines);
    }
}
