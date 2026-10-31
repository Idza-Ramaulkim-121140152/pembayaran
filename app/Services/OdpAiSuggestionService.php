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
        $minConfidence = (float) ($options['min_confidence'] ?? 25.0);
        $limit = min(300, max(1, (int) ($options['limit'] ?? 150)));
        $status = $options['status'] ?? null;
        $search = trim((string) ($options['search'] ?? ''));
        $includeSpatialMismatch = isset($options['include_spatial_mismatch'])
            ? (bool) $options['include_spatial_mismatch']
            : ($status === null || $status === 'all' || $status === 'spatial_anomaly');

        // 1. Fetch all active ODPs with customer counts
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
        $odpsById = $odps->keyBy('id');

        // 2. Build target customers list
        $customers = collect();

        if (!empty($customerIds)) {
            $customers = Customer::query()
                ->with(['onu', 'ponPort', 'olt'])
                ->select([
                    'id', 'name', 'phone', 'pppoe_username', 'address',
                    'latitude', 'longitude', 'odp', 'odp_id',
                    'olt_id', 'pon_port_id', 'olt_onu_id',
                    'desa_id', 'dusun_id', 'kecamatan_id',
                ])
                ->whereIn('id', $customerIds)
                ->get();
        } else {
            // Unassigned / Mismatch customers
            if ($status !== 'spatial_anomaly') {
                $unmappedQuery = Customer::query()
                    ->with(['onu', 'ponPort', 'olt'])
                    ->select([
                        'id', 'name', 'phone', 'pppoe_username', 'address',
                        'latitude', 'longitude', 'odp', 'odp_id',
                        'olt_id', 'pon_port_id', 'olt_onu_id',
                        'desa_id', 'dusun_id', 'kecamatan_id',
                    ])
                    ->whereNull('odp_id');

                if ($status === 'mismatch') {
                    $unmappedQuery->whereNotNull('odp')->where('odp', '!=', '');
                } elseif ($status === 'unassigned') {
                    $unmappedQuery->where(function ($q) {
                        $q->whereNull('odp')->orWhere('odp', '');
                    });
                }

                if ($search !== '') {
                    $unmappedQuery->where(function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%")
                            ->orWhere('pppoe_username', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%")
                            ->orWhere('address', 'like', "%{$search}%")
                            ->orWhere('odp', 'like', "%{$search}%");
                    });
                }

                $customers = $customers->concat($unmappedQuery->orderBy('name')->take($limit)->get());
            }

            // Spatial mismatch candidates (assigned customers with GPS far from current ODP)
            if ($includeSpatialMismatch && $customers->count() < $limit) {
                $assignedQuery = Customer::query()
                    ->with(['onu', 'ponPort', 'olt'])
                    ->select([
                        'id', 'name', 'phone', 'pppoe_username', 'address',
                        'latitude', 'longitude', 'odp', 'odp_id',
                        'olt_id', 'pon_port_id', 'olt_onu_id',
                        'desa_id', 'dusun_id', 'kecamatan_id',
                    ])
                    ->whereNotNull('odp_id')
                    ->whereNotNull('latitude')
                    ->whereNotNull('longitude');

                if ($search !== '') {
                    $assignedQuery->where(function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%")
                            ->orWhere('pppoe_username', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%")
                            ->orWhere('address', 'like', "%{$search}%")
                            ->orWhere('odp', 'like', "%{$search}%");
                    });
                }

                $assignedPool = $assignedQuery->take(200)->get();
                $customers = $customers->concat($assignedPool);
            }
        }

        $suggestions = [];
        $highCount = 0;
        $mediumCount = 0;
        $lowCount = 0;
        $unmappedCount = 0;
        $reassignmentCount = 0;

        foreach ($customers as $customer) {
            $isAssigned = !empty($customer->odp_id);
            $currentOdp = $isAssigned ? $odpsById->get((int) $customer->odp_id) : null;
            $currentDist = null;

            if ($isAssigned && $this->isValidCoord($customer->latitude, $customer->longitude) && $currentOdp && $this->isValidCoord($currentOdp->latitude, $currentOdp->longitude)) {
                $currentDist = $this->distanceInMeters(
                    (float) $customer->latitude,
                    (float) $customer->longitude,
                    (float) $currentOdp->latitude,
                    (float) $currentOdp->longitude
                );
            }

            $candidateScores = [];

            foreach ($odps as $odp) {
                // If assigned, skip currently assigned ODP to find better alternatives
                if ($isAssigned && (int) $odp->id === (int) $customer->odp_id) {
                    continue;
                }

                $distance = $this->distanceInMeters(
                    (float) $customer->latitude,
                    (float) $customer->longitude,
                    (float) $odp->latitude,
                    (float) $odp->longitude
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

            if (empty($candidateScores)) {
                continue;
            }

            $bestMatch = $candidateScores[0];
            $bestDist = $bestMatch['distance_meters'];

            // For ASSIGNED customers: only suggest if it is a true Spatial Mismatch
            if ($isAssigned) {
                // Criteria:
                // 1. Best candidate is within dropcore range (<= 150m)
                // 2. AND either current ODP has no GPS, or current ODP is far (> 180m), or saving is >= 60m
                $isSpatialMismatch = false;
                if ($bestDist !== null && $bestDist <= 150) {
                    if ($currentDist === null) {
                        $isSpatialMismatch = true;
                    } elseif ($currentDist > 180) {
                        $isSpatialMismatch = true;
                    } elseif (($currentDist - $bestDist) >= 60) {
                        $isSpatialMismatch = true;
                    }
                }

                if (!$isSpatialMismatch) {
                    continue;
                }

                $savingMeters = $currentDist !== null ? max(0, round($currentDist - $bestDist)) : null;
                $reasons = [
                    "Koreksi Jarak: ODP saat ini (" . ($currentOdp?->nama ?? 'ODP Lama') . ") berjarak " . ($currentDist !== null ? round($currentDist) . "m" : "tanpa GPS") . ", sedangkan ODP {$bestMatch['odp_name']} tepat di dekat pelanggan (" . round($bestDist) . "m" . ($savingMeters ? ", hemat {$savingMeters}m kabel" : "") . ")!",
                    ...$bestMatch['reasons'],
                ];

                $confidence = $bestDist <= 70 ? 'high' : 'medium';
                if ($confidence === 'high') {
                    $highCount++;
                } else {
                    $mediumCount++;
                }
                $reassignmentCount++;

                $suggestions[] = [
                    'customer_id' => $customer->id,
                    'customer_name' => $customer->name,
                    'pppoe_username' => $customer->pppoe_username,
                    'phone' => $customer->phone,
                    'address' => $customer->address,
                    'legacy_odp' => $customer->odp,
                    'has_coordinates' => $this->isValidCoord($customer->latitude, $customer->longitude),
                    'latitude' => $customer->latitude,
                    'longitude' => $customer->longitude,
                    'suggested_odp_id' => $bestMatch['odp_id'],
                    'suggested_odp_name' => $bestMatch['odp_name'],
                    'score' => max(75, $bestMatch['score']),
                    'confidence' => $confidence,
                    'distance_meters' => $bestDist,
                    'reasons' => $reasons,
                    'flags' => array_unique([...$bestMatch['flags'], 'spatial_mismatch_correction']),
                    'total_ports' => $bestMatch['total_ports'],
                    'available_ports' => $bestMatch['available_ports'],
                    'occupied_ports' => $bestMatch['occupied_ports'],
                    'alternatives' => array_slice($candidateScores, 1, 2),
                    'is_reassignment' => true,
                    'current_odp_id' => $currentOdp?->id,
                    'current_odp_name' => $currentOdp?->nama ?? $customer->odp ?? '-',
                    'current_distance_meters' => $currentDist ? round($currentDist) : null,
                    'distance_saving_meters' => $savingMeters,
                ];
            } else {
                // UNASSIGNED customer
                if ($bestMatch['score'] >= $minConfidence) {
                    $alternatives = array_slice($candidateScores, 1, 2);

                    if ($bestMatch['confidence'] === 'high') {
                        $highCount++;
                    } elseif ($bestMatch['confidence'] === 'medium') {
                        $mediumCount++;
                    } else {
                        $lowCount++;
                    }
                    $unmappedCount++;

                    $suggestions[] = [
                        'customer_id' => $customer->id,
                        'customer_name' => $customer->name,
                        'pppoe_username' => $customer->pppoe_username,
                        'phone' => $customer->phone,
                        'address' => $customer->address,
                        'legacy_odp' => $customer->odp,
                        'has_coordinates' => $this->isValidCoord($customer->latitude, $customer->longitude),
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
                        'is_reassignment' => false,
                        'current_odp_id' => null,
                        'current_odp_name' => null,
                        'current_distance_meters' => null,
                        'distance_saving_meters' => null,
                    ];
                }
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
                'unmapped_suggestions_count' => $unmappedCount,
                'reassignment_suggestions_count' => $reassignmentCount,
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

        // 1. Distance vector (Primary physical dropcore proximity)
        if ($distanceMeters !== null) {
            if ($distanceMeters <= 30) {
                // Tiang tepat di depan rumah/lokasi pelanggan (jarak ~0m)
                $score += 85;
                $reasons[] = "Jarak sangat dekat: " . round($distanceMeters) . " meter (tiang tepat di lokasi pelanggan)";
            } elseif ($distanceMeters <= 60) {
                // Jarak dekat (1 gawang tiang ideal)
                $score += 75;
                $reasons[] = "Jarak dekat: " . round($distanceMeters) . " meter (tiang terdekat)";
            } elseif ($distanceMeters <= 100) {
                // Jangkauan dropcore optimal
                $score += 65;
                $reasons[] = "Jarak jangkauan dropcore optimal: " . round($distanceMeters) . " meter";
            } elseif ($distanceMeters <= 150) {
                // Radius standar ODP (150m)
                $score += 55;
                $reasons[] = "Dalam radius standar jangkauan ODP: " . round($distanceMeters) . " meter";
            } elseif ($distanceMeters <= 250) {
                // Jarak moderat (masih bisa ditarik dropcore)
                $score += 40;
                $reasons[] = "Jarak jangkauan moderat: " . round($distanceMeters) . " meter";
            } elseif ($distanceMeters <= 400) {
                // Jarak jangkauan luar
                $score += 25;
                $reasons[] = "Jarak jangkauan luar: " . round($distanceMeters) . " meter";
            } else {
                $flags[] = "distance_far";
            }
        }

        // 2. Fuzzy name matching vector (Max 65 points)
        $legacyName = trim((string) $customer->odp);
        $odpName = trim((string) $odp->nama);

        if ($legacyName !== '') {
            $normLegacy = $this->normalizeName($legacyName);
            $normOdp = $this->normalizeName($odpName);

            if ($normLegacy !== '' && $normOdp !== '') {
                if ($normLegacy === $normOdp) {
                    $score += 65;
                    $reasons[] = "Nama ODP lama cocok sempurna ('{$legacyName}')";
                } elseif (str_contains($normOdp, $normLegacy) || str_contains($normLegacy, $normOdp)) {
                    $score += 50;
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

        // 3. PON Port & OLT vector
        $customerPon = $customer->pon_port_id ?? $customer->onu?->pon_port_id;
        $customerOlt = $customer->olt_id ?? $customer->onu?->olt_id;

        if (!empty($customerPon) && !empty($odp->pon_port_id)) {
            if ((int) $customerPon === (int) $odp->pon_port_id) {
                $score += 20;
                $reasons[] = "Satu jalur Port PON OLT yang sama";
            } elseif (!empty($customerOlt) && !empty($odp->olt_id) && (int) $customerOlt === (int) $odp->olt_id) {
                // Port PON berbeda di OLT yang sama: penalti ringan agar tidak menghancurkan fakta fisik tiang ODP
                if ($distanceMeters !== null && $distanceMeters <= 150) {
                    $score -= 5;
                    $flags[] = "different_pon_port";
                } else {
                    $score -= 15;
                    $flags[] = "different_pon_port";
                }
            }
        }

        // 4. Regional / Wilayah matching (Max 25 points)
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
            $reasons[] = "Port ODP penuh ({$occupied}/{$totalPorts} port terpakai)";
        } else {
            $score += 10;
            $reasons[] = "Kapasitas tersedia ({$availablePorts} dari {$totalPorts} port kosong)";
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
     * Check whether coordinates are valid (non-null and outside Null Island).
     */
    public function isValidCoord($lat, $lng): bool
    {
        if ($lat === null || $lng === null) {
            return false;
        }
        $fLat = (float) $lat;
        $fLng = (float) $lng;
        return is_finite($fLat) && is_finite($fLng) && (abs($fLat) > 0.0001 || abs($fLng) > 0.0001);
    }

    /**
     * Calculate haversine distance between two coordinates in meters.
     */
    public function distanceInMeters(?float $lat1, ?float $lng1, ?float $lat2, ?float $lng2): ?float
    {
        if (!$this->isValidCoord($lat1, $lng1) || !$this->isValidCoord($lat2, $lng2)) {
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
