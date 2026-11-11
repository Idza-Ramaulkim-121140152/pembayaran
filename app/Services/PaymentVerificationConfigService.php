<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\PayrollMember;
use App\Models\SiteSetting;
use App\Models\User;
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

        $defaultAliasesById = collect($this->defaults()['excluded_senders'] ?? [])
            ->filter(fn ($entry) => is_array($entry) && !empty($entry['id']) && !empty($entry['aliases']))
            ->mapWithKeys(fn ($entry) => [$entry['id'] => $entry['aliases']])
            ->all();

        $rawExcluded = is_array($config['excluded_senders'] ?? null) ? $config['excluded_senders'] : [];
        $rawExcluded = array_map(function ($entry) use ($defaultAliasesById) {
            if (
                is_array($entry)
                && !array_key_exists('aliases', $entry)
                && isset($entry['id'], $defaultAliasesById[$entry['id']])
            ) {
                $entry['aliases'] = $defaultAliasesById[$entry['id']];
            }

            return $entry;
        }, $rawExcluded);

        $config['excluded_senders'] = $this->normalizeExcludedSenders($rawExcluded);

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
                    'aliases' => ['Adul', 'Abdrohman', 'M ABDUL ROHMAN', 'Abdul Rohman'],
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
                $aliases = $this->normalizeAliasesList($item['aliases'] ?? []);

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
                    'aliases' => $aliases,
                    'phone' => $phone,
                    'lid' => $lid,
                    'is_active' => (bool) ($item['is_active'] ?? true),
                ];
            })
            ->values()
            ->all();
    }

    public function matchExcludedSender(?string $senderPhone, ?string $senderLid = null, ?string $senderName = null): ?array
    {
        $incomingTokens = $this->extractSenderTokens($senderPhone, $senderLid);
        $entries = $this->getConfig()['excluded_senders'] ?? [];

        if (!empty($incomingTokens)) {
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
        }

        if ($senderName !== null && trim($senderName) !== '') {
            return $this->matchExcludedSenderByName($senderName);
        }

        return null;
    }

    public function matchExcludedSenderByName(?string $name): ?array
    {
        $incomingNorm = $this->normalizeComparableName($name);
        if ($this->isIgnorablePersonName($incomingNorm, 3)) {
            return null;
        }

        $entries = $this->getConfig()['excluded_senders'] ?? [];
        foreach ($entries as $entry) {
            if (!($entry['is_active'] ?? false)) {
                continue;
            }

            foreach ($this->extractExcludedEntryNames($entry) as $candidateNorm) {
                if ($incomingNorm === $candidateNorm) {
                    return $entry;
                }

                if (strlen($candidateNorm) >= 4 && preg_match('/\b' . preg_quote($candidateNorm, '/') . '\b/', $incomingNorm)) {
                    return $entry;
                }

                if (strlen($incomingNorm) >= 4 && preg_match('/\b' . preg_quote($incomingNorm, '/') . '\b/', $candidateNorm)) {
                    return $entry;
                }
            }
        }

        return null;
    }

    public function matchExcludedSenderInText(?string $text): ?array
    {
        $normalizedText = $this->normalizeComparableName($text);
        if ($normalizedText === '') {
            return null;
        }

        $entries = $this->getConfig()['excluded_senders'] ?? [];
        foreach ($entries as $entry) {
            if (!($entry['is_active'] ?? false)) {
                continue;
            }

            foreach ($this->extractExcludedEntryNames($entry) as $candidateNorm) {
                if (strlen($candidateNorm) < 4) {
                    continue;
                }

                if (preg_match('/\b' . preg_quote($candidateNorm, '/') . '\b/', $normalizedText)) {
                    return $entry;
                }
            }
        }

        return null;
    }

    /**
     * Detect whether a sender identity or payer name belongs to an excluded admin or internal staff member.
     *
     * @return array<string, mixed>|null
     */
    public function matchInternalStaffIdentity(
        ?string $senderPhone = null,
        ?string $senderLid = null,
        ?string $senderName = null,
        ?Customer $targetCustomer = null
    ): ?array {
        $excluded = $this->matchExcludedSender($senderPhone, $senderLid, $senderName);
        if ($excluded) {
            return [
                'type' => 'excluded_sender',
                'label' => (string) ($excluded['name'] ?? 'Admin Dikecualikan'),
                'entry' => $excluded,
            ];
        }

        $incomingTokens = $this->extractSenderTokens($senderPhone, $senderLid);
        $targetCustomerTokens = $targetCustomer
            ? $this->extractSenderTokens((string) ($targetCustomer->phone ?? ''))
            : [];

        // If the phone/LID matches the target customer themselves, do not block by phone lookup alone.
        $nonCustomerTokens = array_values(array_diff($incomingTokens, $targetCustomerTokens));

        $incomingNameNorm = $this->normalizeComparableName($senderName);
        $targetCustomerNameNorm = $targetCustomer
            ? $this->normalizeComparableName((string) ($targetCustomer->name ?? ''))
            : '';
        $checkName = !$this->isIgnorablePersonName($incomingNameNorm, 4)
            && $incomingNameNorm !== $targetCustomerNameNorm;

        if (empty($nonCustomerTokens) && !$checkName) {
            return null;
        }

        $staffUsers = User::query()
            ->whereIn('role', [User::ROLE_SUPERADMIN, User::ROLE_ADMIN, User::ROLE_TEKNISI, User::ROLE_FINANCE])
            ->get(['id', 'name', 'phone', 'role']);

        foreach ($staffUsers as $staffUser) {
            if (!empty($nonCustomerTokens) && !empty($staffUser->phone)) {
                $staffTokens = $this->extractSenderTokens((string) $staffUser->phone);
                if (!empty(array_intersect($nonCustomerTokens, $staffTokens))) {
                    return [
                        'type' => 'internal_staff',
                        'source' => 'user',
                        'id' => $staffUser->id,
                        'role' => $staffUser->role,
                        'label' => $staffUser->name,
                    ];
                }
            }

            if ($checkName) {
                $staffNameNorm = $this->normalizeComparableName((string) $staffUser->name);
                if (!$this->isIgnorablePersonName($staffNameNorm, 4) && $incomingNameNorm === $staffNameNorm) {
                    return [
                        'type' => 'internal_staff',
                        'source' => 'user',
                        'id' => $staffUser->id,
                        'role' => $staffUser->role,
                        'label' => $staffUser->name,
                    ];
                }
            }
        }

        $payrollMembers = PayrollMember::query()
            ->where('is_active', true)
            ->get(['id', 'nama', 'telepon', 'atas_nama_rekening']);

        foreach ($payrollMembers as $member) {
            if (!empty($nonCustomerTokens) && !empty($member->telepon)) {
                $memberTokens = $this->extractSenderTokens((string) $member->telepon);
                if (!empty(array_intersect($nonCustomerTokens, $memberTokens))) {
                    return [
                        'type' => 'internal_staff',
                        'source' => 'payroll',
                        'id' => $member->id,
                        'label' => $member->nama,
                    ];
                }
            }

            if ($checkName) {
                foreach ([$member->nama, $member->atas_nama_rekening] as $candidateField) {
                    $memberNameNorm = $this->normalizeComparableName((string) $candidateField);
                    if (!$this->isIgnorablePersonName($memberNameNorm, 4) && $incomingNameNorm === $memberNameNorm) {
                        return [
                            'type' => 'internal_staff',
                            'source' => 'payroll',
                            'id' => $member->id,
                            'label' => $member->nama,
                        ];
                    }
                }
            }
        }

        return null;
    }

    public function normalizeComparableName(?string $name): string
    {
        $raw = trim((string) $name);
        if ($raw === '') {
            return '';
        }

        // Remove parenthetical annotations such as "(Admin)"
        $withoutParens = preg_replace('/\([^)]*\)/', ' ', $raw) ?: $raw;
        $lower = mb_strtolower($withoutParens);
        // Replace non-alphanumeric punctuation (e.g. dots in "M. ABDUL ROHMAN") with spaces
        $alphaNum = preg_replace('/[^a-z0-9\s]/', ' ', $lower) ?: $lower;
        $collapsed = trim(preg_replace('/\s+/', ' ', $alphaNum) ?: '');

        // Strip common Indonesian honorifics at the beginning
        return trim(preg_replace('/^(?:bapak|ibu|bpk|pak|mas|mbak|kak|bang|sdr|sdri)\s+/i', '', $collapsed) ?: $collapsed);
    }

    /**
     * @param  mixed  $rawAliases
     * @return array<int, string>
     */
    private function normalizeAliasesList($rawAliases): array
    {
        if (is_string($rawAliases)) {
            $rawAliases = preg_split('/[,;\r\n]+/', $rawAliases) ?: [];
        }

        return collect(is_array($rawAliases) ? $rawAliases : [])
            ->map(fn ($alias) => trim((string) $alias))
            ->filter(fn ($alias) => $alias !== '')
            ->unique(fn ($alias) => mb_strtolower($alias))
            ->values()
            ->all();
    }

    /**
     * @return array<int, string>
     */
    private function extractExcludedEntryNames(array $entry): array
    {
        $candidates = [];
        $aliases = $this->normalizeAliasesList($entry['aliases'] ?? []);
        foreach ($aliases as $alias) {
            $candidates[] = $alias;
        }

        $entryName = trim((string) ($entry['name'] ?? ''));
        if ($entryName !== '') {
            $withoutParens = trim((string) (preg_replace('/\([^)]*\)/', ' ', $entryName) ?: $entryName));
            $candidates[] = $withoutParens;
            foreach (preg_split('/[\/,|]+/', $withoutParens) ?: [] as $part) {
                $candidates[] = trim((string) $part);
            }
        }

        return collect($candidates)
            ->map(fn ($value) => $this->normalizeComparableName((string) $value))
            ->filter(fn ($norm) => !$this->isIgnorablePersonName($norm, 3))
            ->unique()
            ->values()
            ->all();
    }

    private function isIgnorablePersonName(string $normalized, int $minLength = 3): bool
    {
        if ($normalized === '' || strlen($normalized) < $minLength) {
            return true;
        }

        return in_array($normalized, [
            'admin',
            'super admin',
            'superadmin',
            'admin finance',
            'admin keuangan',
            'finance',
            'teknisi',
            'kasir',
            'staff',
            'staf',
            'internal',
            'user',
            'test',
            'demo',
            'pelanggan',
            'customer',
        ], true);
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

            if (!empty($candidateTokens) && !empty(array_intersect($candidateTokens, $itemTokens))) {
                $existing[$idx] = [
                    'id' => $item['id'],
                    'name' => $candidate['name'] !== '' ? $candidate['name'] : ($item['name'] ?? 'Admin'),
                    'aliases' => $this->normalizeAliasesList(array_merge(
                        is_array($item['aliases'] ?? null) ? $item['aliases'] : [],
                        is_array($candidate['aliases'] ?? null) ? $candidate['aliases'] : []
                    )),
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
            $candidate['aliases'] = $this->normalizeAliasesList($candidate['aliases'] ?? []);
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
