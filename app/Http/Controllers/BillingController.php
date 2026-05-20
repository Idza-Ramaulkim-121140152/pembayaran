<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessBillingAutoInvoiceJob;
use App\Models\BillingAutoInvoiceJob;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\NotificationLog;
use App\Models\Package;
use App\Services\BillingAutoInvoiceService;
use App\Services\BillingItemService;
use App\Services\FeatureService;
use App\Services\FinancialLedgerService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class BillingController extends Controller
{
    private const ALMOST_LATE_DAYS = 5;

    private const INVOICE_MANAGEMENT_STATUSES = [
        'unpaid',
        'paid',
        'menunggu konfirmasi',
        'cancelled',
        'overdue',
    ];

    public function __construct(
        private FinancialLedgerService $ledgerService,
        private FeatureService $featureService,
        private BillingItemService $billingItemService,
    )
    {
    }

    private function canCurrentUserConfirmPayments(): bool
    {
        return Auth::check() && Auth::user()->canConfirmPayments();
    }

    private function ensureCanConfirmPayments(): void
    {
        if (!$this->canCurrentUserConfirmPayments()) {
            abort(response()->json([
                'message' => 'Anda tidak memiliki izin untuk konfirmasi pembayaran. Hubungi superadmin.',
            ], 403));
        }
    }

    private function normalizePaymentProofPath(?string $rawPath): ?string
    {
        $path = trim((string) $rawPath);
        if ($path === '') {
            return null;
        }

        $invalidMarkers = ['0', '1', 'false', 'null'];
        if (in_array(strtolower($path), $invalidMarkers, true)) {
            return null;
        }

        $path = str_replace('\\', '/', $path);
        $path = ltrim($path, '/');

        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, strlen('storage/'));
        }

        if (str_starts_with($path, 'public/')) {
            $path = substr($path, strlen('public/'));
        }

        $path = ltrim((string) $path, '/');
        if ($path === '' || in_array(strtolower($path), $invalidMarkers, true)) {
            return null;
        }

        if ($path === '.' || $path === '..') {
            return null;
        }

        return $path;
    }

    private function buildPaymentProofUrl(?Invoice $invoice): ?string
    {
        if (!$invoice) {
            return null;
        }

        $normalizedPath = $this->normalizePaymentProofPath($invoice->bukti_pembayaran);
        if ($normalizedPath === null) {
            return null;
        }

        return route('billing.invoice.payment-proof', ['invoice' => $invoice->id], false);
    }

    private function appendPaymentProofAttributes(?Invoice $invoice): void
    {
        if (!$invoice) {
            return;
        }

        $hasProof = $this->normalizePaymentProofPath($invoice->bukti_pembayaran) !== null;
        $proofUrl = $hasProof ? $this->buildPaymentProofUrl($invoice) : null;

        $invoice->setAttribute('has_payment_proof', $hasProof);
        $invoice->setAttribute('payment_proof_url', $proofUrl);
        // Backward compatibility untuk frontend lama.
        $invoice->setAttribute('bukti_pembayaran_url', $proofUrl);
    }

    private function warnIfPaymentProofPayloadInvalid(Request $request, Invoice $invoice): void
    {
        if (!$request->has('bukti_pembayaran') || $request->hasFile('bukti_pembayaran')) {
            return;
        }

        $rawValue = $request->input('bukti_pembayaran');
        if (is_array($rawValue) || is_object($rawValue)) {
            Log::warning('Unexpected non-file bukti_pembayaran payload received', [
                'invoice_id' => $invoice->id,
                'user_id' => Auth::id(),
                'is_authenticated' => Auth::check(),
                'content_type' => $request->header('Content-Type'),
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'payload_type' => gettype($rawValue),
            ]);
            return;
        }

        $payloadValue = trim((string) $rawValue);
        if ($payloadValue === '') {
            return;
        }

        Log::warning('Unexpected non-file bukti_pembayaran payload received', [
            'invoice_id' => $invoice->id,
            'user_id' => Auth::id(),
            'is_authenticated' => Auth::check(),
            'content_type' => $request->header('Content-Type'),
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'payload_preview' => substr($payloadValue, 0, 120),
        ]);
    }

    private function warnIfPublicStorageLinkMissing(): void
    {
        $publicStoragePath = public_path('storage');
        if (is_link($publicStoragePath) || is_dir($publicStoragePath)) {
            return;
        }

        $cacheKey = 'billing:missing-public-storage-link:warned';
        if (Cache::add($cacheKey, now()->toIso8601String(), now()->addHours(12))) {
            Log::warning('public/storage symlink tidak ditemukan. File bukti mungkin tidak bisa dibuka via URL langsung.', [
                'expected_path' => $publicStoragePath,
            ]);
        }
    }

    public function confirmPayment(Request $request, $invoiceId)
    {
        $invoice = Invoice::findOrFail($invoiceId);
        $paidAmount = $request->input('paid_amount');
        if ($paidAmount && $paidAmount > 0) {
            $invoice->amount = $paidAmount;
        }

        $this->warnIfPaymentProofPayloadInvalid($request, $invoice);

        // Handle upload bukti pembayaran (opsional)
        if ($request->hasFile('bukti_pembayaran')) {
            $file = $request->file('bukti_pembayaran');
            $path = $file->store('bukti_pembayaran', 'public');
            $invoice->bukti_pembayaran = $path;
            $invoice->tolak_info = null; // reset info tolak jika ada upload baru
        }


        // Jika admin (dari dashboard) konfirmasi, bisa kapan saja
        if ($this->canCurrentUserConfirmPayments()) {
            $invoice->status = 'paid';
            $invoice->paid_at = now();
            $invoice->tolak_info = null; // reset info tolak jika sudah dikonfirmasi

            // Update due_date customer (basis: due_date customer saat ini + 30 hari)
            $customer = $invoice->customer;
            if ($customer) {
                $customer->due_date = $this->computeNextDueDateFromCustomer($customer);

                if ($customer->pppoe_username) {
                    try {
                        $mikrotik = new \App\Services\MikroTikService();
                        $mikrotik->connect();
                        $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);

                        if ($secret && strtolower((string) ($secret['profile'] ?? '')) === 'isolir') {
                            $targetProfile = $this->resolveCustomerTargetProfile($customer);

                            try {
                                $profiles = $mikrotik->command('/ppp/profile/print');
                                $availableProfiles = array_map(fn ($p) => $p['name'] ?? '', $profiles);
                                $resolvedProfile = $this->resolveBestMatchingProfile($targetProfile, $availableProfiles);
                                if ($resolvedProfile !== null) {
                                    $targetProfile = $resolvedProfile;
                                }
                            } catch (\Exception $profileErr) {
                                Log::warning('Could not validate profile list while restoring isolated user', [
                                    'username' => $customer->pppoe_username,
                                    'target_profile' => $targetProfile,
                                    'error' => $profileErr->getMessage(),
                                ]);
                            }

                            $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);
                            $customer->mikrotik_profile = null;

                            Log::info('User restored from isolation after payment confirmation', [
                                'username' => $customer->pppoe_username,
                                'restored_profile' => $targetProfile,
                                'new_due_date' => $customer->due_date,
                            ]);
                        }

                        $mikrotik->disconnect();
                    } catch (\Exception $e) {
                        Log::error('Failed to check/restore user from isolation', [
                            'username' => $customer->pppoe_username,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }

                $customer->save();
            }
        } else {
            // Jika dari publik (bukan admin), status selalu jadi menunggu konfirmasi (kecuali sudah paid)
            if ($invoice->status !== 'paid') {
                $invoice->status = 'menunggu konfirmasi';
                $invoice->paid_at = null;
            }
        }

        $invoice->save();
        $this->ledgerService->syncInvoicePayment($invoice, Auth::id());

        // Redirect sesuai asal request
        if ($this->canCurrentUserConfirmPayments()) {
            return redirect()->route('billing.index')->with('success', 'Pembayaran dikonfirmasi.');
        }
        $invoice_link = $invoice->invoice_link;
        return redirect()->route('invoice.show', $invoice_link)->with('success', 'Konfirmasi pembayaran berhasil dikirim.');
    }
    // Tampilkan invoice berdasarkan link unik, tanpa login
    public function showInvoice($invoice_link)
    {
    $invoice = \App\Models\Invoice::where('invoice_link', $invoice_link)->with('customer')->firstOrFail();
    $hideNavbar = !\Illuminate\Support\Facades\Auth::check();
    return view('billing.invoice', compact('invoice', 'hideNavbar'));
    }

    public function index()
    {
        $today = Carbon::today();
        $almostLateEndDate = $today->copy()->addDays(self::ALMOST_LATE_DAYS);
        $query = Customer::query();
        $search = request('search');
        if ($search) {
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                  ->orWhere('pppoe_username', 'like', "%$search%")
                  ->orWhere('phone', 'like', "%$search%");
            });
        }
        $sort = request('sort');
        if ($sort === 'name_asc') {
            $query->orderBy('name', 'asc');
        } elseif ($sort === 'name_desc') {
            $query->orderBy('name', 'desc');
        } elseif ($sort === 'due_asc') {
            $query->orderBy('due_date', 'asc');
        } elseif ($sort === 'due_desc') {
            $query->orderBy('due_date', 'desc');
        }
        $customers = $query->with('latestInvoice')->get();

        $late = $customers->filter(function($c) use ($today) {
            return $c->due_date && Carbon::parse($c->due_date)->lt($today);
        });

        $almostLate = $customers->filter(function($c) use ($today, $almostLateEndDate) {
            return $c->due_date && Carbon::parse($c->due_date)->gte($today) && Carbon::parse($c->due_date)->lte($almostLateEndDate);
        });

        $others = $customers->filter(function($c) use ($late, $almostLate) {
            return !$late->contains($c) && !$almostLate->contains($c);
        });

        // Simpan invoice terbaru lintas bulan agar tidak hilang saat pergantian bulan.
        $latestInvoices = [];
        foreach ($customers as $customer) {
            $latestInvoices[$customer->id] = $customer->latestInvoice;
        }

        return view('billing.index', [
            'late' => $late,
            'almostLate' => $almostLate,
            'others' => $others,
            'invoicesThisMonth' => $latestInvoices,
            'latestInvoices' => $latestInvoices,
        ]);
    }

    public function createInvoice($customerId)
    {
        $customer = Customer::findOrFail($customerId);
        $amount = request()->input('amount');
        if (!$amount || $amount <= 0) {
            if (request()->wantsJson()) {
                return response()->json(['error' => 'Nominal tagihan harus diisi.'], 422);
            }
            return redirect()->back()->with('error', 'Nominal tagihan harus diisi.');
        }

        $existingOpenInvoice = $customer->invoices()
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->orderByDesc('id')
            ->first();

        if ($existingOpenInvoice) {
            if (request()->wantsJson()) {
                $existingLink = url('/invoice/' . $existingOpenInvoice->invoice_link);
                $template = "Yth. Bapak/Ibu " . strtoupper($customer->name) . "\n" .
                            "Username PPPoE: " . $customer->pppoe_username . "\n\n" .
                            "Nominal tagihan: Rp " . number_format($existingOpenInvoice->amount, 0, ',', '.') . "\n" .
                            "> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:" . "\n" .
                            $existingLink . "\n\n" .
                            "Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis." . "\n\n" .
                            "Layanan Call Center 085158025553" . "\n\n" .
                            "Salam Hangat," . "\n" .
                            "Tim Layanan Pelanggan Rumah Kita Net";

                return response()->json([
                    'message' => 'Tagihan aktif sudah tersedia. Gunakan invoice yang sudah ada.',
                    'data' => [
                        'invoice_id' => $existingOpenInvoice->id,
                        'invoice_link' => $existingLink,
                        'template' => $template,
                        'amount' => $existingOpenInvoice->amount,
                        'cancelled_previous_invoices' => 0,
                        'existing_invoice' => true,
                    ],
                ]);
            }

            return redirect()->route('billing.index')->with('success', 'Tagihan aktif sudah tersedia. Gunakan invoice yang sudah ada.');
        }

        $cancelledPreviousInvoices = 0;
        $invoice = null;

        DB::transaction(function () use ($customer, $amount, &$cancelledPreviousInvoices, &$invoice) {
            // Nonaktifkan invoice lama yang masih terbuka agar tidak dobel tagihan
            $cancelledPreviousInvoices = $customer->invoices()
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->update([
                    'status' => 'cancelled',
                    'paid_at' => null,
                    'tolak_info' => null,
                ]);

            $invoice = $customer->invoices()->create([
                'invoice_date' => now(),
                'due_date' => $customer->due_date ?? now()->addDays(7),
                'amount' => $amount,
                'status' => 'unpaid',
                'invoice_link' => uniqid('inv_'),
            ]);

            $this->ensureLegacyInvoiceItem($invoice, $customer, (float) $amount);
        });

        // TODO: Kirim link invoice ke pelanggan jika perlu

        if (request()->wantsJson()) {
            $link = url('/invoice/'.$invoice->invoice_link);
            $template = "Yth. Bapak/Ibu " . strtoupper($customer->name) . "\n" .
                        "Username PPPoE: " . $customer->pppoe_username . "\n\n" .
                        "Nominal tagihan: Rp " . number_format($invoice->amount, 0, ',', '.') . "\n" .
                        "> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:" . "\n" .
                        $link . "\n\n" .
                        "Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis." . "\n\n" .
                        "Layanan Call Center 085158025553" . "\n\n" .
                        "Salam Hangat," . "\n" .
                        "Tim Layanan Pelanggan Rumah Kita Net";

            return response()->json([
                'data' => [
                    'invoice_id' => $invoice->id,
                    'invoice_link' => $link,
                    'template' => $template,
                    'amount' => $invoice->amount,
                    'cancelled_previous_invoices' => (int) $cancelledPreviousInvoices,
                ]
            ]);
        }

        $successMessage = 'Tagihan berhasil dibuat.';
        if ($cancelledPreviousInvoices > 0) {
            $successMessage .= ' ' . $cancelledPreviousInvoices . ' tagihan lama dinonaktifkan.';
        }

        return redirect()->route('billing.index')->with('success', $successMessage);
    }

    public function tolakPembayaran($invoiceId)
    {
        $invoice = Invoice::findOrFail($invoiceId);
        // Hapus file bukti jika ada
        if ($invoice->bukti_pembayaran) {
            Storage::disk('public')->delete($invoice->bukti_pembayaran);
            $invoice->bukti_pembayaran = null;
        }
        $invoice->status = 'unpaid';
        $invoice->paid_at = null;
        $invoice->tolak_info = 'Bukti pembayaran Anda ditolak. Silakan upload ulang bukti pembayaran yang valid.';
        $invoice->save();
        $this->ledgerService->syncInvoicePayment($invoice, Auth::id());
        // Jika admin, redirect ke halaman billing.index, jika publik redirect ke invoice
        if (Auth::check() && Auth::user()->role === 'admin') {
            return redirect()->route('billing.index')->with('error', 'Bukti pembayaran ditolak.');
        }
        return redirect()->route('invoice.show', $invoice->invoice_link)->with('error', 'Bukti pembayaran ditolak. Silakan upload ulang bukti pembayaran yang valid.');
    }

    // API Methods for React
    public function apiIndex()
    {
        $this->warnIfPublicStorageLinkMissing();

        $today = Carbon::today();
        $almostLateEndDate = $today->copy()->addDays(self::ALMOST_LATE_DAYS);
        $startOfMonth = $today->copy()->startOfMonth();
        $endOfMonth = $today->copy()->endOfMonth();
        $includeIsolationStatus = request()->boolean('include_isolation_status', true);
        $query = Customer::query();
        
        $search = request('search');
        if ($search) {
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                  ->orWhere('pppoe_username', 'like', "%$search%")
                  ->orWhere('phone', 'like', "%$search%");
            });
        }
        
        $customers = $query->with('latestInvoice')->get();
        $customerIds = $customers->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->values()
            ->all();

        $activeInvoiceMap = [];
        if (!empty($customerIds)) {
            $activeInvoices = Invoice::query()
                ->whereIn('customer_id', $customerIds)
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->orderByDesc('id')
                ->get()
                ->unique('customer_id');

            foreach ($activeInvoices as $activeInvoice) {
                $activeInvoiceMap[(int) $activeInvoice->customer_id] = $activeInvoice;
            }
        }

        $paidThisMonthMap = Invoice::query()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$startOfMonth, $endOfMonth])
            ->pluck('customer_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->flip()
            ->all();

        // Categorize customers
        $late = [];
        $almostLate = [];
        $others = [];
        $paid = [];

        foreach ($customers as $customer) {
            $latestInvoice = $customer->latestInvoice;
            $activeInvoice = $activeInvoiceMap[(int) $customer->id] ?? null;

            $this->appendPaymentProofAttributes($latestInvoice);
            $this->appendPaymentProofAttributes($activeInvoice);

            $dueDate = $customer->due_date ? Carbon::parse($customer->due_date)->startOfDay() : null;
            $isLate = $dueDate && $dueDate->lt($today);
            $isAlmostLate = $dueDate && $dueDate->gte($today) && $dueDate->lte($almostLateEndDate);
            $latestInvoiceStatus = strtolower(trim((string) ($latestInvoice?->status ?? '')));
            $hasPaidThisMonth = isset($paidThisMonthMap[(int) $customer->id]);
            $hasActiveInvoice = $activeInvoice !== null;
            $canCreateInvoice = !$hasActiveInvoice;

            $item = [
                'customer' => $customer,
                'invoice' => $latestInvoice,
                'active_invoice' => $activeInvoice,
                'has_active_invoice' => $hasActiveInvoice,
                'can_create_invoice' => $canCreateInvoice,
                'has_paid_this_month' => $hasPaidThisMonth,
            ];
            
            // Pelanggan yang sudah bayar tetap ditampilkan saat memasuki periode hampir jatuh tempo.
            if ($latestInvoiceStatus === 'paid' && !$isLate && !$isAlmostLate) {
                $paid[] = $item;
                continue;
            }

            if ($isLate) {
                $late[] = $item;
            } elseif ($isAlmostLate) {
                $almostLate[] = $item;
            } else {
                $others[] = $item;
            }
        }

        // Opsional: status isolir dimuat terpisah agar daftar penagihan bisa tampil lebih cepat.
        $isolationStatus = [];
        if ($includeIsolationStatus) {
            $isolationStatus = $this->getBulkIsolationStatus($late);
        }

        return response()->json([
            'data' => [
                'late' => $late,
                'almostLate' => $almostLate,
                'others' => $others,
                'paid' => $paid,
                'isolationStatus' => $isolationStatus,
            ]
        ]);
    }

    public function paymentProof(Invoice $invoice)
    {
        $this->warnIfPublicStorageLinkMissing();

        $normalizedPath = $this->normalizePaymentProofPath($invoice->bukti_pembayaran);
        if ($normalizedPath === null) {
            abort(404, 'Path bukti pembayaran tidak valid.');
        }

        if (!Storage::disk('public')->exists($normalizedPath)) {
            abort(404, 'File bukti pembayaran tidak ditemukan di penyimpanan.');
        }

        $absolutePath = Storage::disk('public')->path($normalizedPath);
        $mimeType = Storage::disk('public')->mimeType($normalizedPath) ?: 'application/octet-stream';
        $fileName = basename($normalizedPath);

        return response()->file($absolutePath, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'inline; filename="' . $fileName . '"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, max-age=60',
        ]);
    }

    public function paymentProofBlob(Invoice $invoice)
    {
        $this->warnIfPublicStorageLinkMissing();

        $normalizedPath = $this->normalizePaymentProofPath($invoice->bukti_pembayaran);
        if ($normalizedPath === null) {
            abort(404, 'Path bukti pembayaran tidak valid.');
        }

        if (!Storage::disk('public')->exists($normalizedPath)) {
            abort(404, 'File bukti pembayaran tidak ditemukan di penyimpanan.');
        }

        $mimeType = Storage::disk('public')->mimeType($normalizedPath) ?: 'application/octet-stream';
        $fileName = basename($normalizedPath);
        $content = Storage::disk('public')->get($normalizedPath);

        return response($content, 200, [
            'Content-Type' => $mimeType,
            'Content-Disposition' => 'inline; filename="' . $fileName . '"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, max-age=60',
        ]);
    }

    public function autoInvoice(Request $request)
    {
        $validated = $request->validate([
            'segment' => ['required', Rule::in(['late', 'almostLate'])],
            'customer_ids' => ['required', 'array', 'min:1'],
            'customer_ids.*' => ['integer', 'exists:customers,id'],
            'search_context' => ['nullable', 'string', 'max:100'],
        ]);

        $customerIds = collect($validated['customer_ids'])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if (empty($customerIds)) {
            return response()->json([
                'message' => 'Tidak ada pelanggan valid untuk diproses.',
            ], 422);
        }

        $summary = app(BillingAutoInvoiceService::class)->defaultSummary(0);
        $job = BillingAutoInvoiceJob::create([
            'requested_by_user_id' => Auth::id(),
            'segment' => (string) $validated['segment'],
            'state' => 'queued',
            'phase' => 'queued',
            'customer_ids' => $customerIds,
            'search_context' => $validated['search_context'] ?? null,
            'summary' => $summary,
            'results' => [],
            'invalid_services' => [],
            'error_message' => null,
            'started_at' => null,
            'finished_at' => null,
        ]);

        ProcessBillingAutoInvoiceJob::dispatch($job->id);

        return response()->json([
            'message' => 'Proses auto invoice dimulai.',
            'job_id' => $job->id,
            'state' => $job->state,
            'phase' => $job->phase,
        ], 202);
    }

    public function autoInvoiceStatus(int $jobId)
    {
        $job = BillingAutoInvoiceJob::findOrFail($jobId);

        if ($job->requested_by_user_id && Auth::id() && (int) $job->requested_by_user_id !== (int) Auth::id()) {
            abort(403, 'Anda tidak memiliki akses ke proses auto invoice ini.');
        }

        return response()->json([
            'job_id' => $job->id,
            'state' => $job->state,
            'phase' => $job->phase,
            'summary' => $job->summary ?? [],
            'results' => $job->results ?? [],
            'invalid_services' => $job->invalid_services ?? [],
            'error_message' => $job->error_message,
            'started_at' => optional($job->started_at)->toISOString(),
            'finished_at' => optional($job->finished_at)->toISOString(),
            'updated_at' => optional($job->updated_at)->toISOString(),
        ]);
    }

    public function isolationStatusBulk(Request $request)
    {
        $validated = $request->validate([
            'customer_ids' => ['nullable', 'array'],
            'customer_ids.*' => ['integer'],
        ]);

        $customerIds = collect($validated['customer_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();

        if (empty($customerIds)) {
            return response()->json(['data' => []]);
        }

        $customers = Customer::query()
            ->whereIn('id', $customerIds)
            ->get(['id', 'pppoe_username']);

        $lateCustomers = [];
        foreach ($customers as $customer) {
            $lateCustomers[] = ['customer' => $customer];
        }

        $statusMap = $this->getBulkIsolationStatus($lateCustomers);

        return response()->json(['data' => $statusMap]);
    }

    public function updateCustomerServicePackage(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'package_id' => ['required', 'integer', 'exists:packages,id'],
        ]);

        $package = Package::query()
            ->where('id', $validated['package_id'])
            ->where('is_active', true)
            ->first();

        if (!$package) {
            return response()->json([
                'message' => 'Paket tidak ditemukan atau sedang nonaktif.',
            ], 422);
        }

        $oldPackageId = $customer->package_id ? (int) $customer->package_id : null;
        $oldPackageLabel = (string) ($customer->package_type ?? '');

        $customer->package_type = $package->name;
        $customer->package_id = $package->id;
        $customer->custom_package = null;
        $customer->mikrotik_profile = $package->mikrotik_profile ?: $package->name;
        $customer->save();

        $this->billingItemService->appendPackageHistory(
            $customer,
            $oldPackageId,
            $package->id,
            $oldPackageLabel,
            $package->name,
            'Update package from billing screen',
            Auth::id()
        );

        return response()->json([
            'message' => 'Layanan pelanggan berhasil diperbarui.',
            'data' => [
                'customer' => $customer->fresh(),
                'package' => $package,
            ],
        ]);
    }

    private function normalizeServiceLabel(?string $value): string
    {
        return strtolower(trim((string) $value));
    }

    private function ensureLegacyInvoiceItem(Invoice $invoice, Customer $customer, float $amount): void
    {
        if (!$this->featureService->enabled('billing_items_v1')) {
            return;
        }

        if ($invoice->items()->exists()) {
            $this->billingItemService->recalculateInvoiceTotal($invoice);
            return;
        }

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'item_type' => 'package',
            'description' => 'Paket bulanan ' . ($customer->package_type ?: 'Layanan'),
            'quantity' => 1,
            'unit_price' => $amount,
            'amount' => $amount,
            'meta' => [
                'source' => 'legacy_invoice_creation',
                'package_id' => $customer->package_id,
            ],
            'created_by' => Auth::id(),
        ]);

        $this->billingItemService->recalculateInvoiceTotal($invoice);
    }

    private function resolveCustomerServiceLabel(Customer $customer): string
    {
        $label = trim((string) ($customer->package_type ?? ''));
        if ($label !== '') {
            return $label;
        }

        return trim((string) ($customer->custom_package ?? ''));
    }

    private function isValidPhone(?string $phone): bool
    {
        if (!$phone || $phone === '0') {
            return false;
        }

        $cleaned = preg_replace('/\D/', '', $phone);
        return strlen((string) $cleaned) >= 10 && strlen((string) $cleaned) <= 15;
    }

    private function buildInvoiceMessage(Customer $customer, string $invoiceUrl, float $amount): string
    {
        return "Yth. Bapak/Ibu " . strtoupper((string) $customer->name) . "\n" .
            "Username PPPoE: " . ((string) $customer->pppoe_username ?: '-') . "\n\n" .
            "Nominal tagihan: Rp " . number_format($amount, 0, ',', '.') . "\n" .
            "> Informasi lengkap dan metode pembayaran tersedia pada link berikut:\n" .
            $invoiceUrl . "\n\n" .
            "Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis.\n\n" .
            "Layanan Call Center 085158025553\n\n" .
            "Salam Hangat,\n" .
            "Tim Layanan Pelanggan Rumah Kita Net";
    }

    /**
     * @return array{0: bool, 1: ?string}
     */
    private function sendInvoiceViaWhatsAppGateway(Customer $customer, string $message): array
    {
        try {
            $gatewayUrl = rtrim((string) env('WA_GATEWAY_URL', 'http://localhost:3001'), '/');
            $response = Http::timeout(60)->post($gatewayUrl . '/send-bulk', [
                'recipients' => [[
                    'phone' => (string) $customer->phone,
                    'name' => (string) ($customer->name ?? 'Pelanggan'),
                ]],
                'message' => $message,
                'delay' => 0,
            ]);

            $payload = $response->json();
            $results = is_array($payload['results'] ?? null) ? $payload['results'] : [];

            if (count($results) > 0) {
                $first = $results[0];
                $success = (bool) ($first['success'] ?? false);
                $error = $success ? null : (($first['error'] ?? null) ?: 'Gateway rejected message');
                return [$success, $error];
            }

            if ($response->successful()) {
                return [true, null];
            }

            return [false, (string) ($payload['error'] ?? 'Gateway response invalid')];
        } catch (\Throwable $e) {
            return [false, 'Gateway error: ' . $e->getMessage()];
        }
    }

    /**
     * @param array<string, mixed> $meta
     */
    private function logBillingNotification(?int $customerId, ?string $phone, string $message, string $status, ?string $error = null, array $meta = []): void
    {
        try {
            NotificationLog::create([
                'customer_id' => $customerId,
                'phone' => $phone,
                'message' => mb_substr($message, 0, 2000),
                'notice_id' => null,
                'status' => in_array($status, ['sent', 'failed', 'skipped'], true) ? $status : 'failed',
                'error' => $error,
                'meta' => $meta,
                'sent_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to write billing notification log', [
                'customer_id' => $customerId,
                'status' => $status,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function computeNextDueDateFromCustomer(Customer $customer): string
    {
        if (!empty($customer->due_date)) {
            return Carbon::parse($customer->due_date)->startOfDay()->addDays(30)->toDateString();
        }

        return now()->startOfDay()->addDays(30)->toDateString();
    }

    private function resolveCustomerTargetProfile(Customer $customer): string
    {
        $savedProfile = trim((string) ($customer->mikrotik_profile ?? ''));
        if ($savedProfile !== '') {
            return $savedProfile;
        }

        $packageType = trim((string) ($customer->package_type ?? ''));
        if ($packageType !== '') {
            $package = Package::query()
                ->whereRaw('LOWER(name) = ?', [strtolower($packageType)])
                ->first();

            $packageProfile = trim((string) ($package?->mikrotik_profile ?? ''));
            if ($packageProfile !== '') {
                return $packageProfile;
            }

            return $packageType;
        }

        return 'default';
    }

    /**
     * @param array<int, string> $availableProfiles
     */
    private function resolveBestMatchingProfile(string $targetProfile, array $availableProfiles): ?string
    {
        if ($targetProfile === '') {
            return null;
        }

        if (in_array($targetProfile, $availableProfiles, true)) {
            return $targetProfile;
        }

        foreach ($availableProfiles as $profile) {
            if (strtolower((string) $profile) === strtolower($targetProfile)) {
                return (string) $profile;
            }
        }

        $speed = preg_replace('/[^0-9]/', '', $targetProfile);
        if ($speed !== '') {
            foreach ($availableProfiles as $profile) {
                $lower = strtolower((string) $profile);
                if ($lower !== 'isolir' && str_contains((string) $profile, $speed)) {
                    return (string) $profile;
                }
            }
        }

        return null;
    }

    private function getBulkIsolationStatus($lateCustomers)
    {
        try {
            $mikrotik = new \App\Services\MikroTikService();
            
            // Get all isolated secrets in ONE MikroTik call
            $isolatedSecrets = $mikrotik->getIsolatedSecrets();
            
            // Create map of isolated usernames
            $isolatedUsernames = [];
            foreach ($isolatedSecrets as $secret) {
                $username = strtolower(trim((string) ($secret['name'] ?? '')));
                if ($username !== '') {
                    $isolatedUsernames[$username] = $secret['profile'] ?? 'isolir';
                }
            }
            
            // Build isolation status map by customer ID
            $statusMap = [];
            foreach ($lateCustomers as $item) {
                $customer = $item['customer'];
                $username = strtolower(trim((string) ($customer->pppoe_username ?? '')));
                $statusMap[$customer->id] = [
                    'isolated' => $username !== '' && isset($isolatedUsernames[$username]),
                    'profile' => ($username !== '' && isset($isolatedUsernames[$username])) ? $isolatedUsernames[$username] : null,
                ];
            }
            
            return $statusMap;
        } catch (\Exception $e) {
            \Log::error('Failed to get bulk isolation status: ' . $e->getMessage());
            return [];
        }
    }

    public function showInvoiceApi($invoice_link)
    {
        $invoice = \App\Models\Invoice::where('invoice_link', $invoice_link)->with(['customer', 'items'])->firstOrFail();
        return response()->json([
            'data' => $invoice,
            'breakdown' => [
                'total' => (float) $invoice->amount,
                'items_count' => $invoice->items->count(),
            ],
        ]);
    }

    public function confirmPaymentApi($invoiceId)
    {
        $this->ensureCanConfirmPayments();

        $rules = [
            'paid_amount' => 'nullable|numeric|min:1',
            'payment_receipt_option_id' => 'nullable',
            'payment_method_id' => 'nullable',
        ];

        if (Schema::hasTable('payment_receipt_options')) {
            $rules['payment_receipt_option_id'] = [
                'nullable',
                'integer',
                Rule::exists('payment_receipt_options', 'id')->where(fn ($query) => $query->where('is_active', true)),
            ];
        }

        if (Schema::hasTable('payment_methods')) {
            $rules['payment_method_id'] = [
                'nullable',
                'integer',
                Rule::exists('payment_methods', 'id')->where(fn ($query) => $query->where('is_active', true)),
            ];
        }

        $validated = request()->validate($rules);

        $invoice = Invoice::findOrFail($invoiceId);
        $paidAmount = $validated['paid_amount'] ?? null;
        $paymentReceiptOptionId = $validated['payment_receipt_option_id'] ?? null;
        $paymentMethodId = $validated['payment_method_id'] ?? null;
        
        if ($paidAmount && $paidAmount > 0) {
            $invoice->amount = $paidAmount;
        }

        if (Schema::hasColumn('invoices', 'received_via_payment_method_id')) {
            $invoice->received_via_payment_method_id = $paymentMethodId;
        }

        if (Schema::hasColumn('invoices', 'received_via_payment_receipt_option_id')) {
            $invoice->received_via_payment_receipt_option_id = $paymentReceiptOptionId;
        }

        $invoice->status = 'paid';
        $invoice->paid_at = now();
        $invoice->tolak_info = null;

        // Update due_date customer (basis: due_date customer saat ini + 30 hari)
        $customer = $invoice->customer;
        if ($customer) {
            $customer->due_date = $this->computeNextDueDateFromCustomer($customer);

            if ($customer->pppoe_username) {
                try {
                    $mikrotik = new \App\Services\MikroTikService();
                    $mikrotik->connect();
                    $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);

                    if ($secret && strtolower((string) ($secret['profile'] ?? '')) === 'isolir') {
                        $targetProfile = $this->resolveCustomerTargetProfile($customer);

                        try {
                            $profiles = $mikrotik->command('/ppp/profile/print');
                            $availableProfiles = array_map(fn ($p) => $p['name'] ?? '', $profiles);
                            $resolvedProfile = $this->resolveBestMatchingProfile($targetProfile, $availableProfiles);
                            if ($resolvedProfile !== null) {
                                $targetProfile = $resolvedProfile;
                            }
                        } catch (\Exception $profileErr) {
                            Log::warning('Could not validate profile list while restoring isolated user', [
                                'username' => $customer->pppoe_username,
                                'target_profile' => $targetProfile,
                                'error' => $profileErr->getMessage(),
                            ]);
                        }

                        $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);
                        $customer->mikrotik_profile = null;

                        Log::info('User restored from isolation after payment confirmation', [
                            'username' => $customer->pppoe_username,
                            'restored_profile' => $targetProfile,
                            'new_due_date' => $customer->due_date,
                        ]);
                    }

                    $mikrotik->disconnect();
                } catch (\Exception $e) {
                    Log::error('Failed to check/restore user from isolation', [
                        'username' => $customer->pppoe_username,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            $customer->save();
        }

        $invoice->save();
        $this->ledgerService->syncInvoicePayment($invoice, Auth::id());
        $invoice->loadMissing('receivedViaPaymentMethod');
        $invoice->loadMissing('receivedViaPaymentReceiptOption');

        return response()->json(['message' => 'Pembayaran berhasil dikonfirmasi', 'data' => $invoice]);
    }

    public function updateInvoiceAmountApi(Request $request, $invoiceId)
    {
        if (!Auth::check()) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $validated = $request->validate([
            'amount' => 'required|numeric|min:1',
        ]);

        $invoice = Invoice::findOrFail($invoiceId);
        $oldAmount = (float) $invoice->amount;
        $newAmount = (float) $validated['amount'];
        $invoice->amount = $newAmount;
        $invoice->save();

        if ($this->featureService->enabled('billing_items_v1') && $invoice->items()->exists()) {
            $diff = round($newAmount - $oldAmount, 2);
            if (abs($diff) > 0.0001) {
                InvoiceItem::create([
                    'invoice_id' => $invoice->id,
                    'item_type' => 'adjustment',
                    'description' => 'Penyesuaian nominal invoice manual',
                    'quantity' => 1,
                    'unit_price' => $diff,
                    'amount' => $diff,
                    'meta' => ['source' => 'updateInvoiceAmountApi'],
                    'created_by' => Auth::id(),
                ]);
                $this->billingItemService->recalculateInvoiceTotal($invoice);
            }
        }

        if ($invoice->status === 'paid') {
            $this->ledgerService->syncInvoicePayment($invoice, Auth::id());
        }

        return response()->json([
            'message' => 'Nominal invoice berhasil diperbarui.',
            'data' => $invoice,
        ]);
    }

    public function invoiceManagementIndex(Request $request)
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:100',
            'status' => [
                'nullable',
                'string',
                Rule::in(array_merge(['all'], self::INVOICE_MANAGEMENT_STATUSES)),
            ],
            'month' => 'nullable|date_format:Y-m',
            'per_page' => 'nullable|integer|min:10|max:100',
        ]);

        $search = trim((string) ($validated['search'] ?? ''));
        $status = $validated['status'] ?? 'all';
        $month = $validated['month'] ?? null;
        $perPage = (int) ($validated['per_page'] ?? 20);

        $query = Invoice::query()
            ->with([
                'customer:id,name,pppoe_username,phone',
            ])
            ->orderByDesc('invoice_date')
            ->orderByDesc('id');

        if ($search !== '') {
            $query->where(function ($invoiceQuery) use ($search) {
                $invoiceQuery->where('invoice_link', 'like', "%{$search}%")
                    ->orWhere('status', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($customerQuery) use ($search) {
                        $customerQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('pppoe_username', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    });

                if (ctype_digit($search)) {
                    $invoiceQuery->orWhere('id', (int) $search);
                }
            });
        }

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        if ($month) {
            [$year, $monthNumber] = explode('-', $month);
            $query->whereYear('invoice_date', (int) $year)
                ->whereMonth('invoice_date', (int) $monthNumber);
        }

        $invoices = $query->paginate($perPage)->withQueryString();

        return response()->json([
            'data' => $invoices,
            'meta' => [
                'allowed_statuses' => self::INVOICE_MANAGEMENT_STATUSES,
            ],
        ]);
    }

    public function updateInvoiceManagementApi(Request $request, Invoice $invoice)
    {
        $validated = $request->validate([
            'invoice_date' => 'required|date',
            'due_date' => 'required|date|after_or_equal:invoice_date',
            'amount' => 'required|numeric|min:1',
            'status' => ['required', 'string', Rule::in(self::INVOICE_MANAGEMENT_STATUSES)],
        ]);

        $newStatus = $validated['status'];

        DB::transaction(function () use ($invoice, $validated, $newStatus) {
            $oldAmount = (float) $invoice->amount;
            $newAmount = (float) $validated['amount'];
            $invoice->invoice_date = $validated['invoice_date'];
            $invoice->due_date = $validated['due_date'];
            $invoice->amount = $newAmount;
            $invoice->status = $newStatus;

            if ($newStatus === 'paid') {
                $invoice->paid_at = $invoice->paid_at ?: now();
                $invoice->tolak_info = null;
            } else {
                $invoice->paid_at = null;

                if (Schema::hasColumn('invoices', 'received_via_payment_method_id')) {
                    $invoice->received_via_payment_method_id = null;
                }

                if (Schema::hasColumn('invoices', 'received_via_payment_receipt_option_id')) {
                    $invoice->received_via_payment_receipt_option_id = null;
                }
            }

            $invoice->save();

            if ($this->featureService->enabled('billing_items_v1') && $invoice->items()->exists()) {
                $diff = round($newAmount - $oldAmount, 2);
                if (abs($diff) > 0.0001) {
                    InvoiceItem::create([
                        'invoice_id' => $invoice->id,
                        'item_type' => 'adjustment',
                        'description' => 'Penyesuaian nominal dari invoice management',
                        'quantity' => 1,
                        'unit_price' => $diff,
                        'amount' => $diff,
                        'meta' => ['source' => 'updateInvoiceManagementApi'],
                        'created_by' => Auth::id(),
                    ]);
                    $this->billingItemService->recalculateInvoiceTotal($invoice);
                }
            }

            $this->ledgerService->syncInvoicePayment($invoice, Auth::id());
        });

        $invoice->load('customer:id,name,pppoe_username,phone');

        return response()->json([
            'message' => 'Invoice berhasil diperbarui.',
            'data' => $invoice,
        ]);
    }

    public function deleteInvoiceManagementApi(Invoice $invoice)
    {
        if (strtolower((string) $invoice->status) !== 'unpaid') {
            return response()->json([
                'message' => 'Invoice hanya bisa dihapus jika status masih unpaid.',
            ], 422);
        }

        DB::transaction(function () use ($invoice) {
            if ($invoice->bukti_pembayaran) {
                Storage::disk('public')->delete($invoice->bukti_pembayaran);
            }

            $this->ledgerService->syncInvoicePayment($invoice, Auth::id());
            $invoice->delete();
        });

        return response()->json([
            'message' => 'Invoice berhasil dihapus.',
        ]);
    }

    public function isolateCustomer($customerId)
    {
        try {
            $customer = Customer::findOrFail($customerId);
            
            if (!$customer->pppoe_username) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer tidak memiliki username PPPoE'
                ], 400);
            }
            
            $mikrotik = new \App\Services\MikroTikService();
            
            // Get current profile BEFORE isolating so we can restore later
            $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
            
            if (!$secret) {
                return response()->json([
                    'success' => false,
                    'message' => 'Username PPPoE tidak ditemukan di MikroTik: ' . $customer->pppoe_username
                ], 404);
            }
            
            $currentProfile = $secret['profile'];
            
            // Already isolated
            if (strtolower($currentProfile) === 'isolir') {
                return response()->json([
                    'success' => false,
                    'message' => 'Pelanggan sudah dalam status isolir'
                ], 422);
            }
            
            // Save original MikroTik profile to customer record
            $customer->mikrotik_profile = $currentProfile;
            $customer->save();
            
            \Log::info('Saving original MikroTik profile before isolation', [
                'customer_id' => $customer->id,
                'username' => $customer->pppoe_username,
                'original_profile' => $currentProfile,
            ]);
            
            // Now isolate
            $result = $mikrotik->isolateUser($customer->pppoe_username);
            
            return response()->json([
                'success' => true,
                'message' => 'Pelanggan ' . $customer->name . ' berhasil diisolir',
                'data' => array_merge($result, [
                    'saved_profile' => $currentProfile,
                    'customer_name' => $customer->name,
                ])
            ]);
            
        } catch (\Exception $e) {
            \Log::error('Failed to isolate customer', [
                'customer_id' => $customerId,
                'error' => $e->getMessage()
            ]);
            
            return response()->json([
                'success' => false,
                'message' => 'Gagal melakukan isolir: ' . $e->getMessage()
            ], 500);
        }
    }

    public function checkIsolationStatus($customerId)
    {
        try {
            $customer = Customer::findOrFail($customerId);
            
            if (!$customer->pppoe_username) {
                return response()->json([
                    'isolated' => false,
                    'profile' => null
                ]);
            }
            
            $mikrotik = new \App\Services\MikroTikService();
            $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
            
            if (!$secret) {
                return response()->json([
                    'isolated' => false,
                    'profile' => null
                ]);
            }
            
            $isIsolated = strtolower($secret['profile']) === 'isolir';
            
            return response()->json([
                'isolated' => $isIsolated,
                'profile' => $secret['profile']
            ]);
            
        } catch (\Exception $e) {
            \Log::error('Failed to check isolation status', [
                'customer_id' => $customerId,
                'error' => $e->getMessage()
            ]);
            
            return response()->json([
                'isolated' => false,
                'profile' => null,
                'error' => $e->getMessage()
            ]);
        }
    }

    public function rejectPaymentApi($invoiceId)
    {
        $this->ensureCanConfirmPayments();

        $invoice = Invoice::findOrFail($invoiceId);
        $reason = request()->input('reason') ?: 'Bukti pembayaran Anda ditolak. Silakan upload ulang bukti pembayaran yang valid.';
        
        if ($invoice->bukti_pembayaran) {
            Storage::disk('public')->delete($invoice->bukti_pembayaran);
            $invoice->bukti_pembayaran = null;
        }
        
        $invoice->status = 'unpaid';
        $invoice->paid_at = null;
        $invoice->tolak_info = $reason;

        if (Schema::hasColumn('invoices', 'received_via_payment_method_id')) {
            $invoice->received_via_payment_method_id = null;
        }

        if (Schema::hasColumn('invoices', 'received_via_payment_receipt_option_id')) {
            $invoice->received_via_payment_receipt_option_id = null;
        }

        $invoice->save();
        $this->ledgerService->syncInvoicePayment($invoice, Auth::id());

        return response()->json(['message' => 'Pembayaran ditolak', 'data' => $invoice]);
    }
}
