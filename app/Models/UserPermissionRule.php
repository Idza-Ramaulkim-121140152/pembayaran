<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserPermissionRule extends Model
{
    protected $fillable = [
        'user_id',
        'permission_key_id',
        'effect',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function permissionKey()
    {
        return $this->belongsTo(PermissionKey::class);
    }
}
