<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SlaPolicy extends Model
{
    protected $fillable = [
        'name',
        'priority',
        'cause_category_id',
        'first_response_minutes',
        'resolution_minutes',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function causeCategory()
    {
        return $this->belongsTo(ComplaintCauseCategory::class, 'cause_category_id');
    }
}
