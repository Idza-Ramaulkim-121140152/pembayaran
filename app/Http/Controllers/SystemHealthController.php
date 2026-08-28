<?php

namespace App\Http\Controllers;

use App\Services\FeatureService;
use App\Services\SystemHealthService;

class SystemHealthController extends Controller
{
    public function __construct(
        private FeatureService $featureService,
        private SystemHealthService $systemHealthService,
    ) {
    }

    public function index()
    {
        if (!$this->featureService->enabled('observability_dashboard_v1')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        return response()->json([
            'data' => $this->systemHealthService->dashboard(),
        ]);
    }

    public function checkNow()
    {
        if (!$this->featureService->enabled('observability_dashboard_v1')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        return response()->json([
            'data' => $this->systemHealthService->runChecks(),
        ]);
    }
}
