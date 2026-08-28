<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class CustomerAgreement extends Model
{
    protected $fillable = [
        'customer_id',
        'generated_by',
        'agreement_number',
        'public_token',
        'pdf_path',
        'pdf_hash',
        'status',
        'customer_data',
        'device_data',
        'attachment_paths',
        'signature_meta',
        'whatsapp_status',
        'whatsapp_error',
        'whatsapp_sent_at',
        'generated_at',
    ];

    protected $casts = [
        'customer_data' => 'array',
        'device_data' => 'array',
        'attachment_paths' => 'array',
        'signature_meta' => 'array',
        'whatsapp_sent_at' => 'datetime',
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

    public function generatedBy()
    {
        return $this->belongsTo(User::class, 'generated_by');
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
        return route('contracts.public.download', ['token' => $this->public_token], false);
    }

    public function getVerifyUrlAttribute(): string
    {
        return route('contracts.public.verify', ['token' => $this->public_token], false);
    }
}
