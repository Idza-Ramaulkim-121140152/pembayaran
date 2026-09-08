<?php

namespace App\Services;

class OpticalRatioCalculator
{
    /**
     * Standard FBT Asymmetric Splitter (Rasio Spesial) Loss Table (1310 / 1490 / 1550 nm)
     * Format: [tap_loss_db, thru_loss_db, tap_percentage, thru_percentage]
     */
    public const SPECIAL_RATIOS = [
        '1:99' => ['tap_loss' => 20.5, 'thru_loss' => 0.15, 'tap_pct' => 1,  'thru_pct' => 99],
        '2:98' => ['tap_loss' => 17.5, 'thru_loss' => 0.20, 'tap_pct' => 2,  'thru_pct' => 98],
        '3:97' => ['tap_loss' => 15.7, 'thru_loss' => 0.25, 'tap_pct' => 3,  'thru_pct' => 97],
        '5:95' => ['tap_loss' => 13.5, 'thru_loss' => 0.35, 'tap_pct' => 5,  'thru_pct' => 95],
        '10:90' => ['tap_loss' => 10.5, 'thru_loss' => 0.60, 'tap_pct' => 10, 'thru_pct' => 90],
        '15:85' => ['tap_loss' => 8.7,  'thru_loss' => 0.85, 'tap_pct' => 15, 'thru_pct' => 85],
        '20:80' => ['tap_loss' => 7.4,  'thru_loss' => 1.10, 'tap_pct' => 20, 'thru_pct' => 80],
        '25:75' => ['tap_loss' => 6.4,  'thru_loss' => 1.40, 'tap_pct' => 25, 'thru_pct' => 75],
        '30:70' => ['tap_loss' => 5.6,  'thru_loss' => 1.75, 'tap_pct' => 30, 'thru_pct' => 70],
        '70:30' => ['tap_loss' => 5.6,  'thru_loss' => 1.75, 'tap_pct' => 30, 'thru_pct' => 70], // inverted notation alias
        '35:65' => ['tap_loss' => 4.9,  'thru_loss' => 2.05, 'tap_pct' => 35, 'thru_pct' => 65],
        '40:60' => ['tap_loss' => 4.3,  'thru_loss' => 2.40, 'tap_pct' => 40, 'thru_pct' => 60],
        '45:55' => ['tap_loss' => 3.8,  'thru_loss' => 2.80, 'tap_pct' => 45, 'thru_pct' => 55],
        '50:50' => ['tap_loss' => 3.4,  'thru_loss' => 3.40, 'tap_pct' => 50, 'thru_pct' => 50],
        'none'  => ['tap_loss' => 0.0,  'thru_loss' => 0.00, 'tap_pct' => 100, 'thru_pct' => 100],
    ];

    /**
     * Standard Even PLC Splitter (Rasio Distribusi Pasif) Loss Table
     */
    public const DISTRIBUTION_RATIOS = [
        '1:2'  => 3.6,
        '1:4'  => 7.2,
        '1:8'  => 10.5,
        '1:16' => 13.8,
        '1:32' => 17.0,
        'none' => 0.0,
    ];

    /**
     * Standard fiber loss coefficient: 0.35 dB per km (for G.652D singlemode fiber @ 1310/1490nm)
     */
    public const FIBER_ATTENUATION_PER_KM = 0.35;

    /**
     * Compute fiber loss from distance in meters
     */
    public static function calculateFiberLoss(float $distanceMeters): float
    {
        if ($distanceMeters <= 0) return 0.0;
        return round(($distanceMeters / 1000.0) * self::FIBER_ATTENUATION_PER_KM, 2);
    }

    /**
     * Calculate optical power progression across a single ODP / ODC hop
     */
    public static function calculateHop(
        float $inputPowerDbm,
        ?string $specialRatio = 'none',
        ?string $distRatio = '1:8',
        float $fiberLengthMeters = 0.0,
        bool $isOdc = false
    ): array {
        $fiberLoss = self::calculateFiberLoss($fiberLengthMeters);
        $arrivingPower = round($inputPowerDbm - $fiberLoss, 2);

        $cleanSpecial = strtolower(trim((string) $specialRatio));
        if (empty($cleanSpecial) || !isset(self::SPECIAL_RATIOS[$cleanSpecial])) {
            $cleanSpecial = 'none';
        }
        $ratioData = self::SPECIAL_RATIOS[$cleanSpecial];

        $thruLoss = $ratioData['thru_loss'];
        $tapLoss = $ratioData['tap_loss'];

        // Thru leg continues to next ODP/ODC
        $thruOutputPower = $cleanSpecial === 'none'
            ? $arrivingPower
            : round($arrivingPower - $thruLoss, 2);

        // Tap leg goes to passive splitter inside this ODP (if ODC with no customer splitter, distLoss = 0)
        $cleanDist = strtolower(trim((string) $distRatio));
        if (empty($cleanDist) || !isset(self::DISTRIBUTION_RATIOS[$cleanDist]) || $isOdc) {
            $cleanDist = $isOdc ? 'none' : '1:8';
        }
        $distLoss = self::DISTRIBUTION_RATIOS[$cleanDist] ?? 0.0;

        $customerPortPower = null;
        if (!$isOdc && $distLoss > 0) {
            $tapOutputPower = $cleanSpecial === 'none' ? $arrivingPower : ($arrivingPower - $tapLoss);
            $customerPortPower = round($tapOutputPower - $distLoss, 2);
        }

        // Quality status evaluation
        $status = 'ideal';
        $statusColor = '#10B981'; // Green
        $statusLabel = 'Sangat Baik (Ideal)';

        if ($customerPortPower !== null) {
            if ($customerPortPower < -27.0) {
                $status = 'critical';
                $statusColor = '#EF4444'; // Red
                $statusLabel = 'Kritis / Terlalu Redam (< -27 dBm)';
            } elseif ($customerPortPower < -24.0) {
                $status = 'warning';
                $statusColor = '#F59E0B'; // Yellow
                $statusLabel = 'Waspada / Perhatian (-24 s/d -27 dBm)';
            } elseif ($customerPortPower > -10.0) {
                $status = 'hot';
                $statusColor = '#EC4899'; // Pink
                $statusLabel = 'Sinyal Terlalu Kuat (> -10 dBm)';
            }
        }

        return [
            'input_power_dbm' => $inputPowerDbm,
            'fiber_distance_meters' => round($fiberLengthMeters, 1),
            'fiber_loss_db' => $fiberLoss,
            'arriving_power_dbm' => $arrivingPower,
            'special_ratio' => $cleanSpecial !== 'none' ? $cleanSpecial : null,
            'thru_loss_db' => $thruLoss,
            'thru_output_power_dbm' => $thruOutputPower,
            'tap_loss_db' => $tapLoss,
            'dist_ratio' => $cleanDist !== 'none' ? $cleanDist : null,
            'dist_loss_db' => $distLoss,
            'customer_port_power_dbm' => $customerPortPower,
            'status' => $status,
            'status_color' => $statusColor,
            'status_label' => $statusLabel,
            'is_odc' => $isOdc,
        ];
    }

    /**
     * Compute approximate distance between two lat/lng coordinates in meters (Haversine formula)
     */
    public static function computeDistanceMeters(?float $lat1, ?float $lng1, ?float $lat2, ?float $lng2): float
    {
        if ($lat1 === null || $lng1 === null || $lat2 === null || $lng2 === null) {
            return 0.0;
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
}
