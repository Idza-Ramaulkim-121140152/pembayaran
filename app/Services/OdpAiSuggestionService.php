<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Odp;
use App\Models\OdpMappingAnomaly;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class OdpAiSuggestionService
{
    public function __construct(
        private AuditLogService $auditLogService
    ) {
    }

    /**
     * Generate intelligent ODP mapping suggestions for unmapped or mismatch customers.
     */
    public function generateSuggestions(array $options = []): array
    {
        $customerIds = $options['customer_ids'] ?? null;
        $minConfidence = (float) ($options['min_confidence'] ?? 30.0);
        $limit = min(300, max(1, (int) ($options['limit'] ?? 150)));
        $status = $options['status'] ?? null;
        $search = trim((string) ($options['search'] ?? ''));

        // 1. Fetch target customers
        $customerQuery = Customer::query()
            ->with(['onu', 'ponPort', 'olt'])
            ->select([
                'id',
                'name',
                'phone',
                'pppoe_username',
                'address',
                'latitude',
                'longitude',
                'odp',
                'odp_id',
                'olt_id',
                'pon_port_id',
                'olt_onu_id',
                'desa_id',
                'dusun_id',
                'kecamatan_id',
            ]);

        if (!empty($customerIds)) {
            $customerQuery->whereIn('id', $customerIds);
        } else {
            if ($status === 'mismatch') {
                $customerQuery->whereNull('odp_id')->whereNotNull('odp')->where('odp', '!=', '');
            } elseif ($status === 'unassigned') {
                $customerQuery->whereNull('odp_id')->where(function ($q) {
                    $q->whereNull('odp')->orWhere('odp', '');
                });
            } else {
                // Default: all without odp_id
                $customerQuery->whereNull('odp_id');
            }
        }

        if ($search !== '') {
            $customerQuery->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('pppoe_username', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('address', 'like', "%{$search}%")
                    ->orWhere('odp', 'like', "%{$search}%");
            });
        }

        $customers = $customerQuery->orderBy('name')->take($limit)->get();

        // 2. Fetch all active ODPs with customer counts
        $odps = Odp::query()
            ->withCount('customers')
            ->get([
                'id',
                'nama',
                'device_type',
                'total_ports',
                'rasio_distribusi',
                'latitude',
                'longitude',
                'olt_id',
                'pon_port_id',
                'kecamatan_id',
                'desa_id',
                'dusun_id',
                'alamat_detail',
            ]);

        $suggestions = [];
        $highCount = 0;
        $mediumCount = 0;
        $lowCount = 0;

        foreach ($customers as $customer) {
            $candidateScores = [];

            foreach ($odps as $odp) {
                $distance = $this->distanceInMeters(
                    $customer->latitude ? (float) $customer->latitude : null,
                    $customer->longitude ? (float) $customer->longitude : null,
                    $odp->latitude ? (float) $odp->latitude : null,
                    $odp->longitude ? (float) $odp->longitude : null
                );

                $analysis = $this->evaluateMatch($customer, $odp, $distance);

                if ($analysis['score'] >= 25.0) {
                    $candidateScores[] = [
                        'odp_id' => $odp->id,
                        'odp_name' => $odp->nama,
                        'score' => $analysis['score'],
                        'confidence' => $analysis['confidence'],
                        'distance_meters' => $analysis['distance_meters'],
                        'reasons' => $analysis['reasons'],
                        'flags' => $analysis['flags'],
                        'total_ports' => $analysis['total_ports'],
                        'occupied_ports' => $analysis['occupied_ports'],
                        'available_ports' => $analysis['available_ports'],
                    ];
                }
            }

            // Sort candidate ODPs by score descending
            usort($candidateScores, fn ($a, $b) => $b['score'] <=> $a['score']);

            if (!empty($candidateScores) && $candidateScores[0]['score'] >= $minConfidence) {
                $bestMatch = $candidateScores[0];
                $alternatives = array_slice($candidateScores, 1, 2);

                if ($bestMatch['confidence'] === 'high') {
                    $highCount++;
                } elseif ($bestMatch['confidence'] === 'medium') {
                    $mediumCount++;
                } else {
                    $lowCount++;
                }

                $suggestions[] = [
                    'customer_id' => $customer->id,
                    'customer_name' => $customer->name,
                    'pppoe_username' => $customer->pppoe_username,
                    'phone' => $customer->phone,
                    'address' => $customer->address,
                    'legacy_odp' => $customer->odp,
                    'has_coordinates' => !empty($customer->latitude) && !empty($customer->longitude),
                    'latitude' => $customer->latitude,
                    'longitude' => $customer->longitude,
                    'suggested_odp_id' => $bestMatch['odp_id'],
                    'suggested_odp_name' => $bestMatch['odp_name'],
                    'score' => $bestMatch['score'],
                    'confidence' => $bestMatch['confidence'],
                    'distance_meters' => $bestMatch['distance_meters'],
                    'reasons' => $bestMatch['reasons'],
                    'flags' => $bestMatch['flags'],
                    'total_ports' => $bestMatch['total_ports'],
                    'available_ports' => $bestMatch['available_ports'],
                    'occupied_ports' => $bestMatch['occupied_ports'],
                    'alternatives' => $alternatives,
                ];
            }
        }

        $totalUnmapped = Customer::query()->whereNull('odp_id')->count();

        return [
            'summary' => [
                'total_unmapped' => $totalUnmapped,
                'total_analyzed' => $customers->count(),
                'total_suggestions' => count($suggestions),
                'high_confidence_count' => $highCount,
                'medium_confidence_count' => $mediumCount,
                'low_confidence_count' => $lowCount,
            ],
            'suggestions' => $suggestions,
        ];
    }

    /**
     * Multi-vector evaluation of how well a customer matches a candidate ODP.
     */
    public function evaluateMatch(Customer $customer, Odp $odp, ?float $distanceMeters): array
    {
        $score = 0;
        $reasons = [];
        $flags = [];

        // 1. Distance vector (Max 65 points)
        if ($distanceMeters !== null) {
            if ($distanceMeters <= 40) {
                $score += 65;
                $reasons[] = "Jarak sangat dekat: " . round($distanceMeters) . " meter (tiang terdekat)";
            } elseif ($distanceMeters <= 80) {
                $score += 50;
                $reasons[] = "Jarak dekat: " . round($distanceMeters) . " meter (jangkauan dropcore optimal)";
            } elseif ($distanceMeters <= 140) {
                $score += 35;
                $reasons[] = "Jarak jangkauan normal: " . round($distanceMeters) . " meter";
            } elseif ($distanceMeters <= 220) {
                $score += 22;
                $reasons[] = "Jarak jangkauan moderat: " . round($distanceMeters) . " meter";
            } elseif ($distanceMeters <= 350) {
                $score += 12;
                $reasons[] = "Jarak jangkauan luar: " . round($distanceMeters) . " meter";
            } else {
                $flags[] = "distance_far";
            }
        }

        // 2. Fuzzy name matching vector (Max 60 points)
        $legacyName = trim((string) $customer->odp);
        $odpName = trim((string) $odp->nama);

        if ($legacyName !== '') {
            $normLegacy = $this->normalizeName($legacyName);
            $normOdp = $this->normalizeName($odpName);

            if ($normLegacy !== '' && $normOdp !== '') {
                if ($normLegacy === $normOdp) {
                    $score += 60;
                    $reasons[] = "Nama ODP lama cocok sempurna ('{$legacyName}')";
                } elseif (str_contains($normOdp, $normLegacy) || str_contains($normLegacy, $normOdp)) {
                    $score += 48;
                    $reasons[] = "Nama ODP lama selaras dengan master ('{$legacyName}')";
                } else {
                    similar_text($normLegacy, $normOdp, $percent);
                    if ($percent >= 80) {
                        $score += 45;
                        $reasons[] = "Nama ODP lama sangat mirip (" . round($percent) . "%): '{$legacyName}'";
                    } elseif ($percent >= 60) {
                        $score += 25;
                        $reasons[] = "Nama ODP lama agak mirip (" . round($percent) . "%): '{$legacyName}'";
                    }
                }
            }
        }

        // 3. PON Port & OLT vector (Max 25 points or penalty)
        $customerPon = $customer->pon_port_id ?? $customer->onu?->pon_port_id;
        $customerOlt = $customer->olt_id ?? $customer->onu?->olt_id;

        if (!empty($customerPon) && !empty($odp->pon_port_id)) {
            if ((int) $customerPon === (int) $odp->pon_port_id) {
                $score += 25;
                $reasons[] = "Satu jalur Port PON OLT yang sama";
            } elseif (!empty($customerOlt) && !empty($odp->olt_id) && (int) $customerOlt === (int) $odp->olt_id) {
                $score -= 35;
                $flags[] = "different_pon_port";
            }
        }

        // 4. Regional / Wilayah matching (Max 15 points)
        if (!empty($customer->dusun_id) && !empty($odp->dusun_id) && (int) $customer->dusun_id === (int) $odp->dusun_id) {
            $score += 15;
            $reasons[] = "Dusun yang sama";
        } elseif (!empty($customer->desa_id) && !empty($odp->desa_id) && (int) $customer->desa_id === (int) $odp->desa_id) {
            $score += 10;
            $reasons[] = "Desa yang sama";
        }

        // 5. Port Capacity Check
        $totalPorts = (int) ($odp->total_ports ?: $this->resolveDefaultPorts($odp->rasio_distribusi));
        $occupied = (int) ($odp->customers_count ?? 0);
        $availablePorts = max(0, $totalPorts - $occupied);

        if ($availablePorts <= 0) {
            $flags[] = "odp_full";
            $score -= 15;
        } else {
            $score += 10;
            $reasons[] = "Kapasitas longgar ({$availablePorts} dari {$totalPorts} port tersedia)";
        }

        $score = max(0, min(100, $score));

        return [
            'score' => (int) round($score),
            'confidence' => $score >= 70 ? 'high' : ($score >= 45 ? 'medium' : 'low'),
            'distance_meters' => $distanceMeters,
            'reasons' => $reasons,
            'flags' => $flags,
            'total_ports' => $totalPorts,
            'occupied_ports' => $occupied,
            'available_ports' => $availablePorts,
        ];
    }

    /**
     * Apply a batch of suggested ODP assignments atomically.
     */
    public function applyBatch(array $assignments, int $userId): array
    {
        $applied = 0;
        $failed = 0;
        $errors = [];

        DB::transaction(function () use ($assignments, $userId, &$applied, &$failed, &$errors) {
            $odpCache = [];

            foreach ($assignments as $item) {
                $customerId = (int) ($item['customer_id'] ?? 0);
                $odpId = (int) ($item['odp_id'] ?? 0);

                if ($customerId <= 0 || $odpId <= 0) {
                    $failed++;
                    $errors[] = "Customer ID atau ODP ID tidak valid.";
                    continue;
                }

                $customer = Customer::query()->find($customerId);
                if (!$customer) {
                    $failed++;
                    $errors[] = "Pelanggan #{$customerId} tidak ditemukan.";
                    continue;
                }

                if (!isset($odpCache[$odpId])) {
                    $odpCache[$odpId] = Odp::query()->find($odpId);
                }

                $odp = $odpCache[$odpId];
                if (!$odp) {
                    $failed++;
                    $errors[] = "ODP #{$odpId} tidak ditemukan.";
                    continue;
                }

                $oldOdp = $customer->odp;
                $oldOdpId = $customer->odp_id;

                $customer->odp_id = $odp->id;
                $customer->odp = $odp->nama;
                $customer->save();

                // Resolve anomaly if any
                OdpMappingAnomaly::query()
                    ->where('customer_id', $customer->id)
                    ->where('resolved', false)
                    ->update([
                        'resolved' => true,
                        'resolved_by' => $userId,
                        'resolved_at' => now(),
                        'notes' => 'Resolved via AI Auto-Suggest Mapping',
                    ]);

                $this->auditLogService->log('odp.mapping.assigned', $customer, [
                    'source' => 'ai_auto_suggest',
                    'old_odp' => $oldOdp,
                    'old_odp_id' => $oldOdpId,
                    'new_odp' => $odp->nama,
                    'new_odp_id' => $odp->id,
                ], $userId);

                $applied++;
            }
        });

        return [
            'applied_count' => $applied,
            'failed_count' => $failed,
            'errors' => $errors,
        ];
    }

    /**
     * Calculate haversine distance between two coordinates in meters.
     */
    public function distanceInMeters(?float $lat1, ?float $lng1, ?float $lat2, ?float $lng2): ?float
    {
        if ($lat1 === null || $lng1 === null || $lat2 === null || $lng2 === null) {
            return null;
        }

        $earthRadius = 6371000.0; // meters
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLng / 2) * sin($dLng / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return round($earthRadius * $c, 1);
    }

    /**
     * Normalize ODP names for robust fuzzy comparison.
     */
    public function normalizeName(string $name): string
    {
        $clean = strtolower($name);
        $clean = preg_replace('/^(odp|odc|box|tiang)\s*[-_.\/]?\s*/i', '', $clean);
        $clean = preg_replace('/[^a-z0-9]/', '', $clean);
        $clean = preg_replace('/(?<=[a-z])0+([1-9])/', '$1', $clean);
        return trim((string) $clean);
    }

    /**
     * Determine default total ports from distribution ratio.
     */
    private function resolveDefaultPorts(?string $ratio): int
    {
        return match ($ratio) {
            '1:16' => 16,
            '1:4' => 4,
            '1:2' => 2,
            default => 8,
        };
    }
}
