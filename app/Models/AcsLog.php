<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AcsLog extends Model
{
    use HasFactory;

    protected $table = 'acs_logs';

    protected $fillable = [
        'acs_device_id',
        'direction',
        'event_type',
        'xml_content',
        'ip_address',
    ];

    public function device(): BelongsTo
    {
        return $this->belongsTo(AcsDevice::class, 'acs_device_id');
    }
}
