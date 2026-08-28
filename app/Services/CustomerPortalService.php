<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerNetworkNoticeRead;
use App\Models\CustomerWifiAllowedPublicIp;
use App\Models\CustomerWifiSettingLink;
use App\Models\NetworkNotice;
use App\Models\PaymentMethod;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

class CustomerPortalService
{
    public function __construct(
        private CustomerUsageSnapshotService $customerUsageSnapshotService,
        private GenieAcsService $genieAcsService
    )
    {
    }

    public function buildDashboard(Customer $customer, ?Request $request = null): array
    {
        $customer->loadMissing('odp');

        $invoices = $customer->invoices()
            ->orderByDesc('created_at')
            ->take(12)
            ->get();

        $complaints = $customer->complaints()
            ->orderByDesc('created_at')
            ->take(10)
            ->get();

        $telemetry = $this->buildGenieAcsTelemetry($customer);
        $pppoeRuntime = $this->resolvePppoeRuntime($customer);
        $connection = $this->buildConnectionSummary($customer, $telemetry, $pppoeRuntime);
        $usage = $this->buildUsageSummary($telemetry);
        $household = $this->buildHouseholdSummary($connection, $telemetry);
        $wifiManagementAvailable = false;
        $paymentMethods = PaymentMethod::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->get();
        $openInvoices = $invoices
            ->filter(fn ($invoice) => !in_array(strtolower((string) $invoice->status), ['paid', 'cancelled'], true))
            ->values();

        $payload = [
            'customer' => $this->buildCustomerPayload($customer),
            'account_summary' => $this->buildAccountSummary($customer, $invoices),
            'connection' => $connection,
            'usage' => $usage,
            'usage_summary' => $usage,
            'household' => $household,
            'billing' => $this->buildBillingSummary($openInvoices),
            'support_summary' => $this->buildSupportSummary($customer, $complaints),
            'payment_methods' => $paymentMethods,
            'open_invoices' => $openInvoices,
            'wifi_link_portal' => $this->buildWifiLinkPortal($request),
            'portal_meta' => [
                'version' => 'v2',
                'refreshed_at' => now()->toIso8601String(),
                'capabilities' => [
                    'realtime_connection' => (bool) ($connection['status_available'] ?? false),
                    'session_traffic' => $usage['available'],
                    'home_device_count' => $household['home_device_count_available'],
                    'connected_wifi_devices' => $household['connected_wifi_devices_available'],
                    'customer_router_monitoring' => (bool) ($telemetry['device_found'] ?? false),
                ],
                'summary' => [
                    'internet_status' => ($connection['status_available'] ?? false)
                        ? ($connection['status_label'] ?? null)
                        : null,
                    'connected_device_count' => $household['home_device_count_available']
                        ? ($household['home_device_count'] ?? null)
                        : null,
                    'wifi_management_available' => $wifiManagementAvailable,
                    'router_monitoring_note' => $household['home_device_note'] ?? null,
                ],
            ],
            'invoices' => $invoices,
            'complaints' => $complaints,
        ];

        if (config('features.customer_self_service_v2', true)) {
            $payload = array_merge($payload, [
                'must_change_password' => (bool) ($customer->mobile_force_password_change ?? false),
                'payment_history' => $this->buildPaymentHistory($customer),
                'tickets' => $this->buildTickets($customer),
                'network_notices' => $this->buildNetworkNotices($customer),
            ]);
        }

        return $payload;
    }

    private function buildCustomerPayload(Customer $customer): array
    {
        $odpRelation = $this->resolveOdpRelation($customer);

        return [
            'id' => $customer->id,
            'nama' => $customer->nama,
            'alamat' => $customer->alamat,
            'no_telp' => $customer->no_telp,
            'user_pppoe' => $customer->user_pppoe,
            'paket' => $customer->paket,
            'harga' => $customer->harga,
            'tanggal_jatuh_tempo' => $customer->tanggal_jatuh_tempo,
            'is_active' => $customer->is_active,
            'odp' => $odpRelation?->nama ?? $customer->getAttribute('odp'),
            'email' => $customer->email,
            'activation_date' => optional($customer->activation_date)->toDateString(),
            'mikrotik_profile' => $customer->mikrotik_profile,
            'billing_auto_disabled' => (bool) ($customer->billing_auto_disabled ?? false),
            'home_router_type' => $customer->home_router_type,
            'must_change_password' => (bool) ($customer->mobile_force_password_change ?? false),
        ];
    }

    private function buildWifiLinkPortal(?Request $request): array
    {
        $clientIp = $request?->ip();
        $tablesReady = Schema::hasTable('customer_wifi_setting_links')
            && Schema::hasTable('customer_wifi_allowed_public_ips');

        if (!$tablesReady) {
            return [
                'links' => [],
                'client_ip' => $clientIp,
                'ip_allowed' => false,
                'message' => 'Fitur ubah password WiFi belum dikonfigurasi.',
            ];
        }

        $links = CustomerWifiSettingLink::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('title')
            ->get(['id', 'title', 'url', 'description', 'sort_order'])
            ->map(fn (CustomerWifiSettingLink $link) => [
                'id' => $link->id,
                'title' => $link->title,
                'url' => $link->url,
                'description' => $link->description,
                'sort_order' => $link->sort_order,
            ])
            ->values()
            ->all();

        $ipAllowed = $clientIp
            ? CustomerWifiAllowedPublicIp::query()
                ->where('is_active', true)
                ->where('ip_address', $clientIp)
                ->exists()
            : false;

        $message = $ipAllowed
            ? 'Silakan pilih link untuk mengubah password WiFi rumah Anda.'
            : 'Gunakan internet dari WiFi rumah Anda untuk membuka fitur ini.';

        if (empty($links)) {
            $message = 'Fitur ubah password WiFi belum dikonfigurasi.';
        }

        return [
            'links' => $links,
            'client_ip' => $clientIp,
            'ip_allowed' => $ipAllowed,
            'message' => $message,
        ];
    }

    private function buildPaymentHistory(Customer $customer)
    {
        return $customer->invoices()
            ->where('status', 'paid')
            ->orderByDesc('paid_at')
            ->orderByDesc('created_at')
            ->take(24)
            ->get()
            ->map(fn ($invoice) => [
                'id' => $invoice->id,
                'invoice_date' => $invoice->invoice_date?->toDateString(),
                'due_date' => $invoice->due_date?->toDateString(),
                'paid_at' => $invoice->paid_at?->toIso8601String(),
                'amount' => (float) $invoice->amount,
                'status' => $invoice->status,
                'invoice_link' => $invoice->invoice_link,
            ])
            ->values();
    }

    private function buildTickets(Customer $customer)
    {
        return $customer->complaints()
            ->with(['events' => fn ($query) => $query->where('is_internal', false)->orderBy('created_at')])
            ->orderByDesc('created_at')
            ->take(20)
            ->get()
            ->map(fn ($ticket) => [
                'id' => $ticket->id,
                'ticket_number' => $ticket->ticket_number,
                'subject' => $ticket->subject,
                'message' => $ticket->message,
                'category' => $ticket->category,
                'status' => $ticket->status,
                'priority' => $ticket->priority,
                'admin_response' => $ticket->admin_response,
                'created_at' => $ticket->created_at?->toIso8601String(),
                'last_activity_at' => $ticket->last_activity_at?->toIso8601String(),
                'public_ticket_events' => $ticket->events->values(),
            ])
            ->values();
    }

    private function buildNetworkNotices(Customer $customer)
    {
        if (!Schema::hasTable('network_notices')) {
            return collect();
        }

        $readIds = Schema::hasTable('customer_network_notice_reads')
            ? CustomerNetworkNoticeRead::query()
                ->where('customer_id', $customer->id)
                ->whereNotNull('dismissed_at')
                ->pluck('network_notice_id')
                ->map(fn ($id) => (int) $id)
                ->all()
            : [];

        $customerOdp = $this->resolveOdpRelation($customer)?->nama ?? $customer->odp;

        return NetworkNotice::active()
            ->ongoing()
            ->whereNotIn('id', $readIds)
            ->orderByDesc('severity')
            ->orderByDesc('created_at')
            ->get()
            ->filter(function (NetworkNotice $notice) use ($customerOdp) {
                if ($notice->is_mass || $notice->type === 'maintenance' || !$customerOdp) {
                    return true;
                }

                return in_array($customerOdp, $notice->affected_odp_array, true);
            })
            ->values();
    }

    private function buildAccountSummary(Customer $customer, $invoices): array
    {
        $lastPaidInvoice = $customer->invoices()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->orderByDesc('paid_at')
            ->first();

        $latestInvoice = $invoices->first();
        $dueDate = $customer->due_date ? Carbon::parse($customer->due_date) : null;

        return [
            'due_date' => optional($dueDate)->toDateString(),
            'days_until_due' => $dueDate ? Carbon::today()->diffInDays($dueDate, false) : null,
            'activation_date' => optional($customer->activation_date)->toDateString(),
            'last_payment_at' => $lastPaidInvoice?->paid_at?->toIso8601String(),
            'last_paid_amount' => $lastPaidInvoice?->amount !== null ? (float) $lastPaidInvoice->amount : null,
            'latest_invoice_status' => $latestInvoice?->status,
            'latest_invoice_amount' => $latestInvoice?->amount !== null ? (float) $latestInvoice->amount : null,
            'latest_invoice_due_date' => $latestInvoice?->due_date?->toDateString(),
            'open_invoice_count' => $customer->invoices()
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->count(),
            'paid_invoice_count' => $customer->invoices()
                ->where('status', 'paid')
                ->count(),
        ];
    }

    private function buildGenieAcsTelemetry(Customer $customer): array
    {
        $username = trim((string) ($customer->pppoe_username ?? ''));

        if ($username === '') {
            return [
                'device_found' => false,
                'device_id' => null,
                'serial_number' => null,
                'product_class' => null,
                'last_inform_at' => null,
                'last_inform_recent' => false,
                'wan_connected' => null,
                'wan_status' => null,
                'uptime' => null,
                'ip_address' => null,
                'traffic' => [
                    'available' => false,
                    'download_bytes' => null,
                    'upload_bytes' => null,
                    'total_bytes' => null,
                ],
                'hosts' => [
                    'available' => false,
                    'count' => null,
                    'source' => null,
                    'source_label' => null,
                ],
                'connected_devices' => [
                    'available' => false,
                    'count' => null,
                    'source' => null,
                    'source_label' => null,
                ],
                'wifi_clients' => [
                    'available' => false,
                    'ssids' => [],
                ],
                'error_message' => 'Router rumah belum siap dipantau untuk akun ini.',
            ];
        }

        try {
            return array_merge(
                ['device_found' => true, 'error_message' => null],
                $this->genieAcsService->summarizePortalTelemetryByPppoe($username)
            );
        } catch (\App\Exceptions\GenieAcsException $exception) {
            if ($exception->status() === 404) {
                return [
                    'device_found' => false,
                    'device_id' => null,
                    'serial_number' => null,
                    'product_class' => null,
                    'last_inform_at' => null,
                    'last_inform_recent' => false,
                    'wan_connected' => null,
                    'wan_status' => null,
                    'uptime' => null,
                    'ip_address' => null,
                    'traffic' => [
                        'available' => false,
                        'download_bytes' => null,
                        'upload_bytes' => null,
                        'total_bytes' => null,
                    ],
                    'hosts' => [
                        'available' => false,
                        'count' => null,
                        'source' => null,
                        'source_label' => null,
                    ],
                    'connected_devices' => [
                        'available' => false,
                        'count' => null,
                        'source' => null,
                        'source_label' => null,
                    ],
                    'wifi_clients' => [
                        'available' => false,
                        'ssids' => [],
                    ],
                    'error_message' => 'Perangkat rumah belum tersedia untuk akun ini.',
                ];
            }

            \Log::warning('Failed to build GenieACS customer portal telemetry', [
                'customer_id' => $customer->id,
                'pppoe_username' => $username,
                'status' => $exception->status(),
                'error' => $exception->getMessage(),
            ]);

            return [
                'device_found' => false,
                'device_id' => null,
                'serial_number' => null,
                'product_class' => null,
                'last_inform_at' => null,
                'last_inform_recent' => false,
                'wan_connected' => null,
                'wan_status' => null,
                'uptime' => null,
                'ip_address' => null,
                'traffic' => [
                    'available' => false,
                    'download_bytes' => null,
                    'upload_bytes' => null,
                    'total_bytes' => null,
                ],
                'hosts' => [
                    'available' => false,
                    'count' => null,
                    'source' => null,
                    'source_label' => null,
                ],
                'connected_devices' => [
                    'available' => false,
                    'count' => null,
                    'source' => null,
                    'source_label' => null,
                ],
                'wifi_clients' => [
                    'available' => false,
                    'ssids' => [],
                ],
                'error_message' => 'Data perangkat rumah belum bisa diakses saat ini.',
            ];
        } catch (\Throwable $e) {
            \Log::warning('Unexpected failure while building GenieACS customer portal telemetry', [
                'customer_id' => $customer->id,
                'pppoe_username' => $username,
                'error' => $e->getMessage(),
            ]);

            return [
                'device_found' => false,
                'device_id' => null,
                'serial_number' => null,
                'product_class' => null,
                'last_inform_at' => null,
                'last_inform_recent' => false,
                'wan_connected' => null,
                'wan_status' => null,
                'uptime' => null,
                'ip_address' => null,
                'traffic' => [
                    'available' => false,
                    'download_bytes' => null,
                    'upload_bytes' => null,
                    'total_bytes' => null,
                ],
                'hosts' => [
                    'available' => false,
                    'count' => null,
                    'source' => null,
                    'source_label' => null,
                ],
                'connected_devices' => [
                    'available' => false,
                    'count' => null,
                    'source' => null,
                    'source_label' => null,
                ],
                'wifi_clients' => [
                    'available' => false,
                    'ssids' => [],
                ],
                'error_message' => 'Data perangkat rumah belum siap ditampilkan.',
            ];
        }
    }

    private function buildConnectionSummary(Customer $customer, array $telemetry, array $pppoeRuntime): array
    {
        $status = 'unknown';
        $statusLabel = null;
        $statusNote = null;
        $statusAvailable = false;

        $pppoeUsername = trim((string) ($customer->pppoe_username ?? ''));
        $genieOnline = ($telemetry['wan_connected'] ?? null) === true && ($telemetry['last_inform_recent'] ?? false);
        $genieOfflineSignal = ($telemetry['wan_connected'] ?? null) === false
            || (($telemetry['last_inform_at'] ?? null) && !($telemetry['last_inform_recent'] ?? false));
        $pppoeActive = ($pppoeRuntime['active'] ?? null) === true;
        $pppoeInactive = ($pppoeRuntime['available'] ?? false) && ($pppoeRuntime['active'] ?? null) === false;

        if ($pppoeUsername === '') {
            $status = 'unknown';
        } elseif ($genieOnline || $pppoeActive) {
            $status = 'online';
            $statusLabel = 'Online';
            $statusNote = 'Internet rumah sedang aktif.';
            $statusAvailable = true;
        } elseif ($genieOfflineSignal && $pppoeInactive) {
            $status = 'offline';
            $statusLabel = 'Offline';
            $statusNote = 'Internet rumah sedang tidak aktif.';
            $statusAvailable = true;
        }

        $uptimeRaw = $telemetry['uptime'] ?? $pppoeRuntime['uptime'] ?? null;
        $uptimeLabel = $this->formatDurationLabel($uptimeRaw);
        $lastInformAt = $telemetry['last_inform_at'] ?? null;
        $ipAddress = $telemetry['ip_address'] ?? ($pppoeRuntime['address'] ?? null);
        $statusSource = $genieOnline && $pppoeActive
            ? 'genieacs_pppoe'
            : ($genieOnline ? 'genieacs' : ($pppoeActive ? 'pppoe' : ($genieOfflineSignal || $pppoeInactive ? 'genieacs_pppoe' : null)));

        return [
            'status' => $status,
            'status_label' => $statusLabel,
            'status_available' => $statusAvailable,
            'status_note' => $statusNote,
            'is_online' => $status === 'online',
            'is_isolated' => false,
            'has_pppoe_secret' => false,
            'is_customer_active' => (bool) $customer->is_active,
            'router_identity' => $telemetry['product_class'] ?? null,
            'router_version' => null,
            'pppoe_username' => $customer->pppoe_username ?: null,
            'package_name' => $customer->package_type,
            'configured_profile' => $customer->mikrotik_profile,
            'ip_address' => $ipAddress,
            'caller_id' => null,
            'uptime' => $uptimeRaw,
            'uptime_label' => $uptimeLabel,
            'uptime_available' => $uptimeLabel !== null,
            'last_checked_at' => now()->toIso8601String(),
            'last_inform_at' => $lastInformAt,
            'last_seen_available' => $lastInformAt !== null,
            'availability_note' => $statusAvailable ? $statusNote : null,
            'status_source' => $statusSource,
            'session' => [
                'active' => $status === 'online',
                'count' => $status === 'online' ? 1 : 0,
                'uptime' => $uptimeRaw,
                'uptime_label' => $uptimeLabel,
                'ip_address' => $ipAddress,
                'caller_id' => null,
                'session_id' => $telemetry['device_id'] ?? ($pppoeRuntime['session_id'] ?? null),
            ],
            'secret' => [
                'exists' => false,
                'profile' => null,
                'service' => null,
                'remote_address' => null,
                'local_address' => null,
                'disabled' => null,
            ],
            'traffic' => [
                'available' => (bool) ($telemetry['traffic']['available'] ?? false),
                'period' => 'genieacs_wan',
                'download_bytes' => $telemetry['traffic']['download_bytes'] ?? null,
                'upload_bytes' => $telemetry['traffic']['upload_bytes'] ?? null,
                'total_bytes' => $telemetry['traffic']['total_bytes'] ?? null,
                'download_label' => $this->formatBytes($telemetry['traffic']['download_bytes'] ?? null),
                'upload_label' => $this->formatBytes($telemetry['traffic']['upload_bytes'] ?? null),
                'total_label' => $this->formatBytes($telemetry['traffic']['total_bytes'] ?? null),
            ],
            'device_id' => $telemetry['device_id'] ?? null,
            'serial_number' => $telemetry['serial_number'] ?? null,
            'product_class' => $telemetry['product_class'] ?? null,
            'home_router' => [
                'available' => (bool) ($telemetry['device_found'] ?? false),
                'reachable' => (bool) ($telemetry['device_found'] ?? false),
                'status_label' => ($telemetry['device_found'] ?? false) ? 'Perangkat rumah tersedia' : null,
                'identity' => $telemetry['product_class'] ?? null,
                'version' => null,
                'wan_interface' => null,
                'wan_uptime' => $uptimeRaw,
                'wan_uptime_label' => $uptimeLabel,
                'host' => null,
                'availability_note' => null,
                'last_inform_at' => $lastInformAt,
                'serial_number' => $telemetry['serial_number'] ?? null,
                'product_class' => $telemetry['product_class'] ?? null,
            ],
        ];
    }

    private function buildUsageSummary(array $telemetry): array
    {
        $traffic = $telemetry['traffic'] ?? [];
        $available = (bool) ($traffic['available'] ?? false);

        return [
            'available' => $available,
            'cards_available' => $available,
            'period' => 'genieacs_wan',
            'download_bytes' => $traffic['download_bytes'] ?? null,
            'upload_bytes' => $traffic['upload_bytes'] ?? null,
            'total_bytes' => $traffic['total_bytes'] ?? null,
            'download_label' => $this->formatBytes($traffic['download_bytes'] ?? null),
            'upload_label' => $this->formatBytes($traffic['upload_bytes'] ?? null),
            'total_label' => $this->formatBytes($traffic['total_bytes'] ?? null),
            'note' => $available ? 'Pemakaian internet rumah terbaru sudah tersedia.' : null,
        ];
    }

    private function buildHouseholdSummary(array $connection, array $telemetry): array
    {
        $connectedDevices = $telemetry['connected_devices'] ?? [];
        $wifiClients = $telemetry['wifi_clients']['ssids'] ?? [];
        $deviceCountAvailable = (bool) ($connectedDevices['available'] ?? false);
        $connectedWifiDevicesAvailable = !empty($wifiClients);

        return [
            'active_household_sessions' => $connection['session']['count'],
            'active_household_sessions_note' => $connection['is_online'] ? 'Internet rumah sedang aktif.' : null,
            'home_device_count' => $connectedDevices['count'] ?? null,
            'home_device_count_available' => $deviceCountAvailable,
            'connected_wifi_devices_available' => $connectedWifiDevicesAvailable,
            'connected_wifi_ssids' => $connectedWifiDevicesAvailable ? array_values($wifiClients) : [],
            'home_device_note' => $deviceCountAvailable ? 'Jumlah perangkat yang sedang terhubung di rumah Anda.' : null,
        ];
    }

    private function buildBillingSummary($openInvoices): array
    {
        return [
            'has_open_invoices' => $openInvoices->isNotEmpty(),
            'open_invoice_count' => $openInvoices->count(),
        ];
    }

    private function buildSupportSummary(Customer $customer, $complaints): array
    {
        $latestComplaint = $complaints->first();

        return [
            'total_count' => $customer->complaints()->count(),
            'active_count' => $customer->complaints()
                ->whereIn('status', ['pending', 'in_progress'])
                ->count(),
            'latest_subject' => $latestComplaint?->subject,
            'latest_status' => $latestComplaint?->status,
        ];
    }

    private function resolveOdpRelation(Customer $customer)
    {
        if ($customer->relationLoaded('odp')) {
            return $customer->getRelation('odp');
        }

        try {
            return $customer->odp()->first();
        } catch (\Throwable $e) {
            \Log::warning('Failed to resolve ODP relation for customer portal', [
                'customer_id' => $customer->id,
                'odp_value' => $customer->getAttribute('odp'),
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function formatBytes(?int $bytes): ?string
    {
        if ($bytes === null) {
            return null;
        }

        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $size = (float) $bytes;
        $index = 0;

        while ($size >= 1024 && $index < count($units) - 1) {
            $size /= 1024;
            $index++;
        }

        return round($size, $index === 0 ? 0 : 2) . ' ' . $units[$index];
    }

    private function resolvePppoeRuntime(Customer $customer): array
    {
        $username = strtolower(trim((string) ($customer->pppoe_username ?? '')));

        if ($username === '') {
            return [
                'available' => false,
                'active' => null,
                'address' => null,
                'uptime' => null,
                'session_id' => null,
            ];
        }

        return Cache::remember(
            'customer-portal:pppoe-runtime:' . sha1($username),
            now()->addSeconds(30),
            function () use ($customer, $username) {
                try {
                    $connections = collect(app(MikroTikService::class)->getActivePPPoEConnections() ?? []);
                    $connection = $connections->first(function (array $item) use ($username) {
                        return strtolower(trim((string) ($item['name'] ?? ''))) === $username;
                    });

                    if (!$connection) {
                        return [
                            'available' => true,
                            'active' => false,
                            'address' => null,
                            'uptime' => null,
                            'session_id' => null,
                        ];
                    }

                    return [
                        'available' => true,
                        'active' => true,
                        'address' => $connection['address'] ?? null,
                        'uptime' => $connection['uptime'] ?? null,
                        'session_id' => $connection['session_id'] ?? null,
                    ];
                } catch (\Throwable $e) {
                    \Log::warning('Failed to resolve PPPoE runtime for customer portal.', [
                        'customer_id' => $customer->id,
                        'pppoe_username' => $customer->pppoe_username,
                        'error' => $e->getMessage(),
                    ]);

                    return [
                        'available' => false,
                        'active' => null,
                        'address' => null,
                        'uptime' => null,
                        'session_id' => null,
                    ];
                }
            }
        );
    }

    private function formatDurationLabel(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $seconds = $this->parseDurationToSeconds($value);

        if ($seconds === null || $seconds < 0) {
            return null;
        }

        $days = intdiv($seconds, 86400);
        $seconds %= 86400;
        $hours = intdiv($seconds, 3600);
        $seconds %= 3600;
        $minutes = intdiv($seconds, 60);
        $seconds %= 60;

        $parts = [];

        if ($days > 0) {
            $parts[] = $days . ' hari';
        }
        if ($hours > 0) {
            $parts[] = $hours . ' jam';
        }
        if ($minutes > 0) {
            $parts[] = $minutes . ' menit';
        }
        if (empty($parts)) {
            $parts[] = $seconds . ' detik';
        }

        return implode(' ', array_slice($parts, 0, 2));
    }

    private function parseDurationToSeconds(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }

        $normalized = trim((string) $value);
        if ($normalized === '') {
            return null;
        }

        if (preg_match('/^\d+$/', $normalized)) {
            return (int) $normalized;
        }

        if (preg_match('/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i', $normalized, $matches)) {
            $weeks = (int) ($matches[1] ?? 0);
            $days = (int) ($matches[2] ?? 0);
            $hours = (int) ($matches[3] ?? 0);
            $minutes = (int) ($matches[4] ?? 0);
            $seconds = (int) ($matches[5] ?? 0);
            $total = ($weeks * 604800) + ($days * 86400) + ($hours * 3600) + ($minutes * 60) + $seconds;

            return $total > 0 ? $total : null;
        }

        if (preg_match('/^(?:(\d+)d)?(\d{1,2}):(\d{2}):(\d{2})$/', $normalized, $matches)) {
            $days = (int) ($matches[1] ?? 0);
            $hours = (int) ($matches[2] ?? 0);
            $minutes = (int) ($matches[3] ?? 0);
            $seconds = (int) ($matches[4] ?? 0);

            return ($days * 86400) + ($hours * 3600) + ($minutes * 60) + $seconds;
        }

        return null;
    }
}
