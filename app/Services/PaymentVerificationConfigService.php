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
        if (array_key_exists('destination_whitelist', $storedConfig)) {
            $config['destination_whitelist'] = $storedConfig['destination_whitelist'];
        }
        if (array_key_exists('notification_recipients', $storedConfig)) {
            $config['notification_recipients'] = $storedConfig['notification_recipients'];
        }
        if (array_key_exists('excluded_senders', $storedConfig)) {
            $config['excluded_senders'] = $storedConfig['excluded_senders'];
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
        $config['excluded_senders'] = $this->normalizeExcludedSenders(
            is_array($config['excluded_senders'] ?? null) ? $config['excluded_senders'] : []
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
        if (array_key_exists('excluded_senders', $payload)) {
            $current['excluded_senders'] = $payload['excluded_senders'];
            unset($payload['excluded_senders']);
        }
        $config = array_replace_recursive($current, $payload);
        $config['notification_recipients'] = $this->normalizeNotificationRecipients(
            is_array($config['notification_recipients'] ?? null) ? $config['notification_recipients'] : []
        );
        $config['excluded_senders'] = $this->normalizeExcludedSenders(
            is_array($config['excluded_senders'] ?? null) ? $config['excluded_senders'] : []
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
                        'aliases' => [
                            'Rumah Kita Net , KALIANDA',
                            'Rumah Kita Network',
                            'COM.GO-JEK.WWW',
                            'GoPay',
                            'GoBiz',
                            'DOMPET ANAK BANGSA',
                            'G848826679',
                            '9360091438488266793',
                        ],
                        'active' => true,
                    ],
                ],
                'transfer_bank' => [],
            ],
            'notification_recipients' => [],
            'excluded_senders' => [
                [
                    'id' => 'excluded-admin-adul',
                    'name' => 'Adul / Abdrohman (Admin)',
                    'phone' => '085840635530',
                    'lid' => '130167959728202',
                    'is_active' => true,
                ],
            ],
        ];
    }

    public function normalizeExcludedSenders(array $items): array
    {
        return collect($items)
            ->filter(fn ($item) => is_array($item))
            ->map(function (array $item): array {
                $id = trim((string) ($item['id'] ?? ''));
                $name = trim((string) ($item['name'] ?? ''));
                $rawPhone = trim((string) ($item['phone'] ?? ''));
                $rawLid = trim((string) ($item['lid'] ?? ''));

                $phone = '';
                $lid = '';

                foreach ([$rawPhone, $rawLid] as $raw) {
                    if ($raw === '') {
                        continue;
                    }
                    if ($this->isLidIdentifier($raw)) {
                        if ($lid === '') {
                            $lid = $this->cleanLidIdentifier($raw);
                        }
                    } else {
                        $normalizedPhone = $this->normalizePhone($raw);
                        if ($normalizedPhone !== '' && $phone === '') {
                            $phone = $normalizedPhone;
                        }
                    }
                }

                return [
                    'id' => $id !== '' ? $id : (string) Str::uuid(),
                    'name' => $name,
                    'phone' => $phone,
                    'lid' => $lid,
                    'is_active' => (bool) ($item['is_active'] ?? true),
                ];
            })
            ->values()
            ->all();
    }

    public function matchExcludedSender(?string $senderPhone, ?string $senderLid = null): ?array
    {
        $incomingTokens = $this->extractSenderTokens($senderPhone, $senderLid);
        if (empty($incomingTokens)) {
            return null;
        }

        $entries = $this->getConfig()['excluded_senders'] ?? [];
        foreach ($entries as $entry) {
            if (!($entry['is_active'] ?? false)) {
                continue;
            }

            $entryTokens = $this->extractSenderTokens(
                (string) ($entry['phone'] ?? ''),
                (string) ($entry['lid'] ?? '')
            );

            if (!empty(array_intersect($incomingTokens, $entryTokens))) {
                return $entry;
            }
        }

        return null;
    }

    public function addExcludedSender(array $entry): array
    {
        $normalizedList = $this->normalizeExcludedSenders([$entry]);
        $candidate = $normalizedList[0] ?? [];
        $candidateTokens = $this->extractSenderTokens(
            (string) ($candidate['phone'] ?? ''),
            (string) ($candidate['lid'] ?? '')
        );

        $config = $this->getConfig();
        $existing = is_array($config['excluded_senders'] ?? null) ? $config['excluded_senders'] : [];
        $mergedEntry = null;

        foreach ($existing as $idx => $item) {
            $itemTokens = $this->extractSenderTokens(
                (string) ($item['phone'] ?? ''),
                (string) ($item['lid'] ?? '')
            );

            if (!empty(array_intersect($candidateTokens, $itemTokens))) {
                $existing[$idx] = [
                    'id' => $item['id'],
                    'name' => $candidate['name'] !== '' ? $candidate['name'] : ($item['name'] ?? 'Admin'),
                    'phone' => $candidate['phone'] !== '' ? $candidate['phone'] : ($item['phone'] ?? ''),
                    'lid' => $candidate['lid'] !== '' ? $candidate['lid'] : ($item['lid'] ?? ''),
                    'is_active' => true,
                ];
                $mergedEntry = $existing[$idx];
                break;
            }
        }

        if ($mergedEntry === null) {
            $candidate['name'] = $candidate['name'] !== '' ? $candidate['name'] : 'Admin / Internal';
            $candidate['is_active'] = true;
            $existing[] = $candidate;
            $mergedEntry = $candidate;
        }

        $updatedConfig = $this->updateConfig(['excluded_senders' => $existing]);

        return [
            'entry' => $mergedEntry,
            'config' => $updatedConfig,
        ];
    }

    /**
     * Build canonical comparison tokens for phone numbers and WhatsApp Multi-Device LIDs.
     *
     * @return array<int, string>
     */
    public function extractSenderTokens(?string $phone, ?string $lid = null): array
    {
        $tokens = [];

        foreach ([$phone, $lid] as $raw) {
            $value = trim((string) $raw);
            if ($value === '') {
                continue;
            }

            if ($this->isLidIdentifier($value)) {
                $cleanLid = $this->cleanLidIdentifier($value);
                if ($cleanLid !== '') {
                    $tokens[] = 'lid:' . $cleanLid;
                    $tokens[] = 'digits:' . $cleanLid;
                    $tokens[] = 'digits:0' . $cleanLid;
                }
                continue;
            }

            $digits = preg_replace('/\D/', '', $value) ?: '';
            if (strlen($digits) < 7) {
                continue;
            }

            $localPhone = $this->normalizePhone($digits);
            $tokens[] = 'digits:' . $digits;
            if ($localPhone !== '') {
                $tokens[] = 'digits:' . $localPhone;
                $tokens[] = 'digits:' . ltrim($localPhone, '0');
                if (str_starts_with($localPhone, '0')) {
                    $tokens[] = 'digits:62' . substr($localPhone, 1);
                }
            }
        }

        return array_values(array_unique($tokens));
    }

    public function isLidIdentifier(?string $val): bool
    {
        if (!$val) {
            return false;
        }
        $str = (string) $val;
        if (str_contains($str, '@lid')) {
            return true;
        }
        $digits = preg_replace('/\D/', '', $str) ?: '';

        return strlen($digits) >= 14 && (
            str_starts_with($digits, '1') ||
            str_starts_with($digits, '2') ||
            str_starts_with($digits, '01') ||
            str_starts_with($digits, '02')
        );
    }

    public function cleanLidIdentifier(?string $val): string
    {
        if (!$val) {
            return '';
        }
        $digits = preg_replace('/\D/', '', str_replace('@lid', '', $val)) ?: '';
        if (strlen($digits) >= 15 && str_starts_with($digits, '0')) {
            return substr($digits, 1);
        }

        return $digits;
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
