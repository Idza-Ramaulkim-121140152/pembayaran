<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class InactiveCustomerReportService
{
    public function build(array $filters = []): array
    {
        $asOfDate = Carbon::parse($filters['as_of_date'] ?? now('Asia/Jakarta')->toDateString())->startOfDay();
        $search = trim((string) ($filters['search'] ?? ''));
        $isolationStatus = (string) ($filters['isolation_status'] ?? 'all');
        $invoiceStatus = (string) ($filters['invoice_status'] ?? 'all');
        $agingBucket = (string) ($filters['aging_bucket'] ?? 'all');
        $sortBy = (string) ($filters['sort_by'] ?? 'days_overdue_desc');

        $query = Customer::query()
            ->with([
                'kecamatan:id,name',
                'desa:id,name,kecamatan_id',
                'dusun:id,name,desa_id',
                'latestInvoice' => fn ($query) => $query->select([
                    'invoices.id',
                    'invoices.customer_id',
                    'invoices.invoice_link',
                    'invoices.status',
                    'invoices.amount',
                    'invoices.due_date',
                    'invoices.paid_at',
                    'invoices.created_at',
                ]),
            ])
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', $asOfDate->toDateString());

        if ($search !== '') {
            $query->where(function ($nested) use ($search) {
                $nested
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('pppoe_username', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('address', 'like', "%{$search}%");
            });
        }

        $customers = $query
            ->orderBy('due_date')
            ->get();

        $customerIds = $customers->pluck('id')->all();
        $openInvoiceMap = $this->openInvoiceSummary($customerIds, $asOfDate);
        $lastPaidInvoiceMap = $this->lastPaidInvoiceMap($customerIds);

        $rows = $customers
            ->map(fn (Customer $customer) => $this->serializeCustomer($customer, $asOfDate, $openInvoiceMap, $lastPaidInvoiceMap))
            ->filter(fn (array $row) => $this->passesFilters($row, $isolationStatus, $invoiceStatus, $agingBucket))
            ->values();

        $rows = $this->sortRows($rows, $sortBy);

        return [
            'summary' => $this->summary($rows),
            'radar' => $this->radar($rows),
            'aging' => $this->aging($rows),
            'by_region' => $this->byRegion($rows),
            'priority_rows' => $rows->where('priority_level', 'tinggi')->take(10)->values()->all(),
            'rows' => $rows->all(),
            'meta' => [
                'filters' => [
                    'as_of_date' => $asOfDate->toDateString(),
                    'search' => $search,
                    'isolation_status' => $isolationStatus,
                    'invoice_status' => $invoiceStatus,
                    'aging_bucket' => $agingBucket,
                    'sort_by' => $sortBy,
                ],
                'definition' => 'Pelanggan nonaktif pada laporan ini adalah pelanggan dengan tanggal jatuh tempo yang sudah lewat dari tanggal acuan.',
            ],
        ];
    }

    private function openInvoiceSummary(array $customerIds, Carbon $asOfDate): Collection
    {
        if (empty($customerIds)) {
            return collect();
        }

        return Invoice::query()
            ->whereIn('customer_id', $customerIds)
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->selectRaw('customer_id, COUNT(*) as invoice_count, COALESCE(SUM(amount), 0) as amount_total, MIN(due_date) as oldest_due_date')
            ->groupBy('customer_id')
            ->get()
            ->keyBy('customer_id')
            ->map(function ($row) use ($asOfDate) {
                $oldestDue = $row->oldest_due_date ? Carbon::parse($row->oldest_due_date)->startOfDay() : null;

                return [
                    'invoice_count' => (int) $row->invoice_count,
                    'amount_total' => (int) round((float) $row->amount_total),
                    'oldest_due_date' => $oldestDue?->toDateString(),
                    'oldest_days_overdue' => $oldestDue ? max(0, $oldestDue->diffInDays($asOfDate, false)) : 0,
                ];
            });
    }

    private function lastPaidInvoiceMap(array $customerIds): Collection
    {
        if (empty($customerIds)) {
            return collect();
        }

        return Invoice::query()
            ->whereIn('customer_id', $customerIds)
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->orderByDesc('paid_at')
            ->get(['id', 'customer_id', 'amount', 'paid_at'])
            ->groupBy('customer_id')
            ->map(fn (Collection $items) => $items->first());
    }

    private function serializeCustomer(Customer $customer, Carbon $asOfDate, Collection $openInvoiceMap, Collection $lastPaidInvoiceMap): array
    {
        $dueDate = $customer->due_date instanceof Carbon
            ? $customer->due_date->copy()->startOfDay()
            : Carbon::parse((string) $customer->due_date)->startOfDay();
        $daysOverdue = max(0, $dueDate->diffInDays($asOfDate, false));
        $isIsolated = (bool) $customer->is_service_isolated;
        $openInvoice = $openInvoiceMap->get($customer->id, [
            'invoice_count' => 0,
            'amount_total' => 0,
            'oldest_due_date' => null,
            'oldest_days_overdue' => 0,
        ]);
        $latestInvoice = $customer->latestInvoice;
        $lastPaidInvoice = $lastPaidInvoiceMap->get($customer->id);
        $overdueAmount = (int) ($openInvoice['amount_total'] ?? 0);
        $priorityScore = $this->priorityScore($daysOverdue, $overdueAmount, $isIsolated, (int) ($openInvoice['invoice_count'] ?? 0));
        $region = $this->regionLabel($customer);

        return [
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'pppoe_username' => $customer->pppoe_username,
            'phone' => $customer->phone,
            'package_label' => $customer->package_type ?: $customer->custom_package,
            'address' => $customer->address,
            'region_label' => $region['label'],
            'region_level' => $region['level'],
            'due_date' => $dueDate->toDateString(),
            'days_overdue' => $daysOverdue,
            'aging_bucket' => $this->agingBucketKey($daysOverdue),
            'aging_label' => $this->agingBucketLabel($daysOverdue),
            'is_isolated' => $isIsolated,
            'isolation_status' => $isIsolated ? 'isolir' : 'belum_isolir',
            'isolation_label' => $isIsolated ? 'Sudah isolir' : 'Belum isolir',
            'service_isolated_at' => optional($customer->service_isolated_at)->toDateTimeString(),
            'open_invoice_count' => (int) ($openInvoice['invoice_count'] ?? 0),
            'overdue_amount' => $overdueAmount,
            'oldest_invoice_due_date' => $openInvoice['oldest_due_date'] ?? null,
            'oldest_invoice_days_overdue' => (int) ($openInvoice['oldest_days_overdue'] ?? 0),
            'latest_invoice' => $latestInvoice ? [
                'id' => $latestInvoice->id,
                'invoice_link' => $latestInvoice->invoice_link,
                'status' => $latestInvoice->status,
                'amount' => (int) round((float) $latestInvoice->amount),
                'due_date' => optional($latestInvoice->due_date)->toDateString(),
                'paid_at' => optional($latestInvoice->paid_at)->toDateTimeString(),
            ] : null,
            'invoice_status' => $latestInvoice?->status ?: 'none',
            'last_paid_at' => optional($lastPaidInvoice?->paid_at)->toDateTimeString(),
            'last_paid_amount' => $lastPaidInvoice ? (int) round((float) $lastPaidInvoice->amount) : 0,
            'priority_score' => $priorityScore,
            'priority_level' => $this->priorityLevel($priorityScore),
            'action_hint' => $this->actionHint($isIsolated, $daysOverdue, $overdueAmount, (string) ($latestInvoice?->status ?? 'none')),
        ];
    }

    private function passesFilters(array $row, string $isolationStatus, string $invoiceStatus, string $agingBucket): bool
    {
        if ($isolationStatus !== 'all' && $row['isolation_status'] !== $isolationStatus) {
            return false;
        }

        if ($invoiceStatus !== 'all' && $row['invoice_status'] !== $invoiceStatus) {
            return false;
        }

        if ($agingBucket !== 'all' && $row['aging_bucket'] !== $agingBucket) {
            return false;
        }

        return true;
    }

    private function sortRows(Collection $rows, string $sortBy): Collection
    {
        return match ($sortBy) {
            'overdue_amount_desc' => $rows->sortByDesc('overdue_amount')->values(),
            'due_date_asc' => $rows->sortBy('due_date')->values(),
            'priority_desc' => $rows->sortByDesc('priority_score')->values(),
            default => $rows->sortByDesc('days_overdue')->values(),
        };
    }

    private function summary(Collection $rows): array
    {
        $count = $rows->count();
        $isolated = $rows->where('is_isolated', true)->count();
        $notIsolated = $rows->where('is_isolated', false)->count();
        $totalOverdue = (int) $rows->sum('overdue_amount');

        return [
            'customer_count' => $count,
            'isolated_count' => $isolated,
            'not_isolated_count' => $notIsolated,
            'overdue_amount_total' => $totalOverdue,
            'average_days_overdue' => $count > 0 ? round((float) $rows->avg('days_overdue'), 1) : 0,
            'high_priority_count' => $rows->where('priority_level', 'tinggi')->count(),
            'pending_confirmation_count' => $rows->where('invoice_status', 'menunggu konfirmasi')->count(),
            'not_isolated_ratio' => $count > 0 ? round(($notIsolated / $count) * 100, 1) : 0,
        ];
    }

    private function radar(Collection $rows): array
    {
        return [
            'not_isolated' => $rows->where('is_isolated', false)->count(),
            'isolated' => $rows->where('is_isolated', true)->count(),
            'pending_confirmation' => $rows->where('invoice_status', 'menunggu konfirmasi')->count(),
            'heavy_overdue' => $rows->where('days_overdue', '>', 30)->count(),
            'with_open_invoice' => $rows->where('open_invoice_count', '>', 0)->count(),
            'without_open_invoice' => $rows->where('open_invoice_count', 0)->count(),
        ];
    }

    private function aging(Collection $rows): array
    {
        $buckets = [
            '1_3' => ['key' => '1_3', 'label' => '1-3 hari'],
            '4_7' => ['key' => '4_7', 'label' => '4-7 hari'],
            '8_14' => ['key' => '8_14', 'label' => '8-14 hari'],
            '15_30' => ['key' => '15_30', 'label' => '15-30 hari'],
            '30_plus' => ['key' => '30_plus', 'label' => '>30 hari'],
        ];

        return collect($buckets)
            ->map(function (array $bucket, string $key) use ($rows) {
                $items = $rows->where('aging_bucket', $key);

                return [
                    ...$bucket,
                    'customer_count' => $items->count(),
                    'overdue_amount' => (int) $items->sum('overdue_amount'),
                    'isolated_count' => $items->where('is_isolated', true)->count(),
                    'not_isolated_count' => $items->where('is_isolated', false)->count(),
                ];
            })
            ->values()
            ->all();
    }

    private function byRegion(Collection $rows): array
    {
        return $rows
            ->groupBy('region_label')
            ->map(function (Collection $items, string $label) {
                return [
                    'label' => $label,
                    'customer_count' => $items->count(),
                    'overdue_amount' => (int) $items->sum('overdue_amount'),
                    'isolated_count' => $items->where('is_isolated', true)->count(),
                    'not_isolated_count' => $items->where('is_isolated', false)->count(),
                    'average_days_overdue' => $items->count() > 0 ? round((float) $items->avg('days_overdue'), 1) : 0,
                ];
            })
            ->sortByDesc('overdue_amount')
            ->values()
            ->all();
    }

    private function regionLabel(Customer $customer): array
    {
        if ($customer->dusun?->name) {
            return ['level' => 'dusun', 'label' => 'Dusun ' . $customer->dusun->name];
        }

        if ($customer->desa?->name) {
            return ['level' => 'desa', 'label' => 'Desa ' . $customer->desa->name];
        }

        if ($customer->kecamatan?->name) {
            return ['level' => 'kecamatan', 'label' => 'Kec. ' . $customer->kecamatan->name];
        }

        return ['level' => 'alamat', 'label' => $customer->address ?: 'Tanpa wilayah'];
    }

    private function agingBucketKey(int $days): string
    {
        if ($days <= 3) return '1_3';
        if ($days <= 7) return '4_7';
        if ($days <= 14) return '8_14';
        if ($days <= 30) return '15_30';
        return '30_plus';
    }

    private function agingBucketLabel(int $days): string
    {
        return match ($this->agingBucketKey($days)) {
            '1_3' => '1-3 hari',
            '4_7' => '4-7 hari',
            '8_14' => '8-14 hari',
            '15_30' => '15-30 hari',
            default => '>30 hari',
        };
    }

    private function priorityScore(int $daysOverdue, int $overdueAmount, bool $isIsolated, int $invoiceCount): int
    {
        $score = min(45, $daysOverdue);
        $score += min(25, $invoiceCount * 5);
        $score += match (true) {
            $overdueAmount >= 1000000 => 25,
            $overdueAmount >= 500000 => 18,
            $overdueAmount >= 200000 => 10,
            $overdueAmount > 0 => 5,
            default => 0,
        };
        $score += $isIsolated ? 0 : 15;

        return min(100, $score);
    }

    private function priorityLevel(int $score): string
    {
        if ($score >= 70) return 'tinggi';
        if ($score >= 40) return 'sedang';
        return 'rendah';
    }

    private function actionHint(bool $isIsolated, int $daysOverdue, int $overdueAmount, string $invoiceStatus): string
    {
        if ($invoiceStatus === 'menunggu konfirmasi') {
            return 'Cek bukti pembayaran sebelum follow-up ulang.';
        }

        if (!$isIsolated && $daysOverdue >= 7) {
            return 'Prioritas follow-up dan evaluasi isolir.';
        }

        if (!$isIsolated) {
            return 'Kirim reminder pembayaran.';
        }

        if ($overdueAmount > 0) {
            return 'Follow-up setelah isolir untuk recovery pembayaran.';
        }

        return 'Cek kesesuaian due date dan status layanan.';
    }
}
