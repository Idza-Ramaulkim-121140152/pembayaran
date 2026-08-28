<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CustomerUsageSnapshotService
{
    public function captureSnapshot(): array
    {
        if (!Schema::hasTable('customer_usage_totals') || !Schema::hasTable('customer_usage_checkpoints')) {
            return [
                'connections' => 0,
                'processed' => 0,
                'updated' => 0,
                'skipped_no_customer' => 0,
            ];
        }

        $mikrotik = app(MikroTikService::class);
        $activeConnections = collect($mikrotik->getActivePPPoEConnections() ?? []);

        $summary = [
            'connections' => $activeConnections->count(),
            'processed' => 0,
            'updated' => 0,
            'skipped_no_customer' => 0,
        ];

        if ($activeConnections->isEmpty()) {
            return $summary;
        }

        $customerByUsername = Customer::query()
            ->whereNotNull('pppoe_username')
            ->get(['id', 'pppoe_username'])
            ->keyBy(fn (Customer $customer) => strtolower(trim((string) $customer->pppoe_username)));

        foreach ($activeConnections as $connection) {
            $username = strtolower(trim((string) ($connection['name'] ?? '')));
            if ($username === '' || !$customerByUsername->has($username)) {
                $summary['skipped_no_customer']++;
                continue;
            }

            $customer = $customerByUsername->get($username);
            $bytesIn = max(0, (int) ($connection['bytes_in'] ?? 0));
            $bytesOut = max(0, (int) ($connection['bytes_out'] ?? 0));
            $sessionKey = $this->sessionKey($connection);
            $periodStartDate = $this->resolvePeriodStartDate((int) $customer->id);

            DB::transaction(function () use ($customer, $bytesIn, $bytesOut, $sessionKey, $periodStartDate, &$summary) {
                $total = DB::table('customer_usage_totals')->where('customer_id', $customer->id)->lockForUpdate()->first();
                $checkpoint = DB::table('customer_usage_checkpoints')->where('customer_id', $customer->id)->lockForUpdate()->first();

                if (!$total) {
                    DB::table('customer_usage_totals')->insert([
                        'customer_id' => $customer->id,
                        'period_start_date' => $periodStartDate,
                        'download_bytes' => 0,
                        'upload_bytes' => 0,
                        'total_bytes' => 0,
                        'last_snapshot_at' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $total = DB::table('customer_usage_totals')->where('customer_id', $customer->id)->first();
                }

                $periodChanged = (string) $total->period_start_date !== $periodStartDate;
                if ($periodChanged) {
                    DB::table('customer_usage_totals')->where('customer_id', $customer->id)->update([
                        'period_start_date' => $periodStartDate,
                        'download_bytes' => 0,
                        'upload_bytes' => 0,
                        'total_bytes' => 0,
                        'last_snapshot_at' => now(),
                        'updated_at' => now(),
                    ]);
                    DB::table('customer_usage_checkpoints')->updateOrInsert(
                        ['customer_id' => $customer->id],
                        [
                            'session_key' => $sessionKey,
                            'last_bytes_in' => $bytesIn,
                            'last_bytes_out' => $bytesOut,
                            'last_seen_at' => now(),
                            'updated_at' => now(),
                            'created_at' => $checkpoint?->created_at ?? now(),
                        ]
                    );
                    $summary['processed']++;
                    return;
                }

                $deltaIn = 0;
                $deltaOut = 0;
                if ($checkpoint) {
                    if ((string) ($checkpoint->session_key ?? '') === $sessionKey) {
                        $deltaIn = $bytesIn >= (int) $checkpoint->last_bytes_in ? $bytesIn - (int) $checkpoint->last_bytes_in : $bytesIn;
                        $deltaOut = $bytesOut >= (int) $checkpoint->last_bytes_out ? $bytesOut - (int) $checkpoint->last_bytes_out : $bytesOut;
                    } else {
                        $deltaIn = $bytesIn;
                        $deltaOut = $bytesOut;
                    }
                }

                DB::table('customer_usage_checkpoints')->updateOrInsert(
                    ['customer_id' => $customer->id],
                    [
                        'session_key' => $sessionKey,
                        'last_bytes_in' => $bytesIn,
                        'last_bytes_out' => $bytesOut,
                        'last_seen_at' => now(),
                        'updated_at' => now(),
                        'created_at' => $checkpoint?->created_at ?? now(),
                    ]
                );

                if ($deltaIn > 0 || $deltaOut > 0) {
                    DB::table('customer_usage_totals')->where('customer_id', $customer->id)->update([
                        'download_bytes' => DB::raw('download_bytes + ' . (int) $deltaIn),
                        'upload_bytes' => DB::raw('upload_bytes + ' . (int) $deltaOut),
                        'total_bytes' => DB::raw('total_bytes + ' . (int) ($deltaIn + $deltaOut)),
                        'last_snapshot_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $summary['updated']++;
                } else {
                    DB::table('customer_usage_totals')->where('customer_id', $customer->id)->update([
                        'last_snapshot_at' => now(),
                        'updated_at' => now(),
                    ]);
                }

                $summary['processed']++;
            });
        }

        return $summary;
    }

    public function resetPeriodByCustomerId(int $customerId): void
    {
        if (!Schema::hasTable('customer_usage_totals') || !Schema::hasTable('customer_usage_checkpoints')) {
            return;
        }

        $periodStartDate = $this->resolvePeriodStartDate($customerId);

        DB::transaction(function () use ($customerId, $periodStartDate) {
            DB::table('customer_usage_totals')->updateOrInsert(
                ['customer_id' => $customerId],
                [
                    'period_start_date' => $periodStartDate,
                    'download_bytes' => 0,
                    'upload_bytes' => 0,
                    'total_bytes' => 0,
                    'last_snapshot_at' => now(),
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );

            DB::table('customer_usage_checkpoints')->where('customer_id', $customerId)->delete();
        });
    }

    public function getUsageTotalByCustomerId(int $customerId): array
    {
        if (!Schema::hasTable('customer_usage_totals')) {
            return [
                'period_start_date' => Carbon::today()->toDateString(),
                'download_bytes' => 0,
                'upload_bytes' => 0,
                'total_bytes' => 0,
                'last_snapshot_at' => null,
            ];
        }

        $periodStartDate = $this->resolvePeriodStartDate($customerId);
        $row = DB::table('customer_usage_totals')
            ->where('customer_id', $customerId)
            ->first();

        if (!$row || (string) $row->period_start_date !== $periodStartDate) {
            return [
                'period_start_date' => $periodStartDate,
                'download_bytes' => 0,
                'upload_bytes' => 0,
                'total_bytes' => 0,
                'last_snapshot_at' => null,
            ];
        }

        return [
            'period_start_date' => (string) $row->period_start_date,
            'download_bytes' => (int) $row->download_bytes,
            'upload_bytes' => (int) $row->upload_bytes,
            'total_bytes' => (int) $row->total_bytes,
            'last_snapshot_at' => $row->last_snapshot_at,
        ];
    }

    private function sessionKey(array $connection): string
    {
        $sessionId = trim((string) ($connection['session_id'] ?? ''));
        if ($sessionId !== '') {
            return 'sid:' . $sessionId;
        }

        return 'fallback:' . md5(strtolower(trim((string) ($connection['name'] ?? ''))) . '|' . trim((string) ($connection['address'] ?? '')) . '|' . trim((string) ($connection['caller_id'] ?? '')));
    }

    private function resolvePeriodStartDate(int $customerId): string
    {
        $lastPaidAt = Invoice::query()
            ->where('customer_id', $customerId)
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->orderByDesc('paid_at')
            ->value('paid_at');

        if ($lastPaidAt) {
            return Carbon::parse($lastPaidAt)->toDateString();
        }

        return Carbon::today()->toDateString();
    }
}
