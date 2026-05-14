<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RolePermissionRule extends Model
{
    protected $fillable = [
        'role',
        'permission_key_id',
        'effect',
    ];

    public function permissionKey()
    {
        return $this->belongsTo(PermissionKey::class);
    }
}
