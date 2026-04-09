<?php

namespace App\Http\Controllers;

use App\Models\DistributionRoute;
use Illuminate\Http\Request;

class DistributionRouteController extends Controller
{
    public function latest()
    {
        $route = DistributionRoute::orderBy('id')->first();

        return response()->json([
            'data' => $route,
        ]);
    }

    public function save(Request $request)
    {
        $validated = $request->validate([
            'nodes' => 'required|array|min:1',
        ]);

        $route = DistributionRoute::orderBy('id')->first();

        if ($route) {
            $route->update([
                'nodes' => $validated['nodes'],
                'updated_by' => auth()->id(),
            ]);
        } else {
            $route = DistributionRoute::create([
                'name' => 'Jalur Distribusi Utama',
                'nodes' => $validated['nodes'],
                'created_by' => auth()->id(),
                'updated_by' => auth()->id(),
            ]);
        }

        return response()->json([
            'message' => 'Jalur distribusi berhasil disimpan',
            'data' => $route,
        ]);
    }
}
