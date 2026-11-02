<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class CustomerDismantleRecord extends Model
{
    use HasFactory;

    protected $table = 'customer_dismantle_records';

    protected $fillable = [
        'customer_id',
        'status',
        'technician_id',
        'technician_name',
        'retrieved_items',
        'dismantle_proof_photo',
        'notes',
        'retrieved_at',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'retrieved_items' => 'array',
        'retrieved_at' => 'datetime',
    ];

    protected $appends = [
        'proof_photo_url',
        'status_label',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'proses' => 'Dalam Proses',
            'sudah_dicopot' => 'Sudah Dicopot',
            'batal_bayar' => 'Batal (Pelanggan Bayar)',
            default => 'Siap Dicopot',
        };
    }

    public function getProofPhotoUrlAttribute(): ?string
    {
        if (empty($this->dismantle_proof_photo)) {
            return null;
        }

        if (str_starts_with($this->dismantle_proof_photo, 'http://') || str_starts_with($this->dismantle_proof_photo, 'https://')) {
            return $this->dismantle_proof_photo;
        }

        return Storage::disk('public')->url($this->dismantle_proof_photo);
    }
}
