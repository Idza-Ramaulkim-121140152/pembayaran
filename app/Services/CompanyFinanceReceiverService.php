<?php

namespace App\Services;

use App\Models\CompanyFinanceReceiver;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class CompanyFinanceReceiverService
{
    public function isReady(): bool
    {
        return Schema::hasTable('company_finance_receivers');
    }

    public function activeUserIds(): array
    {
        if (!$this->isReady()) {
            return [];
        }

        return CompanyFinanceReceiver::query()
            ->where('is_active', true)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function isCompanyFinanceUser(?User $user): bool
    {
        return $this->isCompanyFinanceUserId($user?->id);
    }

    public function isCompanyFinanceUserId(?int $userId): bool
    {
        if (!$userId || !$this->isReady()) {
            return false;
        }

        return CompanyFinanceReceiver::query()
            ->where('user_id', $userId)
            ->where('is_active', true)
            ->exists();
    }

    public function annotateUsers(Collection $users): Collection
    {
        $activeIds = $this->activeUserIds();

        return $users->map(function ($user) use ($activeIds) {
            if ($user instanceof User) {
                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'is_company_finance_receiver' => in_array((int) $user->id, $activeIds, true),
                ];
            }

            $user = (array) $user;

            return [
                ...$user,
                'is_company_finance_receiver' => in_array((int) ($user['id'] ?? 0), $activeIds, true),
            ];
        })->values();
    }
}
