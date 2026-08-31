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
        $config['notification_recipients'] = $this->normalizeNotificationRecipients(
            is_array($config['notification_recipients'] ?? null) ? $config['notification_recipients'] : []
        );

        return $config;
    }

    public function updateConfig(array $payload): array
    {
        $config = array_replace_recursive($this->getConfig(), $payload);
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
            'ai_provider' => 'auto',
            'gemini_model' => (string) env('GEMINI_PAYMENT_VISION_MODEL', 'gemini-1.5-flash'),
            'openai_model' => (string) env('OPENAI_PAYMENT_VISION_MODEL', 'gpt-4o-mini'),
            'auto_approve_enabled' => true,
            'confidence_thresholds' => [
                'auto_approve' => 95,
                'manual_review' => 70,
            ],
            'allowed_source_mime_types' => [
                'image/jpeg',
                'image/png',
                'image/webp',
                'application/pdf',
            ],
            'destination_whitelist' => [
                'qris' => [[
                    'name' => 'Rumah Kita Network',
                    'merchant_id' => 'G141935892',
                    'aliases' => ['rumahkitanetwork', 'mabdulrohman'],
                    'active' => true,
                ]],
                'transfer_bank' => [[
                    'name' => 'M ABDUL ROHMAN',
                    'account_number' => '0847566563',
                    'aliases' => ['abdulrohman', 'rumahkitanetwork'],
                    'active' => true,
                ]],
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
