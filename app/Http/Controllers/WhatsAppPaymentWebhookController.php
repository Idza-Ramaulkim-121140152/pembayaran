<?php

namespace App\Http\Controllers;

use App\Services\WhatsAppPaymentIntakeService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WhatsAppPaymentWebhookController extends Controller
{
    public function __construct(
        private WhatsAppPaymentIntakeService $intakeService,
    ) {
    }

    public function store(Request $request)
    {
        Log::info('WhatsApp payment webhook received', [
            'message_id' => $request->input('message_id'),
            'sender_phone' => $request->input('sender_phone'),
            'mime_type' => $request->input('mime_type'),
            'has_media_url' => $request->filled('media_url'),
            'has_media_base64' => $request->filled('media_base64'),
        ]);

        $validated = $request->validate([
            'message_id' => 'required|string|max:191',
            'sender_phone' => 'required|string|max:32',
            'sent_at' => 'required|date',
            'media_url' => 'nullable|string|max:2000',
            'media_base64' => 'nullable|string',
            'caption' => 'nullable|string|max:2000',
            'mime_type' => 'required|string|max:120',
        ]);

        if (empty($validated['media_url']) && empty($validated['media_base64'])) {
            return response()->json([
                'message' => 'Media pembayaran wajib berisi media_url atau media_base64.',
            ], 422);
        }

        $expectedSecret = trim((string) env('WA_PAYMENT_WEBHOOK_SECRET', ''));
        if ($expectedSecret !== '') {
            $providedSecret = trim((string) $request->header('X-Webhook-Secret', ''));
            abort_if($providedSecret !== $expectedSecret, 403, 'Webhook secret tidak valid.');
        }

        $result = $this->intakeService->intake($validated);

        Log::info('WhatsApp payment webhook accepted', [
            'message_id' => $validated['message_id'],
            'capture_id' => $result['capture']->id,
            'duplicate' => $result['duplicate'],
        ]);

        return response()->json([
            'message' => $result['message'],
            'duplicate' => $result['duplicate'],
            'data' => [
                'id' => $result['capture']->id,
                'match_status' => $result['capture']->match_status,
            ],
        ], $result['duplicate'] ? 200 : 202);
    }
}
