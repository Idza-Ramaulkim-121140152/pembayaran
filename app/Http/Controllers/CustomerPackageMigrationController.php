<?php

namespace App\Http\Controllers;

use App\Models\MasterMikrotik;
use App\Services\AuditLogService;
use App\Services\CustomerPackageMigrationService;
use Illuminate\Http\Request;

class CustomerPackageMigrationController extends Controller
{
    public function __construct(
        private CustomerPackageMigrationService $migrationService,
        private AuditLogService $auditLogService
    ) {
    }

    public function preview(Request $request)
    {
        $validated = $request->validate([
            'router_id' => 'required|integer|exists:master_mikrotiks,id',
        ]);

        $router = MasterMikrotik::query()->findOrFail($validated['router_id']);
        $result = $this->migrationService->preview($router);

        $this->auditLogService->log('customer.package_migration.preview', $router, [
            'summary' => $result['summary'] ?? [],
            'router' => $result['router'] ?? [],
        ], auth()->id());

        return response()->json([
            'data' => $result,
        ]);
    }

    public function run(Request $request)
    {
        $validated = $request->validate([
            'router_id' => 'required|integer|exists:master_mikrotiks,id',
            'confirm_warnings' => 'accepted',
        ]);

        $router = MasterMikrotik::query()->findOrFail($validated['router_id']);
        $result = $this->migrationService->run($router);

        $this->auditLogService->log('customer.package_migration.run', $router, [
            'summary' => $result['summary'] ?? [],
            'router' => $result['router'] ?? [],
        ], auth()->id());

        return response()->json([
            'message' => 'Migrasi PPPoE pelanggan selesai diproses.',
            'data' => $result,
        ]);
    }
}
