<?php

namespace App\Http\Controllers;

use App\Models\SiteSetting;
use App\Services\InstallationPricingService;
use Illuminate\Http\Request;

class InstallationPricingController extends Controller
{
    private const SETTING_DEFAULT_INSTALLATION_LABOR_FEE = 'default_installation_labor_fee_payroll';

    public function __construct(
        private InstallationPricingService $pricingService,
    ) {
    }

    public function index()
    {
        $active = $this->pricingService->getOrCreateActive();
        $history = $this->pricingService->history();

        return response()->json([
            'success' => true,
            'data' => [
                'active' => $active,
                'history' => $history,
                'labor_fee_default' => (float) SiteSetting::get(self::SETTING_DEFAULT_INSTALLATION_LABOR_FEE, 0),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'cable_price_per_meter' => ['required', 'numeric', 'min:0'],
            'router_unit_price' => ['required', 'numeric', 'min:0'],
            'connector_unit_price' => ['nullable', 'numeric', 'min:0'],
            'connector_quantity_default' => ['nullable', 'integer', 'min:0'],
            'apply_scope' => ['nullable', 'in:future_only,recalculate_existing'],
        ]);

        $applyScope = $validated['apply_scope'] ?? InstallationPricingService::APPLY_SCOPE_FUTURE_ONLY;
        $result = $this->pricingService->updateReportPricing($validated, $applyScope, auth()->id());
        $message = $applyScope === InstallationPricingService::APPLY_SCOPE_RECALCULATE_EXISTING
            ? 'Harga barang laporan berhasil diperbarui dan snapshot pelanggan lama sudah dihitung ulang.'
            : 'Harga barang laporan berhasil diperbarui untuk data berikutnya.';

        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => [
                ...$result,
                'labor_fee_default' => (float) SiteSetting::get(self::SETTING_DEFAULT_INSTALLATION_LABOR_FEE, 0),
            ],
        ], 201);
    }
}
