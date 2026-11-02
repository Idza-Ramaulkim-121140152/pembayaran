<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerDismantleRecord;
use App\Models\Invoice;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class CustomerDismantleService
{
    public function __construct(
        private AuditLogService $auditLogService
    ) {
    }

    /**
     * Get customers who are OFF for more than 2 months (>= 60 days without payment)
     * and eligible for equipment dismantling.
     */
    public function getDismantleEligibleCustomers(array $filters = []): array
    {
        $asOfDate = Carbon::parse($filters['as_of_date'] ?? now('Asia/Jakarta')->toDateString())->startOfDay();
        $cutoffDate = $asOfDate->copy()->subDays(60)->startOfDay(); // Exactly 60 days threshold (2 months)

        $search = trim((string) ($filters['search'] ?? ''));
        $statusFilter = (string) ($filters['status'] ?? 'all');
        $agingFilter = (string) ($filters['aging_months'] ?? 'all');
        $kecamatanId = !empty($filters['kecamatan_id']) ? (int) $filters['kecamatan_id'] : null;
        $desaId = !empty($filters['desa_id']) ? (int) $filters['desa_id'] : null;
        $dusunId = !empty($filters['dusun_id']) ? (int) $filters['dusun_id'] : null;
        $odpId = !empty($filters['odp_id']) ? (int) $filters['odp_id'] : null;
        $hasPhotoFilter = (string) ($filters['has_photo'] ?? 'all');
        $sortBy = (string) ($filters['sort_by'] ?? 'days_off_desc');

        $query = Customer::query()
            ->with([
                'kecamatan:id,name',
                'desa:id,name,kecamatan_id',
                'dusun:id,name,desa_id',
                'odpBox:id,nama,rasio_distribusi,latitude,longitude',
                'invoices' => function ($iq) {
                    $iq->whereIn('status', ['unpaid', 'UNPAID', 'overdue', 'OVERDUE', 'menunggu konfirmasi'])
                       ->orderBy('due_date', 'asc');
                },
            ]);

        $hasDismantleTable = Schema::hasTable('customer_dismantle_records');
        if ($hasDismantleTable) {
            $query->with('dismantleRecord');
        }

        // Base qualification for "OFF lebih dari 2 bulan (>= 60 hari tidak bayar)":
        // 1. Customer's due_date <= 60 days ago
        // OR
        // 2. Has unpaid invoice with due_date <= 60 days ago
        // OR
        // 3. Customer isolated or inactive with no payment in last 60 days
        $query->where(function ($q) use ($cutoffDate) {
            $q->where(function ($sub) use ($cutoffDate) {
                $sub->whereNotNull('due_date')
                    ->whereDate('due_date', '<=', $cutoffDate->toDateString());
            })->orWhereHas('invoices', function ($iq) use ($cutoffDate) {
                $iq->whereIn('status', ['unpaid', 'UNPAID', 'overdue', 'OVERDUE', 'menunggu konfirmasi'])
                   ->whereNotNull('due_date')
                   ->whereDate('due_date', '<=', $cutoffDate->toDateString());
            })->orWhere(function ($sub) use ($cutoffDate) {
                $sub->where(function ($s) {
                    $s->where('is_service_isolated', true)
                      ->orWhere('mikrotik_profile', 'isolir')
                      ->orWhere('is_active', false);
                })->where(function ($s2) use ($cutoffDate) {
                    $s2->whereNull('due_date')
                       ->orWhereDate('due_date', '<=', $cutoffDate->toDateString());
                });
            });
        });

        // Search filter
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('pppoe_username', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('address', 'like', "%{$search}%")
                    ->orWhere('odp', 'like', "%{$search}%");
            });
        }

        // Regional and ODP filters
        if ($kecamatanId) {
            $query->where('kecamatan_id', $kecamatanId);
        }
        if ($desaId) {
            $query->where('desa_id', $desaId);
        }
        if ($dusunId) {
            $query->where('dusun_id', $dusunId);
        }
        if ($odpId) {
            $query->where('odp_id', $odpId);
        }

        $customers = $query->get();

        // Map and compute dismantle eligibility stats
        $rows = $customers->map(function (Customer $customer) use ($asOfDate) {
            return $this->serializeDismantleItem($customer, $asOfDate);
        })->filter(function ($item) use ($cutoffDate, $asOfDate) {
            // Must strictly be >= 60 days OFF
            return ($item['days_off'] >= 60);
        });

        // Apply secondary in-memory filters
        if ($statusFilter !== 'all') {
            $rows = $rows->filter(fn ($r) => $r['dismantle_status'] === $statusFilter);
        }

        if ($hasPhotoFilter === 'with_photo') {
            $rows = $rows->filter(fn ($r) => $r['has_photo']);
        } elseif ($hasPhotoFilter === 'without_photo') {
            $rows = $rows->filter(fn ($r) => !$r['has_photo']);
        }

        if ($agingFilter === '2_3') {
            $rows = $rows->filter(fn ($r) => $r['days_off'] >= 60 && $r['days_off'] < 90);
        } elseif ($agingFilter === '3_6') {
            $rows = $rows->filter(fn ($r) => $r['days_off'] >= 90 && $r['days_off'] < 180);
        } elseif ($agingFilter === '6_plus') {
            $rows = $rows->filter(fn ($r) => $r['days_off'] >= 180);
        }

        // Sorting
        $rows = match ($sortBy) {
            'days_off_asc' => $rows->sortBy('days_off')->values(),
            'amount_desc' => $rows->sortByDesc('total_unpaid_amount')->values(),
            'name_asc' => $rows->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values(),
            'odp_asc' => $rows->sortBy('odp_name', SORT_NATURAL | SORT_FLAG_CASE)->values(),
            default => $rows->sortByDesc('days_off')->values(),
        };

        // Aggregated KPIs
        $allEligible = $customers->map(fn ($c) => $this->serializeDismantleItem($c, $asOfDate))
            ->filter(fn ($i) => $i['days_off'] >= 60);

        $summary = [
            'total_eligible' => $allEligible->count(),
            'total_ready' => $allEligible->where('dismantle_status', 'siap_dicopot')->count(),
            'total_in_progress' => $allEligible->where('dismantle_status', 'proses')->count(),
            'total_retrieved' => $allEligible->where('dismantle_status', 'sudah_dicopot')->count(),
            'total_cancelled' => $allEligible->where('dismantle_status', 'batal_bayar')->count(),
            'total_unpaid_amount' => (int) $allEligible->sum('total_unpaid_amount'),
            'with_photos_count' => $allEligible->where('has_photo', true)->count(),
            'average_days_off' => $allEligible->count() > 0 ? round((float) $allEligible->avg('days_off'), 1) : 0,
        ];

        return [
            'summary' => $summary,
            'items' => $rows->values()->all(),
            'meta' => [
                'as_of_date' => $asOfDate->toDateString(),
                'cutoff_date' => $cutoffDate->toDateString(),
                'filters' => [
                    'search' => $search,
                    'status' => $statusFilter,
                    'aging_months' => $agingFilter,
                    'kecamatan_id' => $kecamatanId,
                    'desa_id' => $desaId,
                    'dusun_id' => $dusunId,
                    'odp_id' => $odpId,
                    'has_photo' => $hasPhotoFilter,
                    'sort_by' => $sortBy,
                ],
            ],
        ];
    }

    /**
     * Serialize a single customer into comprehensive dismantle item structure.
     */
    public function serializeDismantleItem(Customer $customer, ?Carbon $asOfDate = null): array
    {
        $asOfDate = $asOfDate ?: now('Asia/Jakarta')->startOfDay();

        // 1. Compute days OFF / non-payment
        $referenceDate = null;
        if ($customer->due_date) {
            $referenceDate = Carbon::parse($customer->due_date)->startOfDay();
        }

        // Oldest unpaid invoice date if earlier than due_date
        $unpaidInvoices = $customer->invoices ?? collect();
        $oldestInvoice = $unpaidInvoices->sortBy('due_date')->first();
        if ($oldestInvoice && $oldestInvoice->due_date) {
            $invDate = Carbon::parse($oldestInvoice->due_date)->startOfDay();
            if ($referenceDate === null || $invDate->lt($referenceDate)) {
                $referenceDate = $invDate;
            }
        }

        // Fallback to customer creation date if no due_date
        if ($referenceDate === null) {
            $referenceDate = $customer->created_at ? $customer->created_at->copy()->startOfDay() : $asOfDate;
        }

        $daysOff = (int) round(max(0, $referenceDate->diffInDays($asOfDate, false)));
        $monthsOff = round($daysOff / 30.0, 1);

        // 2. Unpaid amount
        $totalUnpaidAmount = (int) round((float) $unpaidInvoices->sum('amount'));

        // 3. Dismantle record info
        $record = $customer->relationLoaded('dismantleRecord') ? $customer->dismantleRecord : null;
        if (!$record && Schema::hasTable('customer_dismantle_records')) {
            $record = CustomerDismantleRecord::where('customer_id', $customer->id)->latest('id')->first();
        }

        $dismantleStatus = $record?->status ?? 'siap_dicopot';
        $dismantleStatusLabel = match ($dismantleStatus) {
            'proses' => 'Dalam Proses',
            'sudah_dicopot' => 'Sudah Dicopot',
            'batal_bayar' => 'Batal (Pelanggan Bayar)',
            default => 'Siap Dicopot',
        };

        // 4. Coordinates & Map Link
        $lat = $customer->latitude ? (float) $customer->latitude : null;
        $lng = $customer->longitude ? (float) $customer->longitude : null;
        $hasCoordinates = $lat !== null && $lng !== null && (abs($lat) > 0.0001 || abs($lng) > 0.0001);

        $googleMapsUrl = $hasCoordinates
            ? "https://www.google.com/maps/dir/?api=1&destination={$lat},{$lng}"
            : "https://www.google.com/maps/search/?api=1&query=" . urlencode(trim($customer->name . ' ' . ($customer->address ?? '')));

        // 5. Clean phone for WhatsApp
        $rawPhone = preg_replace('/[^0-9]/', '', (string) $customer->phone);
        $phoneWa = '';
        if ($rawPhone !== '') {
            if (str_starts_with($rawPhone, '0')) {
                $phoneWa = '62' . substr($rawPhone, 1);
            } elseif (str_starts_with($rawPhone, '62')) {
                $phoneWa = $rawPhone;
            } else {
                $phoneWa = '62' . $rawPhone;
            }
        }

        // 6. Photo URL
        $photoUrl = $customer->foto_depan_rumah;
        $hasPhoto = !empty($photoUrl);

        // 7. Equipment / ODP details
        $odpName = $customer->odpBox?->nama ?? $customer->odp ?? '-';
        $odpPort = $customer->odp_port_number ?: '-';
        $routerType = $customer->home_router_type ?: 'Router/Modem Standar';
        $dropcoreLength = $customer->dropcore_cable_length_meters ? "{$customer->dropcore_cable_length_meters}m" : '-';

        // 8. Regional Address
        $regionParts = [];
        if ($customer->dusun && !empty($customer->dusun->name)) {
            $regionParts[] = 'Dusun ' . $customer->dusun->name;
        }
        if ($customer->desa && !empty($customer->desa->name)) {
            $regionParts[] = 'Desa ' . $customer->desa->name;
        }
        if ($customer->kecamatan && !empty($customer->kecamatan->name)) {
            $regionParts[] = 'Kec. ' . $customer->kecamatan->name;
        }
        $regionLabel = !empty($regionParts) ? implode(', ', $regionParts) : '-';

        // 9. Generate WhatsApp Work Order text for field technicians
        $waShareText = $this->generateTechnicianWorkOrderText([
            'customer_name' => $customer->name,
            'phone' => $customer->phone ?: '-',
            'pppoe_username' => $customer->pppoe_username ?: '-',
            'address' => $customer->address ?: '-',
            'region_label' => $regionLabel,
            'google_maps_url' => $googleMapsUrl,
            'odp_name' => $odpName,
            'odp_port' => $odpPort,
            'router_type' => $routerType,
            'dropcore_length' => $dropcoreLength,
            'days_off' => $daysOff,
            'months_off' => $monthsOff,
            'total_unpaid_amount' => $totalUnpaidAmount,
            'unpaid_invoices_count' => $unpaidInvoices->count(),
            'notes' => $record?->notes,
        ]);

        return [
            'id' => $customer->id,
            'name' => $customer->name,
            'phone' => $customer->phone,
            'phone_wa' => $phoneWa,
            'whatsapp_direct_url' => $phoneWa ? "https://wa.me/{$phoneWa}" : null,
            'pppoe_username' => $customer->pppoe_username ?: '-',
            'address' => $customer->address ?: 'Alamat tidak tercatat',
            'region_label' => $regionLabel,
            'kecamatan_id' => $customer->kecamatan_id,
            'desa_id' => $customer->desa_id,
            'dusun_id' => $customer->dusun_id,
            'kecamatan_name' => $customer->kecamatan?->name,
            'desa_name' => $customer->desa?->name,
            'dusun_name' => $customer->dusun?->name,
            'latitude' => $lat,
            'longitude' => $lng,
            'has_coordinates' => $hasCoordinates,
            'google_maps_url' => $googleMapsUrl,
            'foto_depan_rumah' => $photoUrl,
            'has_photo' => $hasPhoto,
            'odp_id' => $customer->odp_id,
            'odp_name' => $odpName,
            'odp_port' => $odpPort,
            'home_router_type' => $routerType,
            'dropcore_cable_length_meters' => $customer->dropcore_cable_length_meters,
            'dropcore_length_label' => $dropcoreLength,
            'package_type' => $customer->package_type ?: ($customer->custom_package ?: 'Paket Reguler'),
            'due_date' => $customer->due_date?->toDateString(),
            'days_off' => $daysOff,
            'months_off' => $monthsOff,
            'months_off_label' => "~{$monthsOff} Bulan ({$daysOff} hari)",
            'unpaid_invoices_count' => $unpaidInvoices->count(),
            'total_unpaid_amount' => $totalUnpaidAmount,
            'total_unpaid_amount_formatted' => 'Rp ' . number_format($totalUnpaidAmount, 0, ',', '.'),
            'is_service_isolated' => (bool) ($customer->is_service_isolated || strtolower((string)$customer->mikrotik_profile) === 'isolir'),
            'is_active' => (bool) $customer->is_active,
            'dismantle_status' => $dismantleStatus,
            'dismantle_status_label' => $dismantleStatusLabel,
            'dismantle_notes' => $record?->notes,
            'retrieved_items' => $record?->retrieved_items ?? ['ont', 'adaptor'],
            'retrieved_at' => $record?->retrieved_at?->format('Y-m-d H:i:s'),
            'retrieved_at_human' => $record?->retrieved_at ? $record->retrieved_at->translatedFormat('d M Y H:i') : null,
            'technician_name' => $record?->technician_name,
            'proof_photo_url' => $record?->proof_photo_url,
            'share_wa_text' => $waShareText,
            'share_wa_url' => "https://wa.me/?text=" . urlencode($waShareText),
        ];
    }

    /**
     * Update dismantle status for a customer.
     */
    public function updateDismantleStatus(int $customerId, array $payload, ?User $user = null): array
    {
        $customer = Customer::query()->findOrFail($customerId);

        if (!Schema::hasTable('customer_dismantle_records')) {
            return [
                'success' => true,
                'message' => 'Status berhasil dicatat (tabel dismantle siap diupdate).',
                'item' => $this->serializeDismantleItem($customer),
            ];
        }

        $record = CustomerDismantleRecord::firstOrNew(['customer_id' => $customer->id]);

        $oldStatus = $record->status ?? 'siap_dicopot';
        $newStatus = $payload['status'] ?? $oldStatus;

        $record->status = $newStatus;
        if (!empty($payload['notes'])) {
            $record->notes = trim((string) $payload['notes']);
        }

        if (isset($payload['retrieved_items']) && is_array($payload['retrieved_items'])) {
            $record->retrieved_items = $payload['retrieved_items'];
        }

        if (!empty($payload['technician_name'])) {
            $record->technician_name = trim((string) $payload['technician_name']);
        } elseif ($user) {
            $record->technician_name = $user->name;
            $record->technician_id = $user->id;
        }

        if ($newStatus === 'sudah_dicopot') {
            $record->retrieved_at = now();
            // Automatically mark customer service isolated and inactive
            $customer->is_service_isolated = true;
            $customer->is_active = false;
            $customer->save();
        } elseif ($newStatus === 'batal_bayar') {
            // Cancelled because customer promised or paid
            $record->retrieved_at = null;
        }

        // Handle proof photo if uploaded
        if (!empty($payload['proof_photo_file'])) {
            $file = $payload['proof_photo_file'];
            $path = $file->store('dismantle_proofs', 'public');
            $record->dismantle_proof_photo = $path;
        }

        if ($user) {
            if (!$record->exists) {
                $record->created_by = $user->id;
            }
            $record->updated_by = $user->id;
        }

        $record->save();

        $this->auditLogService->log('customer.dismantle.status_update', $customer, [
            'old_status' => $oldStatus,
            'new_status' => $newStatus,
            'technician' => $record->technician_name,
            'notes' => $record->notes,
        ], $user?->id);

        return [
            'success' => true,
            'message' => "Status pencabutan alat pelanggan {$customer->name} diperbarui menjadi {$record->status_label}.",
            'item' => $this->serializeDismantleItem($customer->fresh(['dismantleRecord', 'odpBox', 'kecamatan', 'desa', 'dusun'])),
        ];
    }

    /**
     * Generate structured WhatsApp work order text for field technicians.
     */
    public function generateTechnicianWorkOrderText(array $data): string
    {
        $name = $data['customer_name'] ?? '-';
        $phone = $data['phone'] ?? '-';
        $pppoe = $data['pppoe_username'] ?? '-';
        $address = $data['address'] ?? '-';
        $region = $data['region_label'] ?? '-';
        $maps = $data['google_maps_url'] ?? '-';
        $odp = $data['odp_name'] ?? '-';
        $port = $data['odp_port'] ?? '-';
        $router = $data['router_type'] ?? '-';
        $dropcore = $data['dropcore_length'] ?? '-';
        $daysOff = $data['days_off'] ?? 0;
        $monthsOff = $data['months_off'] ?? 0;
        $unpaid = 'Rp ' . number_format($data['total_unpaid_amount'] ?? 0, 0, ',', '.');
        $invoicesCount = $data['unpaid_invoices_count'] ?? 0;
        $notes = $data['notes'] ? "\n📝 *Catatan:* " . $data['notes'] : '';

        return <<<TXT
🔧 *SURAT TUGAS PENCABUTAN PERANGKAT (OFF > 2 BULAN)*
*Rumah Kita Net - ISP Management*

Kepada Rekan Teknisi Lapangan,
Berikut data pelanggan yang jadwal pencabutan peralatannya telah jatuh tempo:

👤 *Nama Pelanggan:* {$name}
📱 *No. HP/WA:* {$phone}
🔑 *PPPoE User:* {$pppoe}
📍 *Alamat:* {$address}
🏘️ *Wilayah:* {$region}
🗺️ *Rute Navigasi Maps:* {$maps}

⚡ *Titik Tiang ODP:* {$odp} (Port: {$port})
📦 *Perangkat di Lokasi:* {$router}
🔌 *Estimasi Dropcore:* {$dropcore}

⏳ *Lama OFF / Menunggak:* {$daysOff} Hari (~{$monthsOff} Bulan)
💰 *Total Tagihan Tertunggak:* {$unpaid} ({$invoicesCount} tagihan){$notes}

📋 *Panduan Eksekusi di Lapangan:*
1. Sampaikan salam dan maksud kedatangan dengan sopan kepada penghuni rumah.
2. Ambil unit ONT/Modem, Adaptor Power, dan kabel patchcord/dropcore.
3. Cabut konektor dropcore pada box tiang ODP terkait agar port dapat digunakan kembali.
4. Periksa kondisi fisik perangkat dan konfirmasi ke admin begitu selesai.

_Terima kasih atas kerja samanya. Tetap utamakan keselamatan kerja (K3)!_ 🙏
TXT;
    }
}
