<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Package;
use App\Services\AuditLogService;
use App\Services\CustomerPackageAuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class CustomerPackageManagementController extends Controller
{
    public function __construct(
        private CustomerPackageAuditService $auditService,
        private AuditLogService $auditLogService
    ) {
    }

    public function summary(Request $request)
    {
        $validated = $request->validate([
            'active_only' => 'nullable|boolean',
            'include_ignored' => 'nullable|boolean',
            'search' => 'nullable|string|max:100',
        ]);

        $rows = $this->auditService->buildRows([
            'active_only' => (bool) ($validated['active_only'] ?? true),
            'include_ignored' => (bool) ($validated['include_ignored'] ?? false),
            'search' => (string) ($validated['search'] ?? ''),
        ]);

        return response()->json([
            'data' => $this->auditService->buildSummary($rows),
        ]);
    }

    public function customers(Request $request)
    {
        $validated = $request->validate([
            'active_only' => 'nullable|boolean',
            'include_ignored' => 'nullable|boolean',
            'search' => 'nullable|string|max:100',
            'status' => [
                'nullable',
                'string',
                Rule::in(CustomerPackageAuditService::SUPPORTED_STATUSES),
            ],
            'per_page' => 'nullable|integer|min:1|max:500',
            'page' => 'nullable|integer|min:1',
        ]);

        $rows = $this->auditService->buildRows([
            'active_only' => (bool) ($validated['active_only'] ?? true),
            'include_ignored' => (bool) ($validated['include_ignored'] ?? false),
            'search' => (string) ($validated['search'] ?? ''),
            'status' => (string) ($validated['status'] ?? ''),
        ]);

        $summary = $this->auditService->buildSummary($rows);
        $perPage = (int) ($validated['per_page'] ?? 100);
        $page = (int) ($validated['page'] ?? 1);
        $pagination = $this->paginateCollection($rows, $perPage, $page);

        return response()->json([
            'data' => $pagination['data'],
            'meta' => array_merge($pagination['meta'], [
                'summary' => $summary,
                'statuses' => CustomerPackageAuditService::SUPPORTED_STATUSES,
            ]),
        ]);
    }

    public function resolveSystemToMikrotik(Request $request, Customer $customer)
    {
        $result = $this->auditService->resolveSystemToMikrotik($customer, (int) auth()->id());
        $this->auditLogService->log('customer.package_audit.resolve_system_to_mikrotik', $customer, $result, auth()->id());

        return response()->json([
            'message' => 'Profile PPPoE berhasil disesuaikan mengikuti paket sistem.',
            'data' => $result,
        ]);
    }

    public function resolveMikrotikToSystem(Request $request, Customer $customer)
    {
        $result = $this->auditService->resolveMikrotikToSystem($customer, (int) auth()->id());
        $this->auditLogService->log('customer.package_audit.resolve_mikrotik_to_system', $customer, $result, auth()->id());

        return response()->json([
            'message' => 'Paket sistem berhasil disesuaikan mengikuti profile PPPoE.',
            'data' => $result,
        ]);
    }

    public function createPppoe(Request $request, Customer $customer)
    {
        $result = $this->auditService->createPppoe($customer, (int) auth()->id());
        $this->auditLogService->log('customer.package_audit.pppoe_created', $customer, $result, auth()->id());

        return response()->json([
            'message' => 'PPPoE berhasil dibuat dan dihubungkan ke pelanggan.',
            'data' => $result,
        ]);
    }

    public function linkPppoe(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'pppoe_username' => 'required|string|max:128',
        ]);

        $result = $this->auditService->linkPppoe($customer, $validated['pppoe_username'], (int) auth()->id());
        $this->auditLogService->log('customer.package_audit.pppoe_linked', $customer, $result, auth()->id());

        return response()->json([
            'message' => 'PPPoE berhasil dihubungkan ke pelanggan.',
            'data' => $result,
        ]);
    }

    public function assignPackage(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'package_id' => 'required|integer|exists:packages,id',
        ]);

        $package = Package::query()
            ->where('id', $validated['package_id'])
            ->where('is_active', true)
            ->firstOrFail();

        $result = $this->auditService->assignPackage($customer, $package, (int) auth()->id());
        $this->auditLogService->log('customer.package_audit.package_assigned', $customer, $result, auth()->id());

        return response()->json([
            'message' => 'Paket pelanggan berhasil diperbarui.',
            'data' => $result,
        ]);
    }

    public function ignore(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'status_code' => ['required', 'string', Rule::in(CustomerPackageAuditService::SUPPORTED_STATUSES)],
            'reason' => 'nullable|string|max:500',
        ]);

        $ignore = $this->auditService->ignore(
            $customer,
            $validated['status_code'],
            $validated['reason'] ?? null,
            (int) auth()->id()
        );

        $this->auditLogService->log('customer.package_audit.ignored', $customer, [
            'status_code' => $ignore->status_code,
            'reason' => $ignore->reason,
            'ignore_id' => $ignore->id,
        ], auth()->id());

        return response()->json([
            'message' => 'Status pelanggan berhasil diabaikan.',
            'data' => $ignore,
        ]);
    }

    public function unignore(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'status_code' => ['required', 'string', Rule::in(CustomerPackageAuditService::SUPPORTED_STATUSES)],
        ]);

        $this->auditService->unignore($customer, $validated['status_code']);
        $this->auditLogService->log('customer.package_audit.unignored', $customer, [
            'status_code' => $validated['status_code'],
        ], auth()->id());

        return response()->json([
            'message' => 'Status ignore berhasil dibuka kembali.',
        ]);
    }

    public function pppoeSecrets(Request $request)
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:100',
        ]);

        $rows = $this->auditService->pppoeSecretOptions((string) ($validated['search'] ?? ''));

        return response()->json([
            'data' => $rows,
        ]);
    }

    private function paginateCollection(Collection $rows, int $perPage, int $page): array
    {
        $total = $rows->count();
        $lastPage = max(1, (int) ceil($total / max($perPage, 1)));
        $page = max(1, min($page, $lastPage));
        $offset = ($page - 1) * $perPage;

        return [
            'data' => $rows->slice($offset, $perPage)->values(),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
            ],
        ];
    }
}

