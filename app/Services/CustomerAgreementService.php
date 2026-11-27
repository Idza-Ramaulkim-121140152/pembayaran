<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerAgreement;
use App\Models\CustomerProspect;
use App\Models\SiteSetting;
use App\Support\PdfImageHelper;
use App\Support\SafeExternalUrl;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CustomerAgreementService
{
    private const DEFAULT_COMPANY_NAME = 'RUMAH KITA NETWORK';
    private const DEFAULT_COMPANY_ADDRESS = 'Kebun Agung, RT:002 RW:001, Taman Agung, Kalianda, Lampung Selatan, Lampung (35551)';

    public function generate(Customer $customer, array $input = [], array $files = [], ?int $generatedBy = null): CustomerAgreement
    {
        $customer->loadMissing(['package', 'odpBox', 'dusun', 'desa', 'kecamatan']);

        $previousAgreement = $customer->agreements()->latest('id')->first();
        $prospect = $this->findMatchingProspect($customer);

        $agreement = CustomerAgreement::create([
            'customer_id' => $customer->id,
            'generated_by' => $generatedBy,
            'agreement_number' => $this->makeAgreementNumber($customer),
            'public_token' => Str::random(48),
            'status' => 'generated',
            'customer_data' => $this->customerSnapshot($customer, $input, $previousAgreement, $prospect),
            'device_data' => $this->deviceSnapshot($customer, $input, $previousAgreement),
            'attachment_paths' => $this->storeAttachments($customer, $files, $previousAgreement),
            'generated_at' => now(),
        ]);

        $signatureMeta = $this->signatureMeta($agreement);
        $agreement->signature_meta = $signatureMeta;
        $agreement->save();

        $pdfPath = $this->renderPdf($agreement->fresh(['customer']));
        $pdfHash = Storage::disk('public')->exists($pdfPath)
            ? hash('sha256', Storage::disk('public')->get($pdfPath))
            : null;

        $agreement->update([
            'pdf_path' => $pdfPath,
            'pdf_hash' => $pdfHash,
        ]);

        return $agreement->fresh(['customer']);
    }

    public function toPayload(CustomerAgreement $agreement): array
    {
        return [
            'id' => $agreement->id,
            'agreement_number' => $agreement->agreement_number,
            'status' => $agreement->status,
            'pdf_path' => $agreement->pdf_path,
            'pdf_url' => $agreement->pdf_url,
            'download_url' => $agreement->download_url,
            'verify_url' => $agreement->verify_url,
            'pdf_hash' => $agreement->pdf_hash,
            'customer_data' => $agreement->customer_data ?: [],
            'device_data' => $agreement->device_data ?: [],
            'attachment_paths' => $agreement->attachment_paths ?: [],
            'signature_meta' => $agreement->signature_meta ?: [],
            'whatsapp_status' => $agreement->whatsapp_status,
            'whatsapp_error' => $agreement->whatsapp_error,
            'whatsapp_sent_at' => optional($agreement->whatsapp_sent_at)->toISOString(),
            'generated_at' => optional($agreement->generated_at)->toISOString(),
            'created_at' => optional($agreement->created_at)->toISOString(),
        ];
    }

    private function makeAgreementNumber(Customer $customer): string
    {
        $prefix = 'SPB/RKN/' . now()->format('Ym');
        $sequence = str_pad((string) ($customer->agreements()->count() + 1), 2, '0', STR_PAD_LEFT);

        return $prefix . '/' . str_pad((string) $customer->id, 5, '0', STR_PAD_LEFT) . '-' . $sequence;
    }

    private function findMatchingProspect(Customer $customer): ?CustomerProspect
    {
        try {
            if (!Schema::hasTable('customer_prospects')) {
                return null;
            }

            $phone = trim((string) ($customer->phone ?? ''));
            $name = trim((string) ($customer->name ?? ''));

            if ($phone !== '') {
                $digits = preg_replace('/\D+/', '', $phone) ?: '';
                $tail = strlen($digits) >= 9 ? substr($digits, -9) : $digits;
                $found = CustomerProspect::query()
                    ->where('phone', $phone)
                    ->when($tail !== '', fn ($q) => $q->orWhere('phone', 'like', '%' . $tail))
                    ->latest('id')
                    ->first();
                if ($found) {
                    return $found;
                }
            }

            if ($name !== '') {
                return CustomerProspect::query()
                    ->where('name', $name)
                    ->latest('id')
                    ->first();
            }
        } catch (\Throwable) {
            return null;
        }

        return null;
    }

    private function customerSnapshot(
        Customer $customer,
        array $input,
        ?CustomerAgreement $previousAgreement = null,
        ?CustomerProspect $prospect = null
    ): array {
        $prevCustomer = is_array($previousAgreement?->customer_data) ? $previousAgreement->customer_data : [];

        $rawNik = $this->stringInput($input, 'contract_ktp_number')
            ?: ($customer->nik ?? null)
            ?: ($prospect?->nik ?? null);
        $maskedNik = $rawNik ? $this->maskNik($rawNik) : ($prevCustomer['ktp_number'] ?? null);

        $wilayah = trim((string) ($customer->wilayah_lengkap ?? ''));
        if ($wilayah === '-') {
            $wilayah = '';
        }

        $address = trim((string) ($customer->address ?? ''));
        $addressFull = $address;
        if ($wilayah !== '' && ($address === '' || !str_contains(strtolower($address), strtolower($wilayah)))) {
            $addressFull = $address !== '' ? ($address . ', ' . $wilayah) : $wilayah;
        }

        $photoLinks = $this->resolveCombinedPhotoLinks($input, $prevCustomer, $customer, $prospect);

        return [
            'company_name' => SiteSetting::get('contract_company_name', self::DEFAULT_COMPANY_NAME),
            'company_address' => SiteSetting::get('contract_company_address', self::DEFAULT_COMPANY_ADDRESS),
            'company_phone' => SiteSetting::get('company_phone', '085158025553'),
            'company_whatsapp' => SiteSetting::get('company_whatsapp', '085158025553'),
            'company_email' => SiteSetting::get('company_email', 'rumahkita69@gmail.com'),
            'director_name' => 'Idza Ramaulkim',
            'customer_name' => $customer->name,
            'gender' => $customer->gender ?: ($prevCustomer['gender'] ?? null),
            'ktp_number' => $maskedNik,
            'phone' => $customer->phone,
            'email' => $customer->email,
            'address' => $addressFull !== '' ? $addressFull : $address,
            'region' => $wilayah !== '' ? $wilayah : ($prevCustomer['region'] ?? null),
            'latitude' => $customer->latitude,
            'longitude' => $customer->longitude,
            'activation_date' => optional($customer->activation_date)->format('Y-m-d'),
            'due_date' => optional($customer->due_date)->format('Y-m-d'),
            'photo_links' => $photoLinks,
        ];
    }

    private function resolveCombinedPhotoLinks(
        array $input,
        array $prevCustomer,
        Customer $customer,
        ?CustomerProspect $prospect
    ): array {
        $links = $this->photoLinks($input);
        $byLabel = [];
        foreach ($links as $item) {
            $byLabel[$item['label']] = $item;
        }

        // Fallback dari kontrak sebelumnya jika regenerate dari halaman pelanggan tanpa input ulang
        foreach (($prevCustomer['photo_links'] ?? []) as $prevItem) {
            $label = (string) ($prevItem['label'] ?? '');
            $url = trim((string) ($prevItem['url'] ?? ''));
            if ($label !== '' && $url !== '' && !isset($byLabel[$label])) {
                $byLabel[$label] = ['label' => $label, 'url' => $url];
            }
        }

        // Fallback foto depan rumah dari tabel customers atau customer_prospects
        if (!isset($byLabel['Poto Depan Rumah'])) {
            $frontUrl = trim((string) ($customer->getRawOriginal('foto_depan_rumah') ?: ($prospect?->foto_depan_rumah ?? '')));
            if ($frontUrl !== '') {
                $byLabel['Poto Depan Rumah'] = ['label' => 'Poto Depan Rumah', 'url' => $frontUrl];
            }
        }

        return array_values($byLabel);
    }

    /**
     * Mask NIK showing only first 3 and last 3 digits, e.g. 180XXXXXXXXXX002
     */
    public function maskNik(?string $nik): ?string
    {
        $clean = trim((string) $nik);
        if ($clean === '') {
            return null;
        }

        $length = strlen($clean);
        if ($length <= 6) {
            return $clean;
        }

        $start = substr($clean, 0, 3);
        $end = substr($clean, -3);
        $maskedLength = $length - 6;
        $maskedMiddle = str_repeat('X', $maskedLength);

        return $start . $maskedMiddle . $end;
    }

    private function deviceSnapshot(
        Customer $customer,
        array $input,
        ?CustomerAgreement $previousAgreement = null
    ): array {
        $prevDevice = is_array($previousAgreement?->device_data) ? $previousAgreement->device_data : [];
        $resolvedOdp = $customer->odp_full_text
            ?: ($customer->odpBox?->nama ?? null)
            ?: trim((string) $customer->getRawOriginal('odp'))
            ?: ($prevDevice['odp'] ?? null);

        return [
            'package_name' => $customer->package?->name ?: ($customer->package_type ?: $customer->custom_package),
            'package_speed' => $customer->package?->speed,
            'package_price' => $customer->package?->price,
            'installation_fee' => $customer->installation_fee,
            'odp' => $resolvedOdp ?: '-',
            'pppoe_username' => $customer->pppoe_username,
            'mikrotik_profile' => $customer->mikrotik_profile,
            'router_type' => $customer->home_router_type ?: ($prevDevice['router_type'] ?? null),
            'router_host' => $customer->home_router_host ?: ($prevDevice['router_host'] ?? null),
            'dropcore_length' => $customer->dropcore_cable_length_meters ?: ($prevDevice['dropcore_length'] ?? null),
            'router_mac_address' => $this->stringInput($input, 'contract_router_mac') ?: ($prevDevice['router_mac_address'] ?? null),
            'device_serial_number' => $this->stringInput($input, 'contract_device_serial') ?: ($prevDevice['device_serial_number'] ?? null),
            'device_notes' => $this->stringInput($input, 'contract_device_notes') ?: ($prevDevice['device_notes'] ?? null),
        ];
    }

    private function storeAttachments(Customer $customer, array $files, ?CustomerAgreement $previousAgreement = null): array
    {
        $paths = [];
        foreach ($files as $file) {
            if (!$file instanceof UploadedFile || !$file->isValid()) {
                continue;
            }

            $paths[] = $file->store('customer-contracts/photos/' . $customer->id, 'public');
        }

        if ($paths === [] && is_array($previousAgreement?->attachment_paths)) {
            return array_values(array_filter($previousAgreement->attachment_paths));
        }

        return $paths;
    }

    private function signatureMeta(CustomerAgreement $agreement): array
    {
        $verifyUrl = route('contracts.public.verify', ['token' => $agreement->public_token], true);

        $companyStatement = 'Dokumen ini ditanda tangani digital oleh Idza Ramaulkim';
        $customerStatement = 'Pelanggan sudah setuju dengan perjanjian ini dan di tanda tangani digital';

        return [
            'company' => [
                'signer' => 'Idza Ramaulkim',
                'role' => '',
                'statement' => $companyStatement,
                'qr' => $this->qrDataUri("Nomor Kontrak: {$agreement->agreement_number}\n{$companyStatement}\nVerifikasi: {$verifyUrl}"),
            ],
            'customer' => [
                'signer' => $agreement->customer?->name,
                'role' => 'Pelanggan',
                'statement' => $customerStatement,
                'qr' => $this->qrDataUri("Nomor Kontrak: {$agreement->agreement_number}\n{$customerStatement}\nVerifikasi: {$verifyUrl}"),
            ],
            'verify_url' => $verifyUrl,
            'signed_at' => now()->toISOString(),
        ];
    }

    private function renderPdf(CustomerAgreement $agreement): string
    {
        $agreement->loadMissing('customer');

        $attachmentItems = collect($agreement->attachment_paths ?: [])
            ->map(function (string $path): array {
                $absolutePath = Storage::disk('public')->path($path);
                $mimeType = Storage::disk('public')->mimeType($path) ?: 'application/octet-stream';
                $dataUri = null;
                if (str_starts_with($mimeType, 'image/') && is_file($absolutePath)) {
                    $dataUri = 'data:' . $mimeType . ';base64,' . base64_encode((string) file_get_contents($absolutePath));
                }

                return [
                    'path' => $path,
                    'url' => Storage::disk('public')->url($path),
                    'absolute_path' => $absolutePath,
                    'data_uri' => $dataUri,
                    'is_image' => $dataUri !== null,
                ];
            })
            ->values()
            ->all();

        $pdf = Pdf::loadView('contracts.customer-agreement', [
            'agreement' => $agreement,
            'customerData' => $agreement->customer_data ?: [],
            'deviceData' => $agreement->device_data ?: [],
            'attachments' => $attachmentItems,
            'sheetPhotos' => $this->resolveSheetPhotos($agreement->customer_data['photo_links'] ?? []),
            'signatureMeta' => $agreement->signature_meta ?: [],
            'mmsLogoDataUri' => PdfImageHelper::toDataUri(public_path('logo-mms.png')),
            'logoDataUri' => PdfImageHelper::toDataUri(public_path('logo_baru.png')),
        ])->setPaper('a4');

        $path = 'customer-contracts/' . now()->format('Y/m') . '/' . Str::slug($agreement->agreement_number) . '.pdf';
        Storage::disk('public')->put($path, $pdf->output());

        return $path;
    }

    private function qrDataUri(string $content): string
    {
        try {
            $renderer = new ImageRenderer(new RendererStyle(220), new SvgImageBackEnd());
            $writer = new Writer($renderer);
            $svg = $writer->writeString($content);

            return 'data:image/svg+xml;base64,' . base64_encode($svg);
        } catch (\Throwable $exception) {
            Log::warning('Failed generating agreement QR', ['error' => $exception->getMessage()]);

            return '';
        }
    }

    private function stringInput(array $input, string $key): ?string
    {
        $value = trim((string) ($input[$key] ?? ''));

        return $value !== '' ? $value : null;
    }

    private function photoLinks(array $input): array
    {
        // Poto KTP dikecualikan dari kontrak PDF untuk privasi pelanggan
        $items = [
            ['key' => 'contract_photo_front_url', 'label' => 'Poto Depan Rumah'],
            ['key' => 'contract_photo_modem_url', 'label' => 'Poto Modem'],
            ['key' => 'contract_photo_opm_url', 'label' => 'Poto Redaman OPM'],
        ];

        $links = [];
        foreach ($items as $item) {
            $url = $this->stringInput($input, $item['key']);
            if ($url) {
                $links[] = [
                    'label' => $item['label'],
                    'url' => $url,
                ];
            }
        }

        return $links;
    }

    private function resolveSheetPhotos(array $photoLinks): array
    {
        return collect($photoLinks)
            ->map(function (array $item): array {
                $url = trim((string) ($item['url'] ?? ''));
                $dataUri = $url !== '' ? ($this->localImageDataUri($url) ?? $this->remoteImageDataUri($url)) : null;

                return [
                    'label' => (string) ($item['label'] ?? 'Foto'),
                    'url' => $url,
                    'data_uri' => $dataUri,
                    'is_image' => $dataUri !== null,
                    'error' => $dataUri ? null : 'Foto tidak dapat dimuat dari server lokal maupun Google Drive.',
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Baca foto langsung dari storage lokal server jika URL mengarah ke server sendiri (/storage/... atau domain aplikasi).
     */
    private function localImageDataUri(string $url): ?string
    {
        $trimmed = trim($url);
        if ($trimmed === '') {
            return null;
        }

        $pathCandidate = null;
        if (preg_match('#^https?://#i', $trimmed)) {
            $parsed = parse_url($trimmed);
            $host = strtolower((string) ($parsed['host'] ?? ''));
            $appHost = strtolower((string) (parse_url((string) config('app.url'), PHP_URL_HOST) ?: ''));
            $localHosts = array_filter([
                $appHost,
                'rumahkitanet.my.id',
                'www.rumahkitanet.my.id',
                'rumahkitanet.site',
                'www.rumahkitanet.site',
                '10.1.0.5',
                'localhost',
                '127.0.0.1',
            ]);

            if (!in_array($host, $localHosts, true)) {
                return null;
            }

            $pathCandidate = (string) ($parsed['path'] ?? '');
        } else {
            $pathCandidate = (string) (parse_url($trimmed, PHP_URL_PATH) ?? $trimmed);
        }

        $decodedPath = rawurldecode(trim($pathCandidate));
        if ($decodedPath === '' || str_contains($decodedPath, '..')) {
            return null;
        }

        $normalized = ltrim(str_replace('\\', '/', $decodedPath), '/');
        $storageRelative = str_starts_with($normalized, 'storage/')
            ? substr($normalized, strlen('storage/'))
            : $normalized;

        if ($storageRelative !== '' && Storage::disk('public')->exists($storageRelative)) {
            $absolute = Storage::disk('public')->path($storageRelative);
            return PdfImageHelper::toDataUri($absolute);
        }

        $publicAbsolute = public_path($normalized);
        if (is_file($publicAbsolute)) {
            return PdfImageHelper::toDataUri($publicAbsolute);
        }

        return null;
    }

    private function remoteImageDataUri(string $url): ?string
    {
        $candidateUrls = array_values(array_unique(array_filter([
            $this->googleDriveThumbnailUrl($url),
            $this->googleDriveDownloadUrl($url),
            $url,
        ])));

        foreach ($candidateUrls as $candidateUrl) {
            if (!SafeExternalUrl::isSafePublicHttpUrl($candidateUrl)) {
                Log::warning('Blocked unsafe agreement photo URL', ['url' => $candidateUrl]);
                continue;
            }

            try {
                $response = Http::timeout(12)
                    ->withHeaders(['User-Agent' => 'RumahKitaNetwork-ContractPDF/1.0'])
                    ->get($candidateUrl);

                if (!$response->successful()) {
                    continue;
                }

                $contentType = strtolower((string) $response->header('Content-Type', ''));
                $body = (string) $response->body();
                if ($body === '' || !str_starts_with($contentType, 'image/')) {
                    continue;
                }

                return 'data:' . strtok($contentType, ';') . ';base64,' . base64_encode($body);
            } catch (\Throwable $exception) {
                Log::warning('Failed fetching agreement Google Drive photo', [
                    'url' => $candidateUrl,
                    'error' => $exception->getMessage(),
                ]);
            }
        }

        return null;
    }

    private function googleDriveThumbnailUrl(string $url): ?string
    {
        $fileId = $this->googleDriveFileId($url);

        return $fileId ? 'https://drive.google.com/thumbnail?id=' . rawurlencode($fileId) . '&sz=w1200' : null;
    }

    private function googleDriveDownloadUrl(string $url): ?string
    {
        $fileId = $this->googleDriveFileId($url);

        return $fileId ? 'https://drive.google.com/uc?export=download&id=' . rawurlencode($fileId) : null;
    }

    private function googleDriveFileId(string $url): ?string
    {
        if (preg_match('~/file/d/([^/]+)~', $url, $matches)) {
            return $matches[1];
        }

        $query = parse_url($url, PHP_URL_QUERY);
        if ($query) {
            parse_str($query, $params);
            if (!empty($params['id'])) {
                return (string) $params['id'];
            }
        }

        return null;
    }
}
