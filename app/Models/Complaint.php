<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Complaint extends Model
{
    protected $fillable = [
        'customer_id',
        'subject',
        'message',
        'category',
        'status',
        'priority',
        'admin_response',
        'handled_by',
        'resolved_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
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
