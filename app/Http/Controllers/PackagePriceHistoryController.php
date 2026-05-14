<?php

namespace App\Http\Controllers;

use App\Models\Package;
use App\Models\PackagePriceHistory;
use App\Services\AuditLogService;
use Illuminate\Http\Request;

class PackagePriceHistoryController extends Controller
{
    public function __construct(private AuditLogService $auditLogService)
    {
    }

    public function index(Package $package)
    {
        $history = PackagePriceHistory::query()
            ->where('package_id', $package->id)
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'data' => $history,
        ]);
    }

    public function changePrice(Request $request, Package $package)
    {
        $validated = $request->validate([
            'new_price' => 'required|numeric|min:0',
            'effective_from' => 'nullable|date',
            'reason' => 'nullable|string|max:500',
        ]);

        $oldPrice = (float) $package->price;
        $newPrice = (float) $validated['new_price'];

        $history = PackagePriceHistory::create([
            'package_id' => $package->id,
            'old_price' => $oldPrice,
            'new_price' => $newPrice,
            'effective_from' => $validated['effective_from'] ?? now()->toDateString(),
            'reason' => $validated['reason'] ?? null,
            'changed_by' => auth()->id(),
        ]);

        $package->price = $newPrice;
        $package->save();

        $this->auditLogService->log('package.price_changed', $package, [
            'old_price' => $oldPrice,
            'new_price' => $newPrice,
            'history_id' => $history->id,
            'reason' => $validated['reason'] ?? null,
        ], auth()->id());

        return response()->json([
            'message' => 'Harga paket berhasil diperbarui.',
            'data' => [
                'package' => $package,
                'history' => $history,
            ],
        ]);
    }
}
