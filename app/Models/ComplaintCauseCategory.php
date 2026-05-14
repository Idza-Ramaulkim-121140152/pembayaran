<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ComplaintCauseCategory extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'description',
    ];

    public function complaints()
    {
        return $this->hasMany(Complaint::class, 'root_cause_id');
    }
}
