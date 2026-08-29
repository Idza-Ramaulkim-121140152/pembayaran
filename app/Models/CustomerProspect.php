<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomerProspect extends Model
{
    use HasFactory;

    protected $table = 'customer_prospects';

    protected $fillable = [
        'registration_no',
        'nama',
        'no_telp',
        'nik',
        'jenis_kelamin',
        'kecamatan_id',
        'desa_id',
        'dusun_id',
        'alamat',
        'latitude',
        'longitude',
        'paket',
        'paket_custom',
        'foto_depan_rumah',
        'foto_ktp',
        'catatan',
        'source',
        'registered_by',
        'status',
        'rejection_reason',
        'verified_at',
        'verified_by',
        'installed_at',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'verified_at' => 'datetime',
        'installed_at' => 'datetime',
    ];

    public function kecamatan()
    {
        return $this->belongsTo(MasterWilayahKecamatan::class, 'kecamatan_id');
    }

    public function desa()
    {
        return $this->belongsTo(MasterWilayahDesa::class, 'desa_id');
    }

    public function dusun()
    {
        return $this->belongsTo(MasterWilayahDusun::class, 'dusun_id');
    }

    public function registeredBy()
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    public function verifiedBy()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeActiveRecommendations($query)
    {
        return $query->whereIn('status', ['approved', 'pending'])
            ->latest('id');
    }
}
