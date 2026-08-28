<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Odp;
use App\Models\OdpMappingAnomaly;
use App\Services\AuditLogService;
use App\Services\FeatureService;
use App\Services\OdpQualityAuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OdpMappingController extends Controller
{
    public function __construct(
        private FeatureService $featureService,
        private AuditLogService $auditLogService,
        private OdpQualityAuditService $odpQualityAuditService,
    ) {
    }

    public function customers(Request $request)
    {
        if (!$this->featureService->enabled('odp_mapping_v2')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        $validated = $request->validate([
            'search' => 'nullable|string|max:100',
            'odp_id' => 'nullable|integer|exists:odps,id',
            'status' => 'nullable|in:assigned,unassigned,mismatch',
            'per_page' => 'nullable|integer|min:10|max:200',
        ]);

        $perPage = (int) ($validated['per_page'] ?? 25);
        $search = trim((string) ($validated['search'] ?? ''));
        $status = $validated['status'] ?? null;

        $query = Customer::query()
            ->leftJoin('odps as o', 'o.id', '=', 'customers.odp_id')
            ->select([
                'customers.*',
                'o.nama as odp_master_name',
            ])
            ->orderBy('customers.name');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('customers.name', 'like', "%{$search}%")
                    ->orWhere('customers.pppoe_username', 'like', "%{$search}%")
                    ->orWhere('customers.phone', 'like', "%{$search}%")
                    ->orWhere('customers.address', 'like', "%{$search}%");
            });
        }

        if (!empty($validated['odp_id'])) {
            $query->where('customers.odp_id', (int) $validated['odp_id']);
        }

        if ($status === 'assigned') {
            $query->whereNotNull('customers.odp_id');
        } elseif ($status === 'unassigned') {
            $query->whereNull('customers.odp_id')->where(function ($q) {
                $q->whereNull('customers.odp')->orWhere('customers.odp', '');
            });
        } elseif ($status === 'mismatch') {
            $query->whereNull('customers.odp_id')->whereNotNull('customers.odp')->where('customers.odp', '!=', '');
        }

        $data = $query->paginate($perPage);

        $stats = [
            'assigned' => (int) Customer::query()->whereNotNull('odp_id')->count(),
            'unassigned' => (int) Customer::query()->whereNull('odp_id')->where(function ($q) {
                $q->whereNull('odp')->orWhere('odp', '');
            })->count(),
            'mismatch' => (int) Customer::query()->whereNull('odp_id')->whereNotNull('odp')->where('odp', '!=', '')->count(),
        ];

        return response()->json([
            'data' => $data,
            'meta' => [
                'stats' => $stats,
            ],
        ]);
    }

    public function assign(Request $request)
    {
        if (!$this->featureService->enabled('odp_mapping_v2')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        $validated = $request->validate([
            'customer_ids' => 'required|array|min:1',
            'customer_ids.*' => 'integer|exists:customers,id',
            'odp_id' => 'required|integer|exists:odps,id',
            'force_reassign' => 'nullable|boolean',
            'reason' => 'nullable|string|max:255',
        ]);

        $odp = Odp::query()->findOrFail((int) $validated['odp_id']);
        $forceReassign = (bool) ($validated['force_reassign'] ?? false);

        $customers = Customer::query()->whereIn('id', $validated['customer_ids'])->get();

        $conflicts = $customers
            ->filter(fn (Customer $customer) => !empty($customer->odp_id) && (int) $customer->odp_id !== (int) $odp->id)
            ->values();

        if ($conflicts->isNotEmpty() && !$forceReassign) {
            return response()->json([
                'message' => 'Sebagian pelanggan sudah terikat ke ODP lain.',
                'conflicts' => $conflicts->map(fn (Customer $customer) => [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'odp_id' => $customer->odp_id,
                    'odp' => $customer->odp,
                ]),
            ], 409);
        }

        DB::transaction(function () use ($customers, $odp, $validated) {
            foreach ($customers as $customer) {
                $oldOdp = $customer->odp;
                $oldOdpId = $customer->odp_id;

                $customer->odp_id = $odp->id;
                $customer->odp = $odp->nama;
                $customer->save();

                OdpMappingAnomaly::query()
                    ->where('customer_id', $customer->id)
                    ->where('resolved', false)
                    ->update([
                        'resolved' => true,
                        'resolved_by' => auth()->id(),
                        'resolved_at' => now(),
                    ]);

                $this->auditLogService->log('odp.mapping.assigned', $customer, [
                    'old_odp' => $oldOdp,
                    'old_odp_id' => $oldOdpId,
                    'new_odp' => $odp->nama,
                    'new_odp_id' => $odp->id,
                    'reason' => $validated['reason'] ?? null,
                ], auth()->id());
            }
        });

        return response()->json([
            'message' => 'Pemetaan ODP berhasil diperbarui.',
            'data' => [
                'updated_count' => $customers->count(),
            ],
        ]);
    }

    public function unassign(Request $request)
    {
        if (!$this->featureService->enabled('odp_mapping_v2')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        $validated = $request->validate([
            'customer_ids' => 'required|array|min:1',
            'customer_ids.*' => 'integer|exists:customers,id',
            'reason' => 'nullable|string|max:255',
        ]);

        $customers = Customer::query()->whereIn('id', $validated['customer_ids'])->get();

        DB::transaction(function () use ($customers, $validated) {
            foreach ($customers as $customer) {
                $oldOdp = $customer->odp;
                $oldOdpId = $customer->odp_id;

                $customer->odp_id = null;
                $customer->odp = null;
                $customer->save();

                $this->auditLogService->log('odp.mapping.unassigned', $customer, [
                    'old_odp' => $oldOdp,
                    'old_odp_id' => $oldOdpId,
                    'reason' => $validated['reason'] ?? null,
                ], auth()->id());
            }
        });

        return response()->json([
            'message' => 'Pelanggan berhasil dilepas dari ODP.',
            'data' => [
                'updated_count' => $customers->count(),
            ],
        ]);
    }

    public function options()
    {
        if (!$this->featureService->enabled('odp_mapping_v2')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        $validated = request()->validate([
            'desa_id' => 'nullable|integer|exists:master_wilayah_desas,id',
            'dusun_id' => 'nullable|integer|exists:master_wilayah_dusuns,id',
            'scope' => 'nullable|in:dusun,desa',
        ]);

        $scope = (string) ($validated['scope'] ?? '');

        $query = Odp::query();
        if (!empty($validated['desa_id'])) {
            $query->where('desa_id', (int) $validated['desa_id']);
            if ($scope === 'dusun' && !empty($validated['dusun_id'])) {
                $query->where('dusun_id', (int) $validated['dusun_id']);
            }
        }

        $items = $query
            ->orderBy('nama')
            ->get([
                'id',
                'nama',
                'rasio_distribusi',
                'kecamatan_id',
                'desa_id',
                'dusun_id',
                'alamat_detail',
            ]);

        return response()->json(['data' => $items]);
    }

    public function backfill()
    {
        if (!$this->featureService->enabled('odp_mapping_v2')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        $odpsByName = Odp::query()->pluck('id', 'nama');
        $updated = 0;
        $mismatch = 0;

        Customer::query()->whereNull('odp_id')->whereNotNull('odp')->where('odp', '!=', '')->chunkById(100, function ($customers) use (&$updated, &$mismatch, $odpsByName) {
            foreach ($customers as $customer) {
                $legacyName = trim((string) $customer->odp);
                $odpId = $odpsByName[$legacyName] ?? null;

                if ($odpId) {
                    $customer->odp_id = (int) $odpId;
                    $customer->save();
                    $updated++;
                } else {
                    OdpMappingAnomaly::updateOrCreate(
                        [
                            'customer_id' => $customer->id,
                            'anomaly_type' => 'odp_not_found',
                            'legacy_odp_name' => $legacyName,
                        ],
                        [
                            'notes' => 'Nama ODP legacy tidak ditemukan di master ODP.',
                            'resolved' => false,
                        ]
                    );
                    $mismatch++;
                }
            }
        });

        return response()->json([
            'message' => 'Backfill ODP selesai dijalankan.',
            'data' => [
                'updated' => $updated,
                'mismatch' => $mismatch,
            ],
        ]);
    }

    public function qualityAudit()
    {
        if (!$this->featureService->enabled('odp_quality_score_v1')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        return response()->json([
            'data' => $this->odpQualityAuditService->audit(),
        ]);
    }
}
