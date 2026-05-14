<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Complaint extends Model
{
    protected static function booted(): void
    {
        static::created(function (Complaint $complaint) {
            if (!$complaint->ticket_number) {
                $complaint->ticket_number = sprintf('TCK-%s-%06d', now()->format('Ymd'), $complaint->id);
            }

            if (!$complaint->opened_at) {
                $complaint->opened_at = $complaint->created_at ?? now();
            }

            if (!$complaint->last_activity_at) {
                $complaint->last_activity_at = now();
            }

            $complaint->saveQuietly();
        });
    }

    protected $fillable = [
        'customer_id',
        'subject',
        'message',
        'category',
        'status',
        'priority',
        'admin_response',
        'handled_by',
        'assigned_to',
        'ticket_number',
        'opened_at',
        'first_response_at',
        'resolved_at',
        'closed_at',
        'sla_first_response_due_at',
        'sla_resolution_due_at',
        'root_cause_id',
        'last_activity_at',
    ];

    protected $casts = [
        'opened_at' => 'datetime',
        'first_response_at' => 'datetime',
        'resolved_at' => 'datetime',
        'closed_at' => 'datetime',
        'sla_first_response_due_at' => 'datetime',
        'sla_resolution_due_at' => 'datetime',
        'last_activity_at' => 'datetime',
    ];

    // Relasi ke Customer
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    // Relasi ke Admin yang menangani
    public function handler()
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function rootCause()
    {
        return $this->belongsTo(ComplaintCauseCategory::class, 'root_cause_id');
    }

    public function events()
    {
        return $this->hasMany(ComplaintEvent::class);
    }

    // Scope untuk aduan pending
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    // Scope untuk aduan aktif (belum closed)
    public function scopeActive($query)
    {
        return $query->whereNotIn('status', ['closed', 'resolved']);
    }

    // Status labels
    public static function getStatusLabels()
    {
        return [
            'pending' => 'Menunggu',
            'in_progress' => 'Diproses',
            'resolved' => 'Selesai',
            'closed' => 'Ditutup',
        ];
    }

    // Category labels
    public static function getCategoryLabels()
    {
        return [
            'gangguan' => 'Gangguan Jaringan',
            'pembayaran' => 'Pembayaran',
            'layanan' => 'Layanan',
            'lainnya' => 'Lainnya',
        ];
    }

    // Priority labels
    public static function getPriorityLabels()
    {
        return [
            'low' => 'Rendah',
            'medium' => 'Sedang',
            'high' => 'Tinggi',
        ];
    }
}
