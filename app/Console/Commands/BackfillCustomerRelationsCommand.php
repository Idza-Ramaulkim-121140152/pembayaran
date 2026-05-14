<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Models\Odp;
use App\Models\OdpMappingAnomaly;
use App\Models\Package;
use Illuminate\Console\Command;

class BackfillCustomerRelationsCommand extends Command
{
    protected $signature = 'customers:backfill-relations';

    protected $description = 'Backfill customers.odp_id and customers.package_id from legacy string fields';

    public function handle(): int
    {
        $odpNameMap = Odp::query()->pluck('id', 'nama');
        $packageNameMap = Package::query()->get()->mapWithKeys(function (Package $package) {
            return [strtolower(trim((string) $package->name)) => $package->id];
        });

        $odpUpdated = 0;
        $packageUpdated = 0;
        $mismatch = 0;

        Customer::query()->chunkById(200, function ($customers) use ($odpNameMap, $packageNameMap, &$odpUpdated, &$packageUpdated, &$mismatch) {
            foreach ($customers as $customer) {
                $dirty = false;

                if (empty($customer->odp_id) && !empty($customer->odp)) {
                    $odpName = trim((string) $customer->odp);
                    $mappedOdpId = $odpNameMap[$odpName] ?? null;

                    if ($mappedOdpId) {
                        $customer->odp_id = (int) $mappedOdpId;
                        $dirty = true;
                        $odpUpdated++;
                    } else {
                        OdpMappingAnomaly::updateOrCreate(
                            [
                                'customer_id' => $customer->id,
                                'legacy_odp_name' => $odpName,
                                'anomaly_type' => 'odp_not_found',
                            ],
                            [
                                'notes' => 'Legacy ODP tidak ditemukan saat backfill relasi.',
                                'resolved' => false,
                            ]
                        );
                        $mismatch++;
                    }
                }

                if (empty($customer->package_id) && !empty($customer->package_type)) {
                    $packageKey = strtolower(trim((string) $customer->package_type));
                    $mappedPackageId = $packageNameMap[$packageKey] ?? null;

                    if ($mappedPackageId) {
                        $customer->package_id = (int) $mappedPackageId;
                        $dirty = true;
                        $packageUpdated++;
                    }
                }

                if ($dirty) {
                    $customer->save();
                }
            }
        });

        $this->info(sprintf(
            'Backfill selesai. odp_id updated: %d, package_id updated: %d, mismatch: %d',
            $odpUpdated,
            $packageUpdated,
            $mismatch
        ));

        return self::SUCCESS;
    }
}
