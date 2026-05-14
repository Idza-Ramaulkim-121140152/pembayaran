<?php

namespace App\Services;

use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use App\Models\Odp;
use Illuminate\Validation\ValidationException;

class OdpNameGeneratorService
{
    public function generate(int $kecamatanId, int $desaId, int $dusunId, ?int $excludeOdpId = null): string
    {
        $prefix = $this->buildPrefix($kecamatanId, $desaId, $dusunId);

        $query = Odp::query()
            ->where('desa_id', $desaId)
            ->where('dusun_id', $dusunId);

        if (!empty($excludeOdpId)) {
            $query->where('id', '!=', $excludeOdpId);
        }

        $existingNames = $query->pluck('nama');

        $maxSequence = 0;
        foreach ($existingNames as $existingName) {
            $sequence = $this->extractSequence($existingName, $prefix);
            if ($sequence !== null && $sequence > $maxSequence) {
                $maxSequence = $sequence;
            }
        }

        return sprintf('%s-%03d', $prefix, $maxSequence + 1);
    }

    private function buildPrefix(int $kecamatanId, int $desaId, int $dusunId): string
    {
        $kecamatan = MasterWilayahKecamatan::query()->find($kecamatanId);
        $desa = MasterWilayahDesa::query()->find($desaId);
        $dusun = MasterWilayahDusun::query()->find($dusunId);

        if (!$kecamatan || !$desa || !$dusun) {
            throw ValidationException::withMessages([
                'desa_id' => 'Data wilayah tidak lengkap untuk generate nama ODP.',
            ]);
        }

        $kecamatanCode = strtoupper(trim((string) $kecamatan->code));
        $desaCode = strtoupper(trim((string) $desa->code));
        $dusunCode = strtoupper(trim((string) $dusun->code));

        if ($kecamatanCode === '' || $desaCode === '' || $dusunCode === '') {
            throw ValidationException::withMessages([
                'desa_id' => 'Kode kecamatan/desa/dusun wajib terisi untuk generate nama ODP.',
            ]);
        }

        return "{$kecamatanCode}-{$desaCode}-{$dusunCode}";
    }

    private function extractSequence(string $name, string $prefix): ?int
    {
        $quotedPrefix = preg_quote($prefix, '/');
        if (!preg_match("/^{$quotedPrefix}-(\d{3})$/", $name, $matches)) {
            return null;
        }

        return (int) $matches[1];
    }
}

