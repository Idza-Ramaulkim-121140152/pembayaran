<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class PayrollMember extends Model
{
    protected $fillable = [
        'nama',
        'telepon',
        'tipe_gaji',
        'gaji_pokok',
        'tunjangan',
        'tanggal_gajian',
        'nama_bank',
        'nomor_rekening',
        'atas_nama_rekening',
        'is_active',
    ];

    protected $casts = [
        'gaji_pokok'     => 'decimal:0',
        'tunjangan'      => 'decimal:0',
        'tanggal_gajian' => 'integer',
        'is_active'      => 'boolean',
    ];

    public function getTotalGajiBulananAttribute(): float
    {
        return (float) ($this->gaji_pokok ?? 0) + $this->getMonthlyAllowanceTotal();
    }

    public function allowances()
    {
        return $this->hasMany(PayrollMemberAllowance::class, 'payroll_member_id')->orderBy('id');
    }

    /**
     * Resolve effective allowance items (falls back to legacy scalar `tunjangan` if no relational items exist).
     */
    public function resolveEffectiveAllowances(): Collection
    {
        if (Schema::hasTable('payroll_member_allowances')) {
            $items = $this->relationLoaded('allowances')
                ? $this->allowances
                : $this->allowances()->get();

            if ($items->count() > 0) {
                return $items->map(function (PayrollMemberAllowance $item): array {
                    $jenis = strtolower((string) $item->jenis) === PayrollMemberAllowance::JENIS_HARIAN
                        ? PayrollMemberAllowance::JENIS_HARIAN
                        : PayrollMemberAllowance::JENIS_BULANAN;

                    return [
                        'id' => $item->id,
                        'nama' => trim((string) $item->nama),
                        'jenis' => $jenis,
                        'nominal' => (float) ($item->nominal ?? 0),
                    ];
                })->values();
            }
        }

        $legacyTunjangan = (float) ($this->tunjangan ?? 0);
        if ($legacyTunjangan > 0) {
            return collect([[
                'id' => null,
                'nama' => 'Tunjangan Bulanan',
                'jenis' => PayrollMemberAllowance::JENIS_BULANAN,
                'nominal' => $legacyTunjangan,
            ]]);
        }

        return collect();
    }

    public function getMonthlyAllowanceTotal(): float
    {
        return (float) $this->resolveEffectiveAllowances()
            ->where('jenis', PayrollMemberAllowance::JENIS_BULANAN)
            ->sum('nominal');
    }

    public function getDailyAllowanceRate(): float
    {
        return (float) $this->resolveEffectiveAllowances()
            ->where('jenis', PayrollMemberAllowance::JENIS_HARIAN)
            ->sum('nominal');
    }

    /**
     * Sync multi-allowance rows and keep legacy `tunjangan` equal to fixed monthly allowance sum.
     */
    public function syncAllowances(array $rawItems): void
    {
        $normalized = collect($rawItems)
            ->filter(fn ($row) => is_array($row))
            ->map(function (array $row): array {
                $nama = trim((string) ($row['nama'] ?? ''));
                $jenis = strtolower((string) ($row['jenis'] ?? 'bulanan')) === PayrollMemberAllowance::JENIS_HARIAN
                    ? PayrollMemberAllowance::JENIS_HARIAN
                    : PayrollMemberAllowance::JENIS_BULANAN;
                $nominal = max(0, (float) ($row['nominal'] ?? 0));

                return [
                    'nama' => $nama,
                    'jenis' => $jenis,
                    'nominal' => $nominal,
                ];
            })
            ->filter(fn (array $row) => $row['nama'] !== '' && $row['nominal'] >= 0)
            ->values();

        if (Schema::hasTable('payroll_member_allowances')) {
            $this->allowances()->delete();
            foreach ($normalized as $row) {
                $this->allowances()->create($row);
            }
            $this->unsetRelation('allowances');
        }

        $monthlyTotal = (float) $normalized
            ->where('jenis', PayrollMemberAllowance::JENIS_BULANAN)
            ->sum('nominal');

        $this->forceFill(['tunjangan' => $monthlyTotal])->save();
    }

    /**
     * Handle either multi-allowance array or legacy scalar tunjangan updates without losing daily items.
     */
    public function syncAllowancesFromRequest(bool $hasAllowancesKey, ?array $allowancesInput, bool $hasScalarTunjanganKey, ?float $scalarTunjangan): void
    {
        if ($hasAllowancesKey) {
            $this->syncAllowances($allowancesInput ?? []);
            return;
        }

        if ($hasScalarTunjanganKey && Schema::hasTable('payroll_member_allowances')) {
            $existingAllowances = $this->allowances()->get();
            $dailyItems = $existingAllowances
                ->where('jenis', PayrollMemberAllowance::JENIS_HARIAN)
                ->map(fn (PayrollMemberAllowance $item) => [
                    'nama' => $item->nama,
                    'jenis' => PayrollMemberAllowance::JENIS_HARIAN,
                    'nominal' => (float) $item->nominal,
                ])
                ->values()
                ->all();

            $merged = $dailyItems;
            if (($scalarTunjangan ?? 0) > 0) {
                $merged[] = [
                    'nama' => 'Tunjangan Bulanan',
                    'jenis' => PayrollMemberAllowance::JENIS_BULANAN,
                    'nominal' => (float) $scalarTunjangan,
                ];
            }

            $this->syncAllowances($merged);
        }
    }

    /**
     * Normalized allowance attributes shared across Payroll and MasterPegawai APIs.
     */
    public function getAllowanceSummaryAttributes(): array
    {
        $items = $this->resolveEffectiveAllowances();
        $monthlyTotal = (float) $items->where('jenis', PayrollMemberAllowance::JENIS_BULANAN)->sum('nominal');
        $dailyRate = (float) $items->where('jenis', PayrollMemberAllowance::JENIS_HARIAN)->sum('nominal');

        return [
            'allowances' => $items->all(),
            'tunjangan' => $monthlyTotal,
            'tunjangan_bulanan_total' => $monthlyTotal,
            'tunjangan_harian_per_hari' => $dailyRate,
            'total_gaji_bulanan' => (float) ($this->gaji_pokok ?? 0) + $monthlyTotal,
        ];
    }

    /**
     * Calculate itemized salary and allowances given attendance days in the selected range.
     */
    public function calculateSalaryBreakdown(int $attendanceDays = 0): array
    {
        $days = max(0, $attendanceDays);
        $isMonthly = in_array($this->tipe_gaji ?? 'bulanan', ['bulanan', 'campuran'], true);
        $gajiPokok = $isMonthly ? (float) ($this->gaji_pokok ?? 0) : 0.0;

        $items = $this->resolveEffectiveAllowances()->map(function (array $item) use ($days): array {
            $isDaily = $item['jenis'] === PayrollMemberAllowance::JENIS_HARIAN;
            $multiplier = $isDaily ? $days : 1;
            $subtotal = (float) $item['nominal'] * $multiplier;

            return [
                'id' => $item['id'],
                'nama' => $item['nama'],
                'jenis' => $item['jenis'],
                'nominal' => (float) $item['nominal'],
                'multiplier' => $multiplier,
                'subtotal' => $subtotal,
            ];
        })->values();

        $tunjanganBulananTotal = (float) $items
            ->where('jenis', PayrollMemberAllowance::JENIS_BULANAN)
            ->sum('subtotal');

        $tunjanganHarianPerHari = (float) $items
            ->where('jenis', PayrollMemberAllowance::JENIS_HARIAN)
            ->sum('nominal');

        $tunjanganHarianTotal = (float) $items
            ->where('jenis', PayrollMemberAllowance::JENIS_HARIAN)
            ->sum('subtotal');

        $tunjanganTotal = $tunjanganBulananTotal + $tunjanganHarianTotal;

        return [
            'tipe_gaji' => $this->tipe_gaji ?? 'bulanan',
            'gaji_pokok' => $gajiPokok,
            'attendance_days' => $days,
            'items' => $items->all(),
            'tunjangan_bulanan_total' => $tunjanganBulananTotal,
            'tunjangan_harian_per_hari' => $tunjanganHarianPerHari,
            'tunjangan_harian_total' => $tunjanganHarianTotal,
            'tunjangan_total' => $tunjanganTotal,
            'total_gaji_tetap' => $gajiPokok + $tunjanganBulananTotal,
            'total_gaji_dihitung' => $gajiPokok + $tunjanganTotal,
        ];
    }


    public function projects()
    {
        return $this->belongsToMany(PayrollProject::class, 'payroll_project_members')
            ->withPivot('bagian', 'paid_at')
            ->withTimestamps();
    }

    public function payments()
    {
        return $this->hasMany(PayrollMemberPayment::class);
    }

    public function user()
    {
        return $this->hasOne(User::class, 'payroll_member_id');
    }

    /**
     * Total gaji belum dibayar = total bagian semua proyek - total pembayaran
     */
    public function getUnpaidTotalAttribute()
    {
        $totalBagian = $this->projects()->sum('payroll_project_members.bagian');
        $totalPayments = $this->payments()->sum('nominal');
        return max(0, $totalBagian - $totalPayments);
    }
}
