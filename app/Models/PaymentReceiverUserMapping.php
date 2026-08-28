<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentReceiverUserMapping extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'receiver_user_id',
    ];

    public function responsibleUser()
    {
        return $this->belongsTo(User::class);
    }

    public function user()
    {
        return $this->responsibleUser();
    }

    public function receiver()
    {
        return $this->belongsTo(User::class, 'receiver_user_id');
    }
}
