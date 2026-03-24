<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class SuperAdminSeeder extends Seeder
{
    /**
     * Seed a default superadmin account.
     */
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'superadmin@rumahkita.net'],
            [
                'name' => 'Super Admin',
                'password' => 'admin',
                'role' => User::ROLE_SUPERADMIN,
            ]
        );
    }
}