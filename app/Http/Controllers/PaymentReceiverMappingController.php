<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\CompanyFinanceReceiverService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class PaymentReceiverMappingController extends Controller
{
    public function __construct(private CompanyFinanceReceiverService $companyFinanceReceiverService)
    {
    }

    private function ensureReady(): void
    {
        abort_unless(Schema::hasTable('payment_receiver_user_mappings'), 503, 'Fitur mapping penerima belum siap. Jalankan migrasi terlebih dahulu.');
    }

    public function index()
    {
        $this->ensureReady();

        $rows = User::query()
            ->select('id', 'name', 'email', 'role')
            ->with(['allowedPaymentReceivers:id,name,email,role'])
            ->orderBy('name')
            ->get()
            ->map(function (User $user) {
                return [
                    'responsible_user' => [
                        ...$user->only('id', 'name', 'email', 'role'),
                        'is_company_finance_receiver' => $this->companyFinanceReceiverService->isCompanyFinanceUserId($user->id),
                    ],
                    'receivers' => $this->companyFinanceReceiverService->annotateUsers($user->allowedPaymentReceivers),
                ];
            })
            ->values();

        return response()->json(['data' => $rows]);
    }

    public function sync(Request $request, User $user)
    {
        $this->ensureReady();

        $validated = $request->validate([
            'receiver_user_ids' => 'required|array',
            'receiver_user_ids.*' => 'integer|exists:users,id|different:user_id',
        ]);

        $ids = collect($validated['receiver_user_ids'])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id !== $user->id)
            ->unique()
            ->values()
            ->all();

        $user->allowedPaymentReceivers()->sync($ids);

        return response()->json([
            'message' => 'Mapping penerima pembayaran berhasil diperbarui.',
            'data' => [
                'responsible_user' => [
                    ...$user->only('id', 'name', 'email', 'role'),
                    'is_company_finance_receiver' => $this->companyFinanceReceiverService->isCompanyFinanceUserId($user->id),
                ],
                'receivers' => $this->companyFinanceReceiverService->annotateUsers(
                    $user->fresh()->load('allowedPaymentReceivers:id,name,email,role')->allowedPaymentReceivers
                ),
            ],
        ]);
    }
}
