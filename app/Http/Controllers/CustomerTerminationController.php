<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerTerminationRequest;
use App\Services\CustomerTerminationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CustomerTerminationController extends Controller
{
    public function index(Customer $customer, CustomerTerminationService $service)
    {
        $items = $customer->terminationRequests()
            ->latest('id')
            ->get()
            ->map(fn (CustomerTerminationRequest $request) => $service->toPayload($request));

        return response()->json([
            'success' => true,
            'data' => $items,
        ]);
    }

    public function store(Request $request, Customer $customer, CustomerTerminationService $service)
    {
        $validated = $request->validate([
            'planned_termination_date' => 'nullable|date',
            'reason' => 'nullable|string|max:2000',
            'device_notes' => 'nullable|string|max:2000',
            'return_instructions' => 'nullable|string|max:2000',
        ]);

        $termination = $service->create($customer, $validated, auth()->id());

        return response()->json([
            'success' => true,
            'message' => 'Surat copot pemasangan berhasil dibuat.',
            'data' => $service->toPayload($termination),
        ], 201);
    }

    public function sendWhatsApp(Customer $customer, CustomerTerminationRequest $termination, CustomerTerminationService $service)
    {
        $this->ensureBelongsToCustomer($customer, $termination);

        $result = $service->sendWhatsApp($termination);

        return response()->json([
            'success' => $result['success'],
            'message' => $result['success'] ? 'Surat copot berhasil dikirim via WhatsApp.' : 'Surat copot gagal dikirim via WhatsApp.',
            'result' => $result,
            'data' => $service->toPayload($termination->fresh()),
        ], $result['success'] ? 200 : 422);
    }

    public function finalize(Customer $customer, CustomerTerminationRequest $termination, CustomerTerminationService $service)
    {
        $this->ensureBelongsToCustomer($customer, $termination);

        $updated = $service->finalize($termination, auth()->id());

        return response()->json([
            'success' => true,
            'message' => 'Verifikasi final copot pemasangan berhasil. Pelanggan dinonaktifkan.',
            'data' => $service->toPayload($updated),
        ]);
    }

    public function cancel(Customer $customer, CustomerTerminationRequest $termination, CustomerTerminationService $service)
    {
        $this->ensureBelongsToCustomer($customer, $termination);

        $updated = $service->cancel($termination, auth()->id());

        return response()->json([
            'success' => true,
            'message' => 'Surat copot pemasangan dibatalkan.',
            'data' => $service->toPayload($updated),
        ]);
    }

    public function publicVerify(string $token)
    {
        $termination = CustomerTerminationRequest::with('customer')
            ->where('public_token', $token)
            ->firstOrFail();

        return view('contracts.termination-verify', [
            'termination' => $termination,
            'customerData' => $termination->customer_data ?: [],
            'signatureMeta' => $termination->signature_meta ?: [],
        ]);
    }

    public function publicDownload(string $token)
    {
        $termination = CustomerTerminationRequest::query()
            ->where('public_token', $token)
            ->firstOrFail();

        abort_unless($termination->pdf_path && Storage::disk('public')->exists($termination->pdf_path), 404);

        return redirect(Storage::disk('public')->url($termination->pdf_path));
    }

    private function ensureBelongsToCustomer(Customer $customer, CustomerTerminationRequest $termination): void
    {
        abort_unless((int) $termination->customer_id === (int) $customer->id, 404);
    }
}
