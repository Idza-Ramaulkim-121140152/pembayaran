<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AcsDeviceParameter extends Model
{
    use HasFactory;

    protected $table = 'acs_device_parameters';

    protected $fillable = [
        'acs_device_id',
        'name',
        'value',
        'type',
        'writable',
    ];

    protected $casts = [
        'writable' => 'boolean',
    ];

    public function device(): BelongsTo
    {
        return $this->belongsTo(AcsDevice::class, 'acs_device_id');
    }
}
