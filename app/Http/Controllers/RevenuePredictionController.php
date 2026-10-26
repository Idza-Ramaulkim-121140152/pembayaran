<?php

namespace App\Http\Controllers;

use App\Services\RevenuePredictionService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RevenuePredictionController extends Controller
{
    public function __construct(
        private RevenuePredictionService $predictionService
    ) {}

    /**
     * Ambil data prediksi pendapatan untuk range tertentu.
     * Default adalah bulan berjalan.
     */
    public function index(Request $request): JsonResponse
    {
        [$startDate, $endDate] = $this->resolveDateRange($request);
        $force = $request->boolean('force', false);

        $result = $this->predictionService->predictRange($startDate, $endDate, $force);

        return response()->json([
            'success' => true,
            'data' => $result,
        ]);
    }

    /**
     * Perbarui / sinkronisasi ulang profiling model dan hitung ulang prediksi.
     */
    public function recalculate(Request $request): JsonResponse
    {
        // 1. Sync profiling perilaku seluruh pelanggan
        $syncedCustomers = $this->predictionService->syncAllCustomerBehaviorProfiles();

        // 2. Hitung ulang proyeksi range yang diminta
        [$startDate, $endDate] = $this->resolveDateRange($request);
        $result = $this->predictionService->predictRange($startDate, $endDate, true);

        return response()->json([
            'success' => true,
            'message' => sprintf('Model prediksi berhasil diperbarui untuk %d pelanggan.', $syncedCustomers),
            'data' => $result,
        ]);
    }

    /**
     * Parsing rentang tanggal dari request.
     */
    private function resolveDateRange(Request $request): array
    {
        if ($request->filled('start_date') && $request->filled('end_date')) {
            $startDate = Carbon::parse($request->input('start_date'))->startOfDay();
            $endDate = Carbon::parse($request->input('end_date'))->endOfDay();
        } elseif ($request->filled('month')) {
            // Format YYYY-MM
            $month = Carbon::createFromFormat('Y-m', $request->input('month'));
            $startDate = $month->copy()->startOfMonth()->startOfDay();
            $endDate = $month->copy()->endOfMonth()->endOfDay();
        } else {
            // Default: Bulan berjalan
            $startDate = now()->startOfMonth()->startOfDay();
            $endDate = now()->endOfMonth()->endOfDay();
        }

        return [$startDate, $endDate];
    }
}
