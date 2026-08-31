<?php

namespace App\Http\Controllers;

use App\Exceptions\GenieAcsException;
use App\Http\Controllers\Concerns\PaymentProofGuard;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\CustomerNetworkNoticeRead;
use App\Models\Invoice;
use App\Models\NetworkNotice;
use App\Models\PaymentMethod;
use App\Services\CustomerPortalService;
use App\Services\GenieAcsService;
use App\Services\WifiPasswordVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Session;
use Illuminate\Support\Arr;

class CustomerAuthController extends Controller
{
    use PaymentProofGuard;

    private const DEFAULT_PASSWORD = 'user123';

    /**
     * Login pelanggan dengan nomor telepon atau username PPPoE
     */
    public function login(Request $request)
    {
        $request->validate([
            'identifier' => 'required|string',
            'password' => 'required|string|min:6|max:255',
        ]);

        $identifier = trim((string) $request->identifier);
        $password = (string) $request->password;
        $normalizedIdentifier = strtolower($identifier);

        // Cari customer berdasarkan nomor telepon atau username PPPoE
        $customer = Customer::query()
            ->where('phone', $identifier)
            ->orWhereRaw('LOWER(pppoe_username) = ?', [$normalizedIdentifier])
            ->first();

        if (!$customer) {
            return response()->json([
                'success' => false,
                'message' => 'Username PPPoE/No. HP atau password salah.'
            ], 401);
        }

        if (!(bool) ($customer->portal_login_enabled ?? true)) {
            return response()->json([
                'success' => false,
                'message' => 'Akses login akun Anda sedang dinonaktifkan. Hubungi admin.'
            ], 403);
        }

        if (empty($customer->mobile_password)) {
            $customer->mobile_password = Hash::make(self::DEFAULT_PASSWORD);
            $customer->mobile_force_password_change = true;
            $customer->mobile_password_changed_at = null;
            $customer->mobile_password_reset_at = now();
            $customer->mobile_password_reset_meta = [
                'reason' => 'autofill_default_password',
            ];
            $customer->save();
        }

        if (!Hash::check($password, (string) $customer->mobile_password)) {
            return response()->json([
                'success' => false,
                'message' => 'Username PPPoE/No. HP atau password salah.'
            ], 401);
        }

        // Simpan session pelanggan
        Session::put('customer_id', $customer->id);
        Session::put('customer_logged_in', true);

        return response()->json([
            'success' => true,
            'message' => 'Login berhasil',
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
            ]
        ]);
    }

    /**
     * Logout pelanggan
     */
    public function logout(Request $request)
    {
        Session::forget('customer_id');
        Session::forget('customer_logged_in');

        return response()->json([
            'success' => true,
            'message' => 'Logout berhasil'
        ]);
    }

    /**
     * Cek status login pelanggan
     */
    public function check(Request $request)
    {
        $customerId = Session::get('customer_id');
        
        if (!$customerId) {
            return response()->json([
                'logged_in' => false
            ]);
        }

        $customer = Customer::find($customerId);
        
        if (!$customer) {
            Session::forget('customer_id');
            Session::forget('customer_logged_in');
            return response()->json([
                'logged_in' => false
            ]);
        }

        return response()->json([
            'logged_in' => true,
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
            ]
        ]);
    }

    /**
     * Get customer dashboard data
     */
    public function dashboard(Request $request, CustomerPortalService $customerPortalService)
    {
        $customerId = Session::get('customer_id');
        
        if (!$customerId) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized'
            ], 401);
        }

        $customer = Customer::with(['odp'])->find($customerId);
        
        if (!$customer) {
            Session::forget('customer_id');
            Session::forget('customer_logged_in');

            return response()->json([
                'success' => false,
                'message' => 'Customer not found'
            ], 404);
        }

        return response()->json(array_merge([
            'success' => true,
        ], $customerPortalService->buildDashboard($customer, $request)));
    }

    /**
     * Submit aduan/keluhan
     */
    public function submitComplaint(Request $request)
    {
        $customerId = Session::get('customer_id');
        
        if (!$customerId) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized'
            ], 401);
        }

        $request->validate([
            'subject' => 'required|string|max:255',
            'message' => 'required|string',
            'category' => 'required|in:gangguan,pembayaran,layanan,lainnya',
        ]);

        $complaint = \App\Models\Complaint::create([
            'customer_id' => $customerId,
            'subject' => $request->subject,
            'message' => $request->message,
            'category' => $request->category,
            'status' => 'pending',
            'priority' => 'medium',
            'opened_at' => now(),
            'last_activity_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Aduan berhasil dikirim',
            'complaint' => $complaint,
        ], 201);
    }

    public function paymentMethods(): JsonResponse
    {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $methods = PaymentMethod::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->get();

        return response()->json(['success' => true, 'data' => $methods]);
    }

    public function confirmPayment(Request $request): JsonResponse
    {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $this->ensurePaymentProofUploadWithinPostLimit($request);
        $this->warnIfPaymentProofPayloadInvalid($request, null, 'public');
        $this->ensurePaymentProofUploadIsValid($request);
        $this->ensureNonFilePaymentProofPayloadRejected($request);

        $validated = $request->validate([
            'invoice_id' => 'required|integer|exists:invoices,id',
            'paid_amount' => 'nullable|numeric|min:1',
            'bukti_pembayaran' => 'nullable|file|mimes:' . $this->paymentProofMimeList() . '|max:2048',
        ]);

        $invoice = Invoice::query()
            ->where('id', $validated['invoice_id'])
            ->where('customer_id', $customerId)
            ->first();

        if (!$invoice) {
            return response()->json(['success' => false, 'message' => 'Invoice tidak ditemukan.'], 404);
        }

        if (in_array(strtolower((string) $invoice->status), ['paid', 'cancelled'], true)) {
            return response()->json(['success' => false, 'message' => 'Invoice tidak dapat dikonfirmasi.'], 422);
        }

        if (!empty($validated['paid_amount'])) {
            $invoice->amount = $validated['paid_amount'];
        }

        if ($request->hasFile('bukti_pembayaran')) {
            $path = $request->file('bukti_pembayaran')->store('bukti_pembayaran', 'public');
            $invoice->bukti_pembayaran = $path;
            $invoice->tolak_info = null;
        }

        $invoice->status = 'menunggu konfirmasi';
        $invoice->paid_at = null;
        $invoice->save();
        $this->appendPaymentProofAttributes($invoice);

        if ($invoice->bukti_pembayaran) {
            try {
                $capture = \App\Models\BillingPaymentCapture::create([
                    'source' => 'customer_app',
                    'invoice_id' => $invoice->id,
                    'customer_id' => $invoice->customer_id,
                    'amount' => (float) $invoice->amount,
                    'paid_date' => now()->toDateString(),
                    'reference_code' => $invoice->invoice_link,
                    'fingerprint' => hash('sha256', 'customer_app:' . $invoice->id . ':' . $invoice->bukti_pembayaran . ':' . microtime(true)),
                    'match_status' => 'pending',
                    'meta' => [
                        'media' => [
                            'path' => $invoice->bukti_pembayaran,
                            'mime_type' => $request->hasFile('bukti_pembayaran') ? $request->file('bukti_pembayaran')->getMimeType() : 'image/jpeg',
                            'file_name' => $request->hasFile('bukti_pembayaran') ? $request->file('bukti_pembayaran')->getClientOriginalName() : basename($invoice->bukti_pembayaran),
                        ],
                        'source' => [
                            'type' => 'customer_portal_app',
                            'invoice_link' => $invoice->invoice_link,
                            'customer_id' => $customerId,
                        ],
                    ],
                ]);

                \App\Jobs\AnalyzeWhatsAppPaymentCaptureJob::dispatch($capture->id);
            } catch (\Throwable $captureEx) {
                \Illuminate\Support\Facades\Log::warning('Failed to dispatch payment capture for customer portal confirmation', [
                    'invoice_id' => $invoice->id,
                    'error' => $captureEx->getMessage(),
                ]);
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Konfirmasi pembayaran berhasil dikirim.',
            'data' => $invoice,
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $customer = Customer::find($customerId);
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer tidak ditemukan.'], 404);
        }

        $validated = $request->validate([
            'phone' => 'required|string|max:32|unique:customers,phone,' . $customer->id,
        ]);

        $customer->phone = $validated['phone'];
        $customer->save();

        return response()->json([
            'success' => true,
            'message' => 'Nomor telepon berhasil diperbarui.',
            'data' => ['phone' => $customer->phone],
        ]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $customer = Customer::find($customerId);
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer tidak ditemukan.'], 404);
        }

        $validated = $request->validate([
            'current_password' => 'required|string|min:6|max:255',
            'new_password' => 'required|string|min:6|max:255|confirmed',
        ]);

        if (!Hash::check($validated['current_password'], (string) $customer->mobile_password)) {
            return response()->json(['success' => false, 'message' => 'Password saat ini tidak sesuai.'], 422);
        }

        $customer->mobile_password = Hash::make($validated['new_password']);
        $customer->mobile_force_password_change = false;
        $customer->mobile_password_changed_at = now();
        $customer->save();

        return response()->json(['success' => true, 'message' => 'Password berhasil diperbarui.']);
    }

    public function wifiDevice(Request $request, GenieAcsService $genieAcsService): JsonResponse
    {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $customer = Customer::find($customerId);
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer tidak ditemukan.'], 404);
        }

        $pppoeUsername = trim((string) $customer->pppoe_username);
        if ($pppoeUsername === '') {
            return response()->json(['success' => false, 'message' => 'Akun Anda belum memiliki PPPoE username. Hubungi admin.'], 422);
        }

        try {
            $device = $genieAcsService->describeDeviceByPppoe($pppoeUsername);

            return response()->json([
                'success' => true,
                'data' => $this->safeWifiDeviceSummary($device),
            ]);
        } catch (GenieAcsException $exception) {
            return response()->json([
                'success' => false,
                'message' => $exception->getMessage(),
            ], $exception->status());
        }
    }

    public function updateWifiPassword(
        Request $request,
        GenieAcsService $genieAcsService,
        WifiPasswordVerificationService $wifiPasswordVerificationService
    ): JsonResponse {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $customer = Customer::find($customerId);
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer tidak ditemukan.'], 404);
        }

        $validated = $request->validate([
            'password' => ['required', 'string', 'min:8', 'max:63', 'confirmed'],
        ], [
            'password.confirmed' => 'Konfirmasi password WiFi tidak cocok.',
            'password.min' => 'Password WiFi minimal 8 karakter.',
            'password.max' => 'Password WiFi maksimal 63 karakter.',
        ]);

        $pppoeUsername = trim((string) $customer->pppoe_username);
        if ($pppoeUsername === '') {
            return response()->json(['success' => false, 'message' => 'Akun Anda belum memiliki PPPoE username. Hubungi admin.'], 422);
        }

        try {
            $result = $genieAcsService->changeWifiPasswordByPppoe($pppoeUsername, $validated['password']);
            $verificationId = $wifiPasswordVerificationService->create(
                $customer,
                $pppoeUsername,
                $validated['password'],
                $result
            );

            return response()->json([
                'success' => true,
                'message' => 'Task ubah password WiFi berhasil dikirim ke GenieACS.',
                'data' => [
                    'device_id' => $result['device_id'] ?? null,
                    'updated_ssid_count' => $result['updated_ssid_count'] ?? 0,
                    'target_ssid_count' => $result['target_ssid_count'] ?? ($result['updated_ssid_count'] ?? 0),
                    'verification_id' => $verificationId,
                    'verification_status' => 'pending',
                    'verified_ssid_count' => 0,
                    'ssids' => $result['ssids'] ?? [],
                ],
            ]);
        } catch (GenieAcsException $exception) {
            return response()->json([
                'success' => false,
                'message' => $exception->getMessage(),
            ], $exception->status());
        }
    }

    public function wifiPasswordVerification(
        Request $request,
        string $verificationId,
        GenieAcsService $genieAcsService,
        WifiPasswordVerificationService $wifiPasswordVerificationService
    ): JsonResponse {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $customer = Customer::find($customerId);
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer tidak ditemukan.'], 404);
        }

        $payload = $wifiPasswordVerificationService->get($customer, $verificationId);
        if (!$payload) {
            return response()->json([
                'success' => false,
                'message' => 'Data verifikasi password WiFi tidak ditemukan atau sudah kedaluwarsa.',
            ], 404);
        }

        try {
            $password = $wifiPasswordVerificationService->decryptPassword($payload);
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'success' => false,
                'message' => 'Data verifikasi password WiFi tidak valid.',
            ], 422);
        }

        $result = $genieAcsService->verifyWifiPasswordByPppoe(
            (string) ($payload['pppoe_username'] ?? $customer->pppoe_username),
            $password,
            (array) ($payload['targets'] ?? [])
        );

        return response()->json([
            'success' => true,
            'data' => [
                'verification_id' => $verificationId,
                'device_id' => $payload['device_id'] ?? null,
                'status' => $result['status'] ?? 'pending',
                'verified_ssid_count' => $result['verified_ssid_count'] ?? 0,
                'target_ssid_count' => $result['target_ssid_count'] ?? 0,
                'ssids' => collect($result['ssids'] ?? [])
                    ->map(fn (array $ssid) => Arr::except($ssid, ['password_path', 'current_password']))
                    ->values()
                    ->all(),
                'message' => $result['message'] ?? 'Status verifikasi belum tersedia.',
            ],
        ]);
    }

    public function updateAutoMessage(Request $request): JsonResponse
    {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $customer = Customer::find($customerId);
        if (!$customer) {
            return response()->json(['success' => false, 'message' => 'Customer tidak ditemukan.'], 404);
        }

        $validated = $request->validate([
            'billing_auto_disabled' => 'required|boolean',
        ]);

        $customer->billing_auto_disabled = (bool) $validated['billing_auto_disabled'];
        $customer->save();

        return response()->json([
            'success' => true,
            'message' => $customer->billing_auto_disabled
                ? 'Pesan otomatis billing dinonaktifkan.'
                : 'Pesan otomatis billing diaktifkan.',
            'data' => ['billing_auto_disabled' => (bool) $customer->billing_auto_disabled],
        ]);
    }

    public function ticket(Complaint $complaint): JsonResponse
    {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        if ((int) $complaint->customer_id !== (int) $customerId) {
            return response()->json(['success' => false, 'message' => 'Tiket tidak ditemukan.'], 404);
        }

        $complaint->load(['events.creator:id,name']);

        return response()->json([
            'success' => true,
            'data' => [
                'ticket' => $complaint,
                'public_events' => $complaint->events
                    ->where('is_internal', false)
                    ->values(),
            ],
        ]);
    }

    public function markNoticeRead(Request $request, NetworkNotice $notice): JsonResponse
    {
        $customerId = Session::get('customer_id');
        if (!$customerId) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'dismiss' => 'nullable|boolean',
        ]);

        CustomerNetworkNoticeRead::query()->updateOrCreate(
            ['customer_id' => $customerId, 'network_notice_id' => $notice->id],
            [
                'read_at' => now(),
                'dismissed_at' => ($validated['dismiss'] ?? true) ? now() : null,
            ]
        );

        return response()->json(['success' => true, 'message' => 'Notifikasi ditandai sudah dibaca.']);
    }

    private function safeWifiDeviceSummary(array $device): array
    {
        return [
            'device_id' => $device['device_id'] ?? null,
            'serial_number' => $device['serial_number'] ?? null,
            'product_class' => $device['product_class'] ?? null,
            'ssids' => collect($device['ssids'] ?? [])
                ->map(fn (array $ssid) => Arr::except($ssid, ['password_path']))
                ->values()
                ->all(),
        ];
    }
}
