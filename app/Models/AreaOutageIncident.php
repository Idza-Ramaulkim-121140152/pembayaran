<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AreaOutageIncident extends Model
{
    protected $fillable = [
        'token',
        'area_code',
        'total_customers',
        'active_customers_count',
        'inactive_customers_count',
        'inactive_customers_data',
        'status',
        'incident_type',
        'incident_notes',
        'network_notice_id',
        'alert_message_sent',
        'target_group_id',
        'alerted_at',
        'action_taken_at',
        'action_taken_by',
        'resolved_at',
    ];

    protected $casts = [
        'inactive_customers_data' => 'array',
        'total_customers' => 'integer',
        'active_customers_count' => 'integer',
        'inactive_customers_count' => 'integer',
        'alerted_at' => 'datetime',
        'action_taken_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    protected $appends = [
        'action_url',
        'inactive_percentage',
        'incident_type_label',
        'status_label',
    ];

    public function networkNotice(): BelongsTo
    {
        return $this->belongsTo(NetworkNotice::class, 'network_notice_id');
    }

    public function actionTakenBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'action_taken_by');
    }

    public function getActionUrlAttribute(): string
    {
        return url('/area-incident/' . $this->token);
    }

    public function getInactivePercentageAttribute(): float
    {
        if ($this->total_customers <= 0) {
            return 0.0;
        }

        return round(($this->inactive_customers_count / $this->total_customers) * 100, 1);
    }

    public function getIncidentTypeLabelAttribute(): ?string
    {
        return match ($this->incident_type) {
            'pemadaman_listrik' => 'Pemadaman Listrik',
            'maintenance_jaringan' => 'Maintenance Jaringan',
            default => $this->incident_type,
        };
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'detected' => 'Terdeteksi (Menunggu Tindakan)',
            'marked_notice' => 'Sudah Ditandai Gangguan',
            'notified_customers' => 'Pelanggan Telah Diberitahu',
            'resolved' => 'Selesai / Normal',
            default => $this->status,
        };
    }
}
