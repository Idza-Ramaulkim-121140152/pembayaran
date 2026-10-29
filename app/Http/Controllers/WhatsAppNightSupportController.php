<?php

namespace App\Http\Controllers;

use App\Services\WhatsAppNightSupportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WhatsAppNightSupportController extends Controller
{
    public function __construct(
        protected WhatsAppNightSupportService $nightSupportService
    ) {}

    /**
     * Endpoint Webhook Inbound WhatsApp khusus Mode Jaga Malam (21:00 - 08:00 WIB).
     * POST /api/whatsapp/webhooks/night-support
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sender_phone' => 'nullable|string',
            'sender_lid' => 'nullable|string',
            'sender_name' => 'nullable|string',
            'message' => 'required|string',
            'message_id' => 'nullable|string',
            'timestamp' => 'nullable',
        ]);

        $result = $this->nightSupportService->handleInboundMessage($validated);

        return response()->json([
            'success' => true,
            'data' => $result,
        ]);
    }

    /**
     * Endpoint status operasional Mode Jaga Malam.
     * GET /api/whatsapp/night-support/status
     */
    public function status(): JsonResponse
    {
        $isActive = $this->nightSupportService->isNightShiftActive();

        return response()->json([
            'success' => true,
            'is_night_shift_active' => $isActive,
            'current_time_wib' => now('Asia/Jakarta')->format('Y-m-d H:i:s'),
            'operating_hours' => [
                'human_cs' => '08:00 - 21:00 WIB',
                'ai_night_support' => '21:00 - 08:00 WIB',
            ],
        ]);
    }
}
