<?php

namespace App\Services;

use App\Models\SiteSetting;
use Illuminate\Support\Str;

class PaymentVerificationConfigService
{
    public const SETTING_KEY = 'billing_payment_verification_config';

    public function getConfig(): array
    {
        $stored = SiteSetting::get(self::SETTING_KEY);
        $decoded = is_string($stored) ? json_decode($stored, true) : [];
        $storedConfig = is_array($decoded) ? $decoded : [];

        $config = array_replace_recursive($this->defaults(), $storedConfig);
        if (isset($storedConfig['destination_whitelist'])) {
            $config['destination_whitelist'] = $storedConfig['destination_whitelist'];
        }
        if (isset($storedConfig['notification_recipients'])) {
            $config['notification_recipients'] = $storedConfig['notification_recipients'];
        }
        $orEnvKey = (string) env('OPENROUTER_API_KEY', '');
        if (empty($config['openrouter_api_key'])) {
            $config['openrouter_api_key'] = $orEnvKey;
        }
        if (empty($config['openrouter_model'])) {
            $config['openrouter_model'] = (string) env('OPENROUTER_PAYMENT_VISION_MODEL', 'google/gemini-2.5-flash');
        }
        if (empty($config['ai_provider']) || $config['ai_provider'] === 'gemini') {
            $config['ai_provider'] = 'openrouter';
        }

        $envKey = (string) env('GEMINI_API_KEY', env('GOOGLE_API_KEY', ''));
        if (empty($config['gemini_api_key']) && $envKey !== '') {
            $config['gemini_api_key'] = $envKey;
        }
        if (empty($config['gemini_model']) || in_array($config['gemini_model'], ['gemini-1.5-flash', 'gemini-2.0-flash'])) {
            $config['gemini_model'] = 'gemini-2.5-flash';
        }
        if ((float) data_get($config, 'confidence_thresholds.auto_approve', 80) > 80) {
            $config['confidence_thresholds']['auto_approve'] = 80;
        }
        $config['notification_recipients'] = $this->normalizeNotificationRecipients(
            is_array($config['notification_recipients'] ?? null) ? $config['notification_recipients'] : []
        );

        return $config;
    }

    public function updateConfig(array $payload): array
    {
        $current = $this->getConfig();
        if (array_key_exists('openrouter_api_key', $payload) && !empty($payload['openrouter_api_key'])) {
            $current['openrouter_api_key'] = trim((string) $payload['openrouter_api_key']);
        }
        if (array_key_exists('openrouter_model', $payload) && !empty($payload['openrouter_model'])) {
            $current['openrouter_model'] = trim((string) $payload['openrouter_model']);
        }
        if (array_key_exists('destination_whitelist', $payload)) {
            $current['destination_whitelist'] = $payload['destination_whitelist'];
            unset($payload['destination_whitelist']);
        }
        if (array_key_exists('notification_recipients', $payload)) {
            $current['notification_recipients'] = $payload['notification_recipients'];
            unset($payload['notification_recipients']);
        }
        $config = array_replace_recursive($current, $payload);
        $config['notification_recipients'] = $this->normalizeNotificationRecipients(
            is_array($config['notification_recipients'] ?? null) ? $config['notification_recipients'] : []
        );
        SiteSetting::set(self::SETTING_KEY, json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        return $config;
    }

    public function notificationRecipientsFor(string $event): array
    {
        $config = $this->getConfig();
        $field = $event === 'auto_approved' ? 'receive_auto_approved' : 'receive_needs_review';

        return collect($this->normalizeNotificationRecipients(
            is_array($config['notification_recipients'] ?? null) ? $config['notification_recipients'] : []
        ))
            ->filter(fn (array $recipient) => ($recipient['is_active'] ?? false) && ($recipient[$field] ?? false))
            ->map(fn (array $recipient) => [
                'name' => $recipient['name'],
                'phone' => $recipient['phone'],
            ])
            ->values()
            ->all();
    }

    public function normalizeNotificationRecipients(array $recipients): array
    {
        return collect($recipients)
            ->filter(fn ($recipient) => is_array($recipient))
            ->map(function (array $recipient): array {
                $id = trim((string) ($recipient['id'] ?? ''));
                $name = trim((string) ($recipient['name'] ?? ''));
                $phone = $this->normalizePhone((string) ($recipient['phone'] ?? ''));

                return [
                    'id' => $id !== '' ? $id : (string) Str::uuid(),
                    'name' => $name,
                    'phone' => $phone,
                    'is_active' => (bool) ($recipient['is_active'] ?? true),
                    'receive_auto_approved' => (bool) ($recipient['receive_auto_approved'] ?? false),
                    'receive_needs_review' => (bool) ($recipient['receive_needs_review'] ?? false),
                ];
            })
            ->values()
            ->all();
    }

    public function defaults(): array
    {
        return [
            'ai_provider' => 'openrouter',
            'openrouter_api_key' => (string) env('OPENROUTER_API_KEY', ''),
            'openrouter_model' => (string) env('OPENROUTER_PAYMENT_VISION_MODEL', 'google/gemini-2.5-flash'),
            'gemini_api_key' => (string) env('GEMINI_API_KEY', env('GOOGLE_API_KEY', '')),
            'gemini_model' => (string) env('GEMINI_PAYMENT_VISION_MODEL', 'gemini-2.5-flash'),
            'openai_api_key' => (string) env('OPENAI_API_KEY', ''),
            'openai_model' => (string) env('OPENAI_PAYMENT_VISION_MODEL', 'gpt-4o-mini'),
            'auto_approve_enabled' => true,
            'confidence_thresholds' => [
                'auto_approve' => 80,
                'manual_review' => 70,
            ],
            'allowed_source_mime_types' => [
                'image/jpeg',
                'image/jpg',
                'image/png',
                'image/webp',
                'image/heic',
                'image/heif',
                'image/jfif',
                'image/pjpeg',
                'application/pdf',
            ],
            'destination_whitelist' => [
                'qris' => [
                    [
                        'name' => 'Rumah Kita Net',
                        'merchant_id' => 'ID1024339131558',
                        'aliases' => ['Rumah Kita Net , KALIANDA', 'Rumah Kita Network', 'COM.GO-JEK.WWW', 'GoPay', 'GoBiz'],
                        'active' => true,
                    ],
                ],
                'transfer_bank' => [],
            ],
            'notification_recipients' => [],
        ];
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?: '';
        if ($digits === '') {
            return '';
        }

        if (str_starts_with($digits, '62')) {
            return '0' . substr($digits, 2);
        }

        return str_starts_with($digits, '0') ? $digits : '0' . $digits;
    }
}
