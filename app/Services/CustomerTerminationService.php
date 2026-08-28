<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerTerminationRequest;
use App\Models\NotificationLog;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CustomerTerminationService
{
    public function create(Customer $customer, array $input, ?int $actorId = null): CustomerTerminationRequest
    {
        $customer->loadMissing(['package', 'odp', 'kecamatan', 'desa', 'dusun']);

        $request = CustomerTerminationRequest::create([
            'customer_id' => $customer->id,
            'requested_by' => $actorId,
            'document_number' => $this->makeDocumentNumber($customer),
            'public_token' => Str::random(48),
            'status' => 'draft',
            'planned_termination_date' => $input['planned_termination_date'] ?? null,
            'reason' => $this->stringInput($input, 'reason') ?: 'Pelanggan akan dilakukan pencopotan/penarikan perangkat.',
            'device_notes' => $this->stringInput($input, 'device_notes'),
            'return_instructions' => $this->stringInput($input, 'return_instructions') ?: 'Pelanggan dimohon memberi akses kepada petugas untuk mengambil perangkat milik perusahaan.',
            'customer_data' => $this->customerSnapshot($customer),
            'device_data' => $this->deviceSnapshot($customer),
            'generated_at' => now(),
        ]);

        $request->signature_meta = $this->signatureMeta($request);
        $request->save();

        $pdfPath = $this->renderPdf($request->fresh(['customer']));
        $pdfHash = Storage::disk('public')->exists($pdfPath)
            ? hash('sha256', Storage::disk('public')->get($pdfPath))
            : null;

        $request->update([
            'pdf_path' => $pdfPath,
            'pdf_hash' => $pdfHash,
        ]);

        return $request->fresh(['customer']);
    }

    public function sendWhatsApp(CustomerTerminationRequest $request, ?string $message = null): array
    {
        $request->loadMissing('customer');
        $customer = $request->customer;
        $phone = (string) ($customer?->phone ?? '');

        if (!$this->isValidPhone($phone)) {
            return $this->finishWhatsApp($request, $message ?? '', 'skipped', 'no_valid_whatsapp', [
                'media_sent' => false,
                'text_sent' => false,
            ]);
        }

        $message = $message ?: $this->defaultMessage($request);
        $mediaError = null;
        $mediaSent = false;

        if ($request->pdf_path && Storage::disk('public')->exists($request->pdf_path)) {
            [$mediaSent, $mediaError] = $this->sendMedia($phone, $message, $request);
        } else {
            $mediaError = 'pdf_not_available';
        }

        if ($mediaSent) {
            return $this->finishWhatsApp($request, $message, 'sent', null, [
                'media_sent' => true,
                'text_sent' => false,
            ]);
        }

        [$textSent, $textError] = $this->sendText($phone, $message, (string) ($customer?->name ?? 'Pelanggan'));

        return $this->finishWhatsApp($request, $message, $textSent ? 'sent' : 'failed', $textSent ? $mediaError : ($textError ?: $mediaError), [
            'media_sent' => false,
            'media_error' => $mediaError,
            'text_sent' => $textSent,
            'text_error' => $textError,
        ]);
    }

    public function finalize(CustomerTerminationRequest $request, ?int $actorId = null): CustomerTerminationRequest
    {
        $request->loadMissing('customer');

        $request->update([
            'status' => 'completed',
            'finalized_by' => $actorId,
            'final_verified_at' => now(),
            'completed_at' => now(),
        ]);

        if ($request->customer) {
            $request->customer->update(['is_active' => false]);
        }

        return $request->fresh(['customer']);
    }

    public function cancel(CustomerTerminationRequest $request, ?int $actorId = null): CustomerTerminationRequest
    {
        if ($request->status === 'completed') {
            abort(response()->json(['message' => 'Surat copot yang sudah final tidak dapat dibatalkan.'], 422));
        }

        $request->update([
            'status' => 'cancelled',
            'cancelled_by' => $actorId,
            'cancelled_at' => now(),
        ]);

        return $request->fresh(['customer']);
    }

    public function toPayload(CustomerTerminationRequest $request): array
    {
        return [
            'id' => $request->id,
            'document_number' => $request->document_number,
            'status' => $request->status,
            'reason' => $request->reason,
            'device_notes' => $request->device_notes,
            'return_instructions' => $request->return_instructions,
            'planned_termination_date' => optional($request->planned_termination_date)->format('Y-m-d'),
            'pdf_path' => $request->pdf_path,
            'pdf_url' => $request->pdf_url,
            'download_url' => $request->download_url,
            'verify_url' => $request->verify_url,
            'pdf_hash' => $request->pdf_hash,
            'customer_data' => $request->customer_data ?: [],
            'device_data' => $request->device_data ?: [],
            'signature_meta' => $request->signature_meta ?: [],
            'whatsapp_status' => $request->whatsapp_status,
            'whatsapp_error' => $request->whatsapp_error,
            'whatsapp_sent_at' => optional($request->whatsapp_sent_at)->toISOString(),
            'notified_at' => optional($request->notified_at)->toISOString(),
            'final_verified_at' => optional($request->final_verified_at)->toISOString(),
            'completed_at' => optional($request->completed_at)->toISOString(),
            'cancelled_at' => optional($request->cancelled_at)->toISOString(),
            'generated_at' => optional($request->generated_at)->toISOString(),
            'created_at' => optional($request->created_at)->toISOString(),
        ];
    }

    public function defaultMessage(CustomerTerminationRequest $request): string
    {
        $request->loadMissing('customer');
        $downloadUrl = route('terminations.public.download', ['token' => $request->public_token], true);
        $verifyUrl = route('terminations.public.verify', ['token' => $request->public_token], true);
        $plannedDate = $request->planned_termination_date
            ? Carbon::parse($request->planned_termination_date)->translatedFormat('d F Y')
            : '-';

        return "Halo {$request->customer?->name},\n\n" .
            "Kami mengirimkan surat pengingat rencana pencopotan/penarikan perangkat layanan Rumah Kita Network.\n\n" .
            "Nomor dokumen: {$request->document_number}\n" .
            "Rencana tanggal: {$plannedDate}\n" .
            "Alasan: {$request->reason}\n\n" .
            "Download surat: {$downloadUrl}\n" .
            "Verifikasi dokumen: {$verifyUrl}\n\n" .
            "Status pelanggan belum dinonaktifkan sampai admin melakukan verifikasi final.\n\n" .
            BillingMessageTemplateService::AUTO_LABEL;
    }

    private function makeDocumentNumber(Customer $customer): string
    {
        $prefix = 'SPC/RKN/' . now()->format('Ym');
        $sequence = str_pad((string) ($customer->terminationRequests()->count() + 1), 2, '0', STR_PAD_LEFT);

        return $prefix . '/' . str_pad((string) $customer->id, 5, '0', STR_PAD_LEFT) . '-' . $sequence;
    }

    private function customerSnapshot(Customer $customer): array
    {
        return [
            'customer_name' => $customer->name,
            'phone' => $customer->phone,
            'email' => $customer->email,
            'address' => $customer->address,
            'pppoe_username' => $customer->pppoe_username,
            'activation_date' => optional($customer->activation_date)->format('Y-m-d'),
            'due_date' => optional($customer->due_date)->format('Y-m-d'),
            'region' => $this->regionLabel($customer),
        ];
    }

    private function deviceSnapshot(Customer $customer): array
    {
        return [
            'package_name' => $customer->package?->name ?: ($customer->package_type ?: $customer->custom_package),
            'odp' => $customer->odp?->nama ?: (string) $customer->getAttribute('odp'),
            'mikrotik_profile' => $customer->mikrotik_profile,
            'router_type' => $customer->home_router_type,
            'router_host' => $customer->home_router_host,
        ];
    }

    private function signatureMeta(CustomerTerminationRequest $request): array
    {
        $verifyUrl = route('terminations.public.verify', ['token' => $request->public_token], true);
        $statement = 'Dokumen surat copot pemasangan ini diterbitkan secara digital oleh Rumah Kita Network.';

        return [
            'statement' => $statement,
            'verify_url' => $verifyUrl,
            'qr' => $this->qrDataUri("Nomor Dokumen: {$request->document_number}\n{$statement}\nVerifikasi: {$verifyUrl}"),
            'signed_at' => now()->toISOString(),
        ];
    }

    private function renderPdf(CustomerTerminationRequest $request): string
    {
        $request->loadMissing('customer');

        $pdf = Pdf::loadView('contracts.customer-termination', [
            'termination' => $request,
            'customerData' => $request->customer_data ?: [],
            'deviceData' => $request->device_data ?: [],
            'signatureMeta' => $request->signature_meta ?: [],
            'logoDataUri' => $this->localImageDataUri(public_path('logo_baru.png')),
        ])->setPaper('a4');

        $path = 'customer-terminations/' . now()->format('Y/m') . '/' . Str::slug($request->document_number) . '.pdf';
        Storage::disk('public')->put($path, $pdf->output());

        return $path;
    }

    private function sendMedia(string $phone, string $caption, CustomerTerminationRequest $request): array
    {
        try {
            $response = Http::timeout(60)->post($this->gatewayUrl() . '/send-media', [
                'phone' => $phone,
                'message' => $caption,
                'file_url' => $this->absolutePublicUrl(Storage::disk('public')->url($request->pdf_path)),
                'filename' => 'Surat-Copot-' . str_replace(['/', '\\'], '-', $request->document_number) . '.pdf',
            ]);

            if ($response->successful()) {
                $payload = $response->json();
                if (is_array($payload) && ($payload['success'] ?? false)) {
                    return [true, null];
                }

                return [false, (string) ($payload['error'] ?? $payload['message'] ?? 'gateway_rejected_media')];
            }

            return [false, 'gateway_http_' . $response->status()];
        } catch (\Throwable $exception) {
            Log::warning('Termination media WhatsApp failed', ['error' => $exception->getMessage()]);

            return [false, 'Gateway media error: ' . $exception->getMessage()];
        }
    }

    private function sendText(string $phone, string $message, string $name): array
    {
        try {
            $response = Http::timeout(30)->post($this->gatewayUrl() . '/send', [
                'phone' => $phone,
                'name' => $name,
                'message' => $message,
            ]);

            if ($response->successful()) {
                $payload = $response->json();
                if (is_array($payload) && array_key_exists('success', $payload) && !$payload['success']) {
                    return [false, (string) ($payload['error'] ?? $payload['message'] ?? 'gateway_rejected')];
                }

                return [true, null];
            }

            return [false, 'gateway_http_' . $response->status()];
        } catch (\Throwable $exception) {
            return [false, 'Gateway error: ' . $exception->getMessage()];
        }
    }

    private function finishWhatsApp(CustomerTerminationRequest $request, string $message, string $status, ?string $error, array $meta): array
    {
        $request->update([
            'status' => $status === 'sent' && $request->status === 'draft' ? 'notified' : $request->status,
            'whatsapp_status' => $status,
            'whatsapp_error' => $error,
            'whatsapp_sent_at' => now(),
            'notified_at' => $status === 'sent' ? now() : $request->notified_at,
        ]);

        try {
            NotificationLog::create([
                'customer_id' => $request->customer_id,
                'phone' => $request->customer?->phone,
                'message' => mb_substr($message, 0, 2000),
                'notice_id' => null,
                'status' => in_array($status, ['sent', 'failed', 'skipped'], true) ? $status : 'failed',
                'error' => $error,
                'meta' => array_merge([
                    'channel' => 'whatsapp',
                    'type' => 'customer_termination',
                    'termination_id' => $request->id,
                    'document_number' => $request->document_number,
                ], $meta),
                'sent_at' => now(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Failed to log termination WhatsApp', ['error' => $exception->getMessage()]);
        }

        return [
            'success' => $status === 'sent',
            'status' => $status,
            'error' => $error,
            'meta' => $meta,
        ];
    }

    private function qrDataUri(string $content): string
    {
        try {
            $renderer = new ImageRenderer(new RendererStyle(220), new SvgImageBackEnd());
            $writer = new Writer($renderer);
            $svg = $writer->writeString($content);

            return 'data:image/svg+xml;base64,' . base64_encode($svg);
        } catch (\Throwable $exception) {
            Log::warning('Failed generating termination QR', ['error' => $exception->getMessage()]);

            return '';
        }
    }

    private function localImageDataUri(string $path): ?string
    {
        if (!is_file($path)) {
            return null;
        }

        $mime = mime_content_type($path) ?: 'image/png';

        return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($path));
    }

    private function stringInput(array $input, string $key): ?string
    {
        $value = trim((string) ($input[$key] ?? ''));

        return $value !== '' ? $value : null;
    }

    private function regionLabel(Customer $customer): string
    {
        return $customer->dusun?->name
            ?: $customer->desa?->name
            ?: $customer->kecamatan?->name
            ?: ($customer->area_code ?: ($customer->address ?: 'Tidak Terdata'));
    }

    private function gatewayUrl(): string
    {
        return rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
    }

    private function absolutePublicUrl(string $url): string
    {
        if (preg_match('/^https?:\/\//i', $url)) {
            return $url;
        }

        return rtrim((string) config('app.url'), '/') . '/' . ltrim($url, '/');
    }

    private function isValidPhone(?string $phone): bool
    {
        if (!$phone || $phone === '0') {
            return false;
        }

        $cleaned = preg_replace('/\D/', '', $phone);

        return strlen((string) $cleaned) >= 10 && strlen((string) $cleaned) <= 15;
    }
}
