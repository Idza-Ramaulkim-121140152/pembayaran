<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccessGroup extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'description',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function members()
    {
        return $this->belongsToMany(User::class, 'group_user_memberships')->withTimestamps();
    }

    public function permissionRules()
    {
        return $this->hasMany(GroupPermissionRule::class);
    }
}
