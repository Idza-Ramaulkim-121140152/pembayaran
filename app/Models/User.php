<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use App\Models\PayrollMember;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    const ROLE_SUPERADMIN = 'superadmin';
    const ROLE_ADMIN = 'admin';
    const ROLE_TEKNISI = 'teknisi';
    const ROLE_FINANCE = 'finance';

    const ROLES = [
        self::ROLE_SUPERADMIN,
        self::ROLE_ADMIN,
        self::ROLE_TEKNISI,
        self::ROLE_FINANCE,
    ];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'can_confirm_payments',
        'can_edit_mutations',
        'is_employee',
        'payroll_member_id',
    ];

    public function isSuperAdmin(): bool
    {
        return $this->role === self::ROLE_SUPERADMIN;
    }

    public function isAdmin(): bool
    {
        return in_array($this->role, [self::ROLE_SUPERADMIN, self::ROLE_ADMIN]);
    }

    public function isTeknisi(): bool
    {
        return $this->role === self::ROLE_TEKNISI;
    }

    public function isFinance(): bool
    {
        return $this->role === self::ROLE_FINANCE;
    }

    public function hasRole(string ...$roles): bool
    {
        return in_array($this->role, $roles);
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'can_confirm_payments' => 'boolean',
            'can_edit_mutations' => 'boolean',
            'is_employee' => 'boolean',
        ];
    }

    public function payrollMember()
    {
        return $this->belongsTo(PayrollMember::class, 'payroll_member_id');
    }

    public function canConfirmPayments(): bool
    {
        return $this->isSuperAdmin() || (bool) $this->can_confirm_payments;
    }

    public function canEditMutations(): bool
    {
        return $this->isSuperAdmin() || (bool) $this->can_edit_mutations;
    }
}
