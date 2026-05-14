<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PermissionKey extends Model
{
    protected $fillable = [
        'key',
        'label',
        'description',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function roleRules()
    {
        return $this->hasMany(RolePermissionRule::class);
    }

    public function groupRules()
    {
        return $this->hasMany(GroupPermissionRule::class);
    }

    public function userRules()
    {
        return $this->hasMany(UserPermissionRule::class);
    }
}
