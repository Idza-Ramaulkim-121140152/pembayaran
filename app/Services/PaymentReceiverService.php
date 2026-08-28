<?php

namespace App\Services;

use App\Models\PaymentReceiverUserMapping;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class PaymentReceiverService
{
    public function __construct(private CompanyFinanceReceiverService $companyFinanceReceiverService)
    {
    }

    public function allowedReceiverIds(?User $user): array
    {
        if (!$user || !Schema::hasTable('users')) {
            return [];
        }

        if ($user->isSuperAdmin()) {
            return User::query()->pluck('id')->map(fn ($id) => (int) $id)->all();
        }

        $receiverIds = [$user->id];

        if (Schema::hasTable('payment_receiver_user_mappings')) {
            $mapped = PaymentReceiverUserMapping::query()
                ->where('user_id', $user->id)
                ->pluck('receiver_user_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            $receiverIds = array_merge($receiverIds, $mapped);
        }

        return array_values(array_unique(array_filter($receiverIds)));
    }

    public function allowedReceivers(?User $user): Collection
    {
        $ids = $this->allowedReceiverIds($user);

        if ($ids === []) {
            return collect();
        }

        $users = User::query()
            ->select('id', 'name', 'email', 'role')
            ->whereIn('id', $ids)
            ->orderBy('name')
            ->get();

        return $this->companyFinanceReceiverService->annotateUsers($users);
    }

    public function staffUsersLite(): Collection
    {
        if (!Schema::hasTable('users')) {
            return collect();
        }

        $users = User::query()
            ->select('id', 'name', 'email', 'role')
            ->orderBy('name')
            ->get();

        return $this->companyFinanceReceiverService->annotateUsers($users);
    }

    public function isAllowedReceiver(?User $user, ?int $receiverUserId): bool
    {
        if (!$user || !$receiverUserId) {
            return false;
        }

        return in_array($receiverUserId, $this->allowedReceiverIds($user), true);
    }

    public function isCompanyFinanceReceiver(?int $receiverUserId): bool
    {
        return $this->companyFinanceReceiverService->isCompanyFinanceUserId($receiverUserId);
    }
}
