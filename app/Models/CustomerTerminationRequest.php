<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class CustomerTerminationRequest extends Model
{
    protected $fillable = [
        'customer_id',
        'requested_by',
        'finalized_by',
        'cancelled_by',
        'document_number',
        'public_token',
        'status',
        'planned_termination_date',
        'reason',
        'device_notes',
        'return_instructions',
        'pdf_path',
        'pdf_hash',
        'customer_data',
        'device_data',
        'signature_meta',
        'whatsapp_status',
        'whatsapp_error',
        'whatsapp_sent_at',
        'notified_at',
        'final_verified_at',
        'completed_at',
        'cancelled_at',
        'generated_at',
    ];

    protected $casts = [
        'planned_termination_date' => 'date:Y-m-d',
        'customer_data' => 'array',
        'device_data' => 'array',
        'signature_meta' => 'array',
        'whatsapp_sent_at' => 'datetime',
        'notified_at' => 'datetime',
        'final_verified_at' => 'datetime',
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'generated_at' => 'datetime',
    ];

    protected $appends = [
        'pdf_url',
        'download_url',
        'verify_url',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function finalizedBy()
    {
        return $this->belongsTo(User::class, 'finalized_by');
    }

    public function getPdfUrlAttribute(): ?string
    {
        if (!$this->pdf_path) {
            return null;
        }

        return Storage::disk('public')->url($this->pdf_path);
    }

    public function getDownloadUrlAttribute(): string
    {
        return route('terminations.public.download', ['token' => $this->public_token], false);
    }

    public function getVerifyUrlAttribute(): string
    {
        return route('terminations.public.verify', ['token' => $this->public_token], false);
    }
}
