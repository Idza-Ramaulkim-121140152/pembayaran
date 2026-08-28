<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerAgreement;
use App\Services\CustomerAgreementService;
use App\Services\CustomerAgreementWhatsAppService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CustomerAgreementController extends Controller
{
    public function index(Customer $customer, CustomerAgreementService $service)
    {
        $agreements = $customer->agreements()
            ->latest('id')
            ->get()
            ->map(fn (CustomerAgreement $agreement) => $service->toPayload($agreement));

        return response()->json([
            'success' => true,
            'data' => $agreements,
        ]);
    }

    public function store(Request $request, Customer $customer, CustomerAgreementService $service)
    {
        $validated = $request->validate([
            'contract_ktp_number' => 'nullable|string|max:32',
            'contract_router_mac' => 'nullable|string|max:64',
            'contract_device_serial' => 'nullable|string|max:128',
            'contract_device_notes' => 'nullable|string|max:1000',
            'contract_photo_front_url' => 'nullable|string|max:1000',
            'contract_photo_modem_url' => 'nullable|string|max:1000',
            'contract_photo_ktp_url' => 'nullable|string|max:1000',
            'contract_installation_photos' => 'nullable|array|max:8',
            'contract_installation_photos.*' => 'file|image|max:4096',
        ]);

        $agreement = $service->generate(
            $customer,
            $validated,
            $request->file('contract_installation_photos', []),
            auth()->id()
        );

        return response()->json([
            'success' => true,
            'message' => 'Kontrak pelanggan berhasil dibuat.',
            'data' => $service->toPayload($agreement),
        ]);
    }

    public function sendWhatsApp(
        Customer $customer,
        CustomerAgreement $contract,
        CustomerAgreementWhatsAppService $whatsAppService,
        CustomerAgreementService $agreementService
    ) {
        abort_unless((int) $contract->customer_id === (int) $customer->id, 404);

        $result = $whatsAppService->send($contract);

        return response()->json([
            'success' => $result['success'],
            'message' => $result['success'] ? 'Kontrak berhasil dikirim via WhatsApp.' : 'Kontrak gagal dikirim via WhatsApp.',
            'result' => $result,
            'data' => $agreementService->toPayload($contract->fresh()),
        ], $result['success'] ? 200 : 422);
    }

    public function publicVerify(string $token)
    {
        $agreement = CustomerAgreement::with('customer')
            ->where('public_token', $token)
            ->firstOrFail();

        return view('contracts.verify', [
            'agreement' => $agreement,
            'customerData' => $agreement->customer_data ?: [],
            'signatureMeta' => $agreement->signature_meta ?: [],
        ]);
    }

    public function publicDownload(string $token)
    {
        $agreement = CustomerAgreement::query()
            ->where('public_token', $token)
            ->firstOrFail();

        abort_unless($agreement->pdf_path && Storage::disk('public')->exists($agreement->pdf_path), 404);

        return redirect(Storage::disk('public')->url($agreement->pdf_path));
    }
}
