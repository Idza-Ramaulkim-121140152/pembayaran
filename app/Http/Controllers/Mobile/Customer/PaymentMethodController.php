<?php

namespace App\Http\Controllers\Mobile\Customer;

use App\Models\PaymentMethod;
use Illuminate\Support\Facades\Storage;

class PaymentMethodController extends BaseMobileCustomerController
{
    public function index()
    {
        $methods = PaymentMethod::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->get()
            ->map(function (PaymentMethod $method) {
                $qrisImage = $method->qris_image;

                return [
                    ...$method->toArray(),
                    'qris_image_url' => $qrisImage ? Storage::disk('public')->url($qrisImage) : null,
                ];
            })
            ->values();

        return response()->json([
            'data' => $methods,
        ]);
    }
}
