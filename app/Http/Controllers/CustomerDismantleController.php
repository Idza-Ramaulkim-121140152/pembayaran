<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\MasterWilayahKecamatan;
use App\Models\Odp;
use App\Models\User;
use App\Services\CustomerDismantleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerDismantleController extends Controller
{
    public function __construct(
        private CustomerDismantleService $dismantleService
    ) {
    }

    /**
     * Display a listing of customers eligible for equipment dismantling.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->only([
            'search',
            'status',
            'aging_months',
            'kecamatan_id',
            'desa_id',
            'dusun_id',
            'odp_id',
            'has_photo',
            'sort_by',
            'as_of_date',
        ]);

        $data = $this->dismantleService->getDismantleEligibleCustomers($filters);

        // Include lightweight filter options for the frontend UI
        $kecamatans = MasterWilayahKecamatan::select('id', 'name')->orderBy('name')->get();
        $odps = Odp::select('id', 'nama')->orderBy('nama')->get();
        $technicians = User::whereIn('role', ['teknisi', 'admin', 'superadmin'])
            ->select('id', 'name', 'phone')
            ->orderBy('name')
            ->get();

        $data['filter_options'] = [
            'kecamatans' => $kecamatans,
            'odps' => $odps,
            'technicians' => $technicians,
        ];

        return response()->json($data);
    }

    /**
     * Update dismantle status, retrieved items checklist, notes, and proof photo.
     */
    public function updateStatus(Request $request, int $customerId): JsonResponse
    {
        $request->validate([
            'status' => 'required|string|in:siap_dicopot,proses,sudah_dicopot,batal_bayar',
            'notes' => 'nullable|string|max:1000',
            'technician_name' => 'nullable|string|max:150',
            'retrieved_items' => 'nullable|array',
            'retrieved_items.*' => 'string',
            'proof_photo' => 'nullable|file|image|max:10240', // max 10MB
        ]);

        $payload = [
            'status' => $request->input('status'),
            'notes' => $request->input('notes'),
            'technician_name' => $request->input('technician_name'),
            'retrieved_items' => $request->input('retrieved_items', []),
        ];

        if ($request->hasFile('proof_photo')) {
            $payload['proof_photo_file'] = $request->file('proof_photo');
        }

        $result = $this->dismantleService->updateDismantleStatus($customerId, $payload, $request->user());

        return response()->json($result);
    }

    /**
     * Get pre-formatted WhatsApp text for technician work order sharing.
     */
    public function shareText(Request $request, int $customerId): JsonResponse
    {
        $customer = Customer::with([
            'kecamatan:id,name',
            'desa:id,name',
            'dusun:id,name',
            'odpBox:id,nama',
            'invoices' => function ($iq) {
                $iq->whereIn('status', ['unpaid', 'UNPAID', 'overdue', 'OVERDUE', 'menunggu konfirmasi'])
                   ->orderBy('due_date', 'asc');
            },
        ])->findOrFail($customerId);

        $item = $this->dismantleService->serializeDismantleItem($customer);

        return response()->json([
            'success' => true,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'share_wa_text' => $item['share_wa_text'],
            'share_wa_url' => $item['share_wa_url'],
            'item' => $item,
        ]);
    }
}
