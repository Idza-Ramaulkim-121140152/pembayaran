<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GroupPermissionRule extends Model
{
    protected $fillable = [
        'access_group_id',
        'permission_key_id',
        'effect',
    ];

    public function group()
    {
        return $this->belongsTo(AccessGroup::class, 'access_group_id');
    }

    public function permissionKey()
    {
        return $this->belongsTo(PermissionKey::class);
    }
}
