<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Borrower extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'phone',
        'notes',
        'mapped_user_id',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function mappedUser()
    {
        return $this->belongsTo(User::class, 'mapped_user_id');
    }

    public function loans()
    {
        return $this->hasMany(BorrowerLoan::class);
    }
}
