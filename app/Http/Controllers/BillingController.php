<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\PaymentProofGuard;
use App\Jobs\ProcessBillingAutoInvoiceJob;
use App\Models\BillingAutoInvoiceJob;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\NotificationLog;
use App\Models\Package;
use App\Models\User;
use App\Models\FinancialTransaction;
use App\Services\BillingAutoInvoiceService;
use App\Services\BillingItemService;
use App\Services\BillingMessageTemplateService;
use App\Services\AuditLogService;
use App\Services\BorrowerLoanService;
use App\Services\FeatureService;
use App\Services\InvoiceWhatsAppService;
use App\Services\CustomerUsageSnapshotService;
use App\Services\FinancialLedgerService;
use App\Services\MikroTikService;
use App\Services\PaymentReceiverService;
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
use Illuminate\Validation\ValidationException;

class BillingController extends Controller
{
    use PaymentProofGuard;

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
        private BillingMessageTemplateService $billingMessageTemplateService,
        private CustomerUsageSnapshotService $customerUsageSnapshotService,
        private AuditLogService $auditLogService,
        private PaymentReceiverService $paymentReceiverService,
        private BorrowerLoanService $borrowerLoanService,
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
        $this->ensurePaymentProofUploadWithinPostLimit($request);
        $this->warnIfPaymentProofPayloadInvalid($request, $invoice, 'public');
        $this->ensurePaymentProofUploadIsValid($request);
        $this->ensureNonFilePaymentProofPayloadRejected($request);

        $validated = $request->validate([
            'paid_amount' => 'nullable|numeric|min:1',
            'bukti_pembayaran' => 'nullable|file|mimes:' . $this->paymentProofMimeList() . '|max:2048',
            'without_proof' => 'nullable|boolean',
        ]);

        $withoutProof = $request->boolean('without_proof');
        if (!$withoutProof && !$request->hasFile('bukti_pembayaran')) {
            throw ValidationException::withMessages([
                'bukti_pembayaran' => ['Bukti pembayaran wajib diupload, atau centang "Saya kirim tanpa bukti pembayaran".'],
            ]);
        }

        $paidAmount = $validated['paid_amount'] ?? null;
        if ($paidAmount && $paidAmount > 0) {
            $invoice->amount = $paidAmount;
        }

        // Handle upload bukti pembayaran (opsional)
        if ($request->hasFile('bukti_pembayaran')) {
            $file = $request->file('bukti_pembayaran');
            try {
                $path = $file->store('bukti_pembayaran', 'public');

                if (!$path || !Storage::disk('public')->exists($path)) {
                    Log::error('Gagal menyimpan bukti pembayaran ke disk public.', [
                        'invoice_id' => $invoice->id,
                        'customer_id' => $invoice->customer_id,
                        'user_id' => Auth::id(),
                        'file_name' => $file->getClientOriginalName(),
                        'file_size' => $file->getSize(),
                        'file_mime' => $file->getMimeType(),
                        'disk_root' => Storage::disk('public')->path(''),
                    ]);

                    throw ValidationException::withMessages([
                        'bukti_pembayaran' => ['Bukti pembayaran gagal disimpan di server. Silakan coba lagi.'],
                    ]);
                }

                $invoice->bukti_pembayaran = $path;
                $invoice->tolak_info = null; // reset info tolak jika ada upload baru
            } catch (ValidationException $e) {
                throw $e;
            } catch (\Throwable $e) {
                Log::error('Exception saat menyimpan bukti pembayaran ke disk public.', [
                    'invoice_id' => $invoice->id,
                    'customer_id' => $invoice->customer_id,
                    'user_id' => Auth::id(),
                    'file_name' => $file->getClientOriginalName(),
                    'file_size' => $file->getSize(),
                    'file_mime' => $file->getMimeType(),
                    'disk_root' => Storage::disk('public')->path(''),
                    'exception_class' => get_class($e),
                    'exception_message' => $e->getMessage(),
                ]);

                throw ValidationException::withMessages([
                    'bukti_pembayaran' => ['Bukti pembayaran gagal disimpan di server. Silakan coba lagi.'],
                ]);
            }
        }


        $responseMessage = 'Konfirmasi pembayaran berhasil dikirim.';

        // Jika admin (dari dashboard) konfirmasi, bisa kapan saja
        if ($this->canCurrentUserConfirmPayments()) {
            $invoice->status = 'paid';
            $invoice->paid_at = now();
            $invoice->tolak_info = null; // reset info tolak jika sudah dikonfirmasi
            if (Schema::hasColumn('invoices', 'include_in_mutation')) {
                $invoice->include_in_mutation = true;
            }
            if (Schema::hasColumn('invoices', 'payment_receiver_user_id')) {
                $invoice->payment_receiver_user_id = Auth::id();
            }

            try {
                $confirmationResult = $this->applyConfirmedPaymentEffects($invoice, now());
                $responseMessage = $confirmationResult['isolation_restored']
                    ? 'Pembayaran berhasil dikonfirmasi dan status isolir pelanggan dicabut.'
                    : 'Pembayaran berhasil dikonfirmasi.';
            } catch (\Throwable $e) {
                Log::error('Failed to finalize admin payment confirmation', [
                    'invoice_id' => $invoice->id,
                    'customer_id' => $invoice->customer_id,
                    'error' => $e->getMessage(),
                ]);

                if ($request->expectsJson() || $request->wantsJson() || $request->ajax()) {
                    return response()->json([
                        'message' => $e->getMessage() ?: 'Gagal memproses konfirmasi pembayaran.',
                    ], 422);
                }

                return back()->withErrors([
                    'payment' => $e->getMessage() ?: 'Gagal memproses konfirmasi pembayaran.',
                ])->withInput();
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
        $this->appendPaymentProofAttributes($invoice);
        $this->sendAutoPaymentConfirmationIfEligible($invoice);

        // Pipe into Payment Verification AI pipeline
        if ($invoice->status !== 'paid' && $invoice->bukti_pembayaran) {
            try {
                $capture = \App\Models\BillingPaymentCapture::create([
                    'source' => 'web_public',
                    'invoice_id' => $invoice->id,
                    'customer_id' => $invoice->customer_id,
                    'amount' => (float) $invoice->amount,
                    'paid_date' => now()->toDateString(),
                    'reference_code' => $invoice->invoice_link,
                    'fingerprint' => hash('sha256', 'web_public:' . $invoice->id . ':' . $invoice->bukti_pembayaran . ':' . microtime(true)),
                    'match_status' => 'pending',
                    'meta' => [
                        'media' => [
                            'path' => $invoice->bukti_pembayaran,
                            'mime_type' => isset($file) ? $file->getMimeType() : 'image/jpeg',
                            'file_name' => isset($file) ? $file->getClientOriginalName() : basename($invoice->bukti_pembayaran),
                        ],
                        'source' => [
                            'type' => 'web_public_invoice',
                            'invoice_link' => $invoice->invoice_link,
                            'customer_name' => $invoice->customer?->name,
                            'customer_phone' => $invoice->customer?->phone,
                        ],
                    ],
                ]);

                \App\Jobs\AnalyzeWhatsAppPaymentCaptureJob::dispatch($capture->id);
            } catch (\Throwable $captureEx) {
                Log::warning('Failed to dispatch payment capture for web confirmation', [
                    'invoice_id' => $invoice->id,
                    'error' => $captureEx->getMessage(),
                ]);
            }
        }

        if ($request->expectsJson() || $request->wantsJson() || $request->ajax()) {
            return response()->json([
                'message' => $responseMessage,
                'data' => $invoice,
            ]);
        }

        // Redirect sesuai asal request
        if ($this->canCurrentUserConfirmPayments()) {
            return redirect()->route('billing.index')->with('success', $responseMessage);
        }
        $invoice_link = $invoice->invoice_link;
        return redirect()->route('invoice.show', $invoice_link)->with('success', $responseMessage);
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
                $template = $this->buildInvoiceMessage($customer, $existingLink, (float) $existingOpenInvoice->amount);

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
            $template = $this->buildInvoiceMessage($customer, $link, (float) $invoice->amount);

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
        $pendingConfirmationInvoiceMap = [];
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

            $pendingConfirmationInvoices = Invoice::query()
                ->whereIn('customer_id', $customerIds)
                ->where('status', 'menunggu konfirmasi')
                ->orderByDesc('id')
                ->get()
                ->groupBy('customer_id');

            foreach ($pendingConfirmationInvoices as $customerId => $invoices) {
                $latestPendingInvoice = null;
                $pendingInvoiceWithProof = null;

                foreach ($invoices as $pendingInvoice) {
                    $latestPendingInvoice ??= $pendingInvoice;

                    $normalizedPath = $this->normalizePaymentProofPath($pendingInvoice->bukti_pembayaran);
                    if ($normalizedPath !== null && Storage::disk('public')->exists($normalizedPath)) {
                        $pendingInvoiceWithProof = $pendingInvoice;
                        break;
                    }
                }

                $pendingConfirmationInvoiceMap[(int) $customerId] = $pendingInvoiceWithProof ?: $latestPendingInvoice;
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
            $pendingConfirmationInvoice = $pendingConfirmationInvoiceMap[(int) $customer->id] ?? null;

            $this->appendPaymentProofAttributes($latestInvoice);
            $this->appendPaymentProofAttributes($activeInvoice);
            $this->appendPaymentProofAttributes($pendingConfirmationInvoice);

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
                'pending_confirmation_invoice' => $pendingConfirmationInvoice,
                'has_active_invoice' => $hasActiveInvoice,
                'can_create_invoice' => $canCreateInvoice,
                'has_paid_this_month' => $hasPaidThisMonth,
            ];
            
            // Pelanggan yang sudah bayar tetap ditampilkan saat memasuki periode hampir jatuh tempo.
            if ($latestInvoiceStatus === 'paid' && !$pendingConfirmationInvoice && !$isLate && !$isAlmostLate) {
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

    public function paymentProofPreview(Invoice $invoice)
    {
        $this->warnIfPublicStorageLinkMissing();

        $normalizedPath = $this->normalizePaymentProofPath($invoice->bukti_pembayaran);
        if ($normalizedPath === null) {
            return response()->json([
                'message' => 'Path bukti pembayaran tidak valid.',
            ], 404);
        }

        if (!Storage::disk('public')->exists($normalizedPath)) {
            return response()->json([
                'message' => 'File bukti pembayaran tidak ditemukan di penyimpanan.',
            ], 404);
        }

        $mimeType = Storage::disk('public')->mimeType($normalizedPath) ?: 'application/octet-stream';
        if (!str_starts_with(strtolower($mimeType), 'image/')) {
            return response()->json([
                'message' => 'File bukti pembayaran bukan gambar yang bisa dipreview.',
            ], 422);
        }

        $content = Storage::disk('public')->get($normalizedPath);

        return response()->json([
            'data' => [
                'data_url' => 'data:' . $mimeType . ';base64,' . base64_encode($content),
                'mime_type' => $mimeType,
                'file_name' => basename($normalizedPath),
            ],
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

    public function updateCustomerAutomationApi(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'billing_auto_disabled' => ['required', 'boolean'],
        ]);

        $customer->billing_auto_disabled = (bool) $validated['billing_auto_disabled'];
        $customer->save();

        return response()->json([
            'message' => $customer->billing_auto_disabled
                ? 'Tindakan otomatis penagihan dinonaktifkan untuk pelanggan ini.'
                : 'Tindakan otomatis penagihan diaktifkan kembali untuk pelanggan ini.',
            'data' => [
                'customer_id' => $customer->id,
                'billing_auto_disabled' => (bool) $customer->billing_auto_disabled,
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
        $dueDate = $customer->due_date
            ? Carbon::parse($customer->due_date)->format('d/m/Y')
            : '-';

        return $this->billingMessageTemplateService->buildBillingReminderMessage(
            $customer,
            $invoiceUrl,
            $amount,
            $dueDate,
            false
        );
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
            $meta = array_merge([
                'channel' => 'whatsapp',
            ], $meta);

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

    private function sendAutoPaymentConfirmationIfEligible(Invoice $invoice): void
    {
        if (strtolower((string) $invoice->status) !== 'paid') {
            return;
        }

        $customer = $invoice->customer()->first();
        if (!$customer || !$this->isValidPhone($customer->phone)) {
            return;
        }

        if ((bool) ($customer->billing_auto_disabled ?? false)) {
            return;
        }

        $message = $this->billingMessageTemplateService->buildPaymentConfirmationMessage($customer, true);

        [$success, $error] = $this->sendInvoiceViaWhatsAppGateway($customer, $message);
        $this->logBillingNotification(
            $customer->id,
            $customer->phone,
            $message,
            $success ? 'sent' : 'failed',
            $error,
            [
                'type' => 'billing_auto_payment_confirm',
                'invoice_id' => $invoice->id,
                'invoice_link' => $invoice->invoice_link,
                'is_auto' => true,
            ]
        );
    }

    private function computeNextDueDateFromCustomer(Customer $customer): string
    {
        if (!empty($customer->due_date)) {
            return Carbon::parse($customer->due_date)->startOfDay()->addDays(30)->toDateString();
        }

        return now()->startOfDay()->addDays(30)->toDateString();
    }

    private function computeConfirmedDueDate(Customer $customer, bool $isIsolated, Carbon $confirmedAt): string
    {
        if ($isIsolated) {
            return $confirmedAt->copy()->startOfDay()->addDays(30)->toDateString();
        }

        if (!empty($customer->due_date)) {
            return Carbon::parse((string) $customer->due_date)->startOfDay()->addDays(30)->toDateString();
        }

        return $confirmedAt->copy()->startOfDay()->addDays(30)->toDateString();
    }

    private function resolveCustomerTargetProfile(Customer $customer): string
    {
        $storedRestoreProfile = trim((string) ($customer->isolation_restore_profile ?? ''));
        if ($storedRestoreProfile !== '') {
            return $storedRestoreProfile;
        }

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

    private function makeMikroTik(): MikroTikService
    {
        return app(MikroTikService::class);
    }

    private function isCustomerCurrentlyIsolated(Customer $customer, ?array $secret = null): bool
    {
        if ((bool) ($customer->is_service_isolated ?? false)) {
            return true;
        }

        return strtolower(trim((string) ($secret['profile'] ?? ''))) === 'isolir';
    }

    /**
     * @return array{isolation_restored: bool, restored_profile: string|null, is_isolated: bool, isolation_restore_failed: bool, isolation_restore_error: string|null}
     */
    private function applyConfirmedPaymentEffects(Invoice $invoice, Carbon $confirmedAt): array
    {
        $customer = $invoice->customer;
        if (!$customer) {
            return [
                'isolation_restored' => false,
                'restored_profile' => null,
                'is_isolated' => false,
                'isolation_restore_failed' => false,
                'isolation_restore_error' => null,
            ];
        }

        $secret = null;
        $mikrotik = null;
        $isolationRestored = false;
        $restoredProfile = null;
        $isolationRestoreFailed = false;
        $isolationRestoreError = null;

        if ($customer->pppoe_username) {
            $mikrotik = $this->makeMikroTik();

            try {
                $mikrotik->connect();
            } catch (\Throwable $e) {
                Log::warning('Failed to connect MikroTik before payment confirmation check', [
                    'username' => $customer->pppoe_username,
                    'error' => $e->getMessage(),
                ]);
            }

            try {
                $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
            } catch (\Throwable $e) {
                Log::warning('Failed to inspect PPP secret while confirming payment', [
                    'username' => $customer->pppoe_username,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $isCurrentlyIsolated = $this->isCustomerCurrentlyIsolated($customer, $secret);
        $customer->due_date = $this->computeConfirmedDueDate($customer, $isCurrentlyIsolated, $confirmedAt);

        $markRestoreFailure = function (?string $targetProfile, string $error) use (
            $customer,
            $invoice,
            $confirmedAt,
            &$isolationRestoreFailed,
            &$isolationRestoreError
        ): void {
            $isolationRestoreFailed = true;
            $isolationRestoreError = $error ?: 'Gagal mencabut isolir pelanggan dari MikroTik.';

            Log::error('Failed to restore isolated user after payment confirmation', [
                'invoice_id' => $invoice->id,
                'customer_id' => $customer->id,
                'username' => $customer->pppoe_username,
                'target_profile' => $targetProfile,
                'error' => $isolationRestoreError,
            ]);

            $this->auditLogService->log('billing.customer_unisolation_failed_after_payment', $customer, [
                'customer_id' => $customer->id,
                'invoice_id' => $invoice->id,
                'pppoe_username' => $customer->pppoe_username,
                'target_profile' => $targetProfile,
                'error' => $isolationRestoreError,
                'confirmed_at' => $confirmedAt->toIso8601String(),
            ], Auth::id());
        };

        if ($isCurrentlyIsolated) {
            $targetProfile = $this->resolveCustomerTargetProfile($customer);

            if (!$customer->pppoe_username) {
                $markRestoreFailure($targetProfile, 'Pelanggan sedang isolir tetapi tidak memiliki username PPPoE untuk dipulihkan.');
            } else {
                $mikrotik ??= $this->makeMikroTik();

                try {
                    $profiles = $mikrotik->command('/ppp/profile/print');
                    $availableProfiles = array_map(fn ($p) => $p['name'] ?? '', $profiles);
                    $resolvedProfile = $this->resolveBestMatchingProfile($targetProfile, $availableProfiles);
                    if ($resolvedProfile !== null) {
                        $targetProfile = $resolvedProfile;
                    }
                } catch (\Throwable $profileErr) {
                    Log::warning('Could not validate profile list while restoring isolated user', [
                        'username' => $customer->pppoe_username,
                        'target_profile' => $targetProfile,
                        'error' => $profileErr->getMessage(),
                    ]);
                }

                try {
                    $mikrotik->unrestrictUser($customer->pppoe_username, $targetProfile);

                    $customer->is_service_isolated = false;
                    $customer->service_isolated_at = null;
                    $customer->service_isolated_by = null;
                    $customer->isolation_restore_profile = null;

                    $isolationRestored = true;
                    $restoredProfile = $targetProfile;

                    $this->auditLogService->log('billing.customer_unisolated_after_payment', $customer, [
                        'customer_id' => $customer->id,
                        'invoice_id' => $invoice->id,
                        'pppoe_username' => $customer->pppoe_username,
                        'restored_profile' => $targetProfile,
                        'confirmed_at' => $confirmedAt->toIso8601String(),
                    ], Auth::id());

                    Log::info('User restored from isolation after payment confirmation', [
                        'username' => $customer->pppoe_username,
                        'restored_profile' => $targetProfile,
                        'new_due_date' => $customer->due_date,
                    ]);
                } catch (\Throwable $restoreErr) {
                    $markRestoreFailure(
                        $targetProfile,
                        $restoreErr->getMessage() ?: 'Gagal mencabut isolir pelanggan dari MikroTik.'
                    );
                }
            }
        }

        $customer->save();
        $this->customerUsageSnapshotService->resetPeriodByCustomerId((int) $customer->id);

        if ($mikrotik) {
            try {
                $mikrotik->disconnect();
            } catch (\Throwable $e) {
                Log::warning('Failed to disconnect MikroTik after payment confirmation', [
                    'username' => $customer->pppoe_username,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return [
            'isolation_restored' => $isolationRestored,
            'restored_profile' => $restoredProfile,
            'is_isolated' => $isCurrentlyIsolated,
            'isolation_restore_failed' => $isolationRestoreFailed,
            'isolation_restore_error' => $isolationRestoreError,
        ];
    }

    private function getBulkIsolationStatus($lateCustomers)
    {
        $statusMap = [];
        foreach ($lateCustomers as $item) {
            $customer = $item['customer'];
            $statusMap[$customer->id] = [
                'isolated' => (bool) ($customer->is_service_isolated ?? false),
                'profile' => (bool) ($customer->is_service_isolated ?? false) ? 'Isolir' : null,
            ];
        }

        try {
            // Get all isolated secrets in ONE cached MikroTik call
            $isolatedUsernames = Cache::remember('mikrotik:isolated_usernames_profile_map', 60, function () {
                $mikrotik = $this->makeMikroTik();
                $isolatedSecrets = $mikrotik->getIsolatedSecrets();

                $map = [];
                foreach ($isolatedSecrets as $secret) {
                    $username = strtolower(trim((string) ($secret['name'] ?? '')));
                    if ($username !== '') {
                        $map[$username] = $secret['profile'] ?? 'isolir';
                    }
                }

                return $map;
            });
            
            // Build isolation status map by customer ID
            foreach ($lateCustomers as $item) {
                $customer = $item['customer'];
                $username = strtolower(trim((string) ($customer->pppoe_username ?? '')));
                $statusMap[$customer->id] = [
                    'isolated' => $username !== '' && isset($isolatedUsernames[$username])
                        ? true
                        : (bool) ($customer->is_service_isolated ?? false),
                    'profile' => ($username !== '' && isset($isolatedUsernames[$username]))
                        ? $isolatedUsernames[$username]
                        : ((bool) ($customer->is_service_isolated ?? false) ? 'Isolir' : null),
                ];
            }
            
            return $statusMap;
        } catch (\Exception $e) {
            \Log::error('Failed to get bulk isolation status: ' . $e->getMessage());
            return $statusMap;
        }
    }

    public function showInvoiceApi($invoice_link)
    {
        $invoice = \App\Models\Invoice::where('invoice_link', $invoice_link)->with(['customer', 'items'])->firstOrFail();
        $this->appendPaymentProofAttributes($invoice);

        return response()->json([
            'data' => $invoice,
            'breakdown' => [
                'total' => (float) $invoice->amount,
                'items_count' => $invoice->items->count(),
            ],
        ]);
    }

    public function confirmPaymentApi(Request $request, $invoiceId)
    {
        $this->ensureCanConfirmPayments();

        $rules = [
            'paid_amount' => 'nullable|numeric|min:1',
            'payment_receipt_option_id' => 'nullable',
            'payment_method_id' => 'nullable',
            'include_in_mutation' => 'nullable|boolean',
            'payment_receiver_user_id' => 'nullable',
            'other_receiver_confirmed' => 'nullable|boolean',
            'receiver_conflict_resolution' => 'nullable|in:debt,approval',
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

        if (Schema::hasTable('users')) {
            $rules['payment_receiver_user_id'] = [
                'nullable',
                'integer',
                Rule::exists('users', 'id'),
            ];
        }

        $validated = $request->validate($rules);

        $invoice = Invoice::findOrFail($invoiceId);
        $paidAmount = $validated['paid_amount'] ?? null;
        $paymentReceiptOptionId = $validated['payment_receipt_option_id'] ?? null;
        $paymentMethodId = $validated['payment_method_id'] ?? null;
        $includeInMutation = Auth::user()?->canChoosePaymentMutation()
            ? (bool) ($validated['include_in_mutation'] ?? true)
            : true;
        $paymentReceiverUserId = Auth::user()?->canChoosePaymentReceiver()
            ? (int) ($validated['payment_receiver_user_id'] ?? Auth::id())
            : Auth::id();
        $currentUser = $request->user();
        $selectedReceiver = $paymentReceiverUserId ? User::query()->find($paymentReceiverUserId) : null;
        $actorIsCompanyFinance = $this->paymentReceiverService->isCompanyFinanceReceiver($currentUser?->id);
        $selectedReceiverIsCompanyFinance = $selectedReceiver
            ? $this->paymentReceiverService->isCompanyFinanceReceiver($selectedReceiver->id)
            : false;
        $selfReceiver = $selectedReceiver && $currentUser && $selectedReceiver->id === $currentUser->id;
        $nonCompanySelfConfirmDebt = $selfReceiver && !$actorIsCompanyFinance;
        $selectingAnotherReceiver = $selectedReceiver && $currentUser && $selectedReceiver->id !== $currentUser->id;
        $needsOtherReceiverConfirmation = $selectingAnotherReceiver && !$selectedReceiverIsCompanyFinance;
        $otherReceiverConfirmed = (bool) ($validated['other_receiver_confirmed'] ?? false);
        $receiverConflictResolution = $validated['receiver_conflict_resolution'] ?? null;

        if ($includeInMutation && $needsOtherReceiverConfirmation && !$otherReceiverConfirmed) {
            return response()->json([
                'message' => 'Anda memilih akun penerima selain akun sendiri. Konfirmasi ulang untuk melanjutkan.',
                'action_required' => 'confirm_other_receiver',
            ], 422);
        }

        $isAllowedReceiver = $this->paymentReceiverService->isAllowedReceiver($currentUser, $paymentReceiverUserId);
        $shouldCreatePendingApproval = $includeInMutation && $selectingAnotherReceiver && $isAllowedReceiver;
        $borrower = null;

        if (!$includeInMutation) {
            $nonCompanySelfConfirmDebt = false;
            $receiverConflictResolution = null;
        } elseif ($nonCompanySelfConfirmDebt && $currentUser) {
            $borrower = $this->borrowerLoanService->getOrCreateBorrowerForUser($currentUser);
            $includeInMutation = true;
        } elseif ($shouldCreatePendingApproval && $receiverConflictResolution === 'debt') {
            try {
                $borrower = $this->borrowerLoanService->requireBorrowerForUser($currentUser);
            } catch (\RuntimeException $e) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'action_required' => 'borrower_mapping_required',
                ], 422);
            }

            $includeInMutation = true;
        } elseif ($shouldCreatePendingApproval) {
            try {
                $borrower = $this->borrowerLoanService->requireBorrowerForUser($currentUser);
            } catch (\RuntimeException $e) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'action_required' => 'borrower_mapping_required',
                ], 422);
            }

            $includeInMutation = true;
        } elseif (!$isAllowedReceiver) {
            try {
                $borrower = $this->borrowerLoanService->requireBorrowerForUser($currentUser);
            } catch (\RuntimeException $e) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'action_required' => 'borrower_mapping_required',
                ], 422);
            }

            if (!$receiverConflictResolution) {
                return response()->json([
                'message' => 'Akun penerima yang dipilih tidak termasuk mapping yang diizinkan. Pilih masukkan ke hutang atau kirim approval ke akun penerima.',
                    'action_required' => 'resolve_invalid_receiver',
                ], 422);
            }

            $includeInMutation = true;
        }
        
        if ($paidAmount && $paidAmount > 0) {
            $invoice->amount = $paidAmount;
        }

        if (Schema::hasColumn('invoices', 'received_via_payment_method_id')) {
            $invoice->received_via_payment_method_id = $paymentMethodId;
        }

        if (Schema::hasColumn('invoices', 'received_via_payment_receipt_option_id')) {
            $invoice->received_via_payment_receipt_option_id = $paymentReceiptOptionId;
        }

        if (Schema::hasColumn('invoices', 'include_in_mutation')) {
            $invoice->include_in_mutation = $includeInMutation;
        }

        if (Schema::hasColumn('invoices', 'payment_receiver_user_id')) {
            $invoice->payment_receiver_user_id = $paymentReceiverUserId ?: Auth::id();
        }

        $invoice->status = 'paid';
        $invoice->paid_at = now();
        $invoice->tolak_info = null;

        $confirmationResult = $this->applyConfirmedPaymentEffects($invoice, now());
        $mutationStatus = FinancialTransaction::STATUS_CONFIRMED;
        if (!$includeInMutation) {
            $mutationStatus = FinancialTransaction::STATUS_CONFIRMED;
        } elseif ($nonCompanySelfConfirmDebt) {
            $mutationStatus = FinancialTransaction::STATUS_CONFIRMED;
        } elseif ($shouldCreatePendingApproval && $receiverConflictResolution !== 'debt') {
            $mutationStatus = FinancialTransaction::STATUS_PENDING;
        } elseif (!$isAllowedReceiver && $receiverConflictResolution === 'approval') {
            $mutationStatus = FinancialTransaction::STATUS_PENDING;
        } elseif (($shouldCreatePendingApproval && $receiverConflictResolution === 'debt') || (!$isAllowedReceiver && $receiverConflictResolution === 'debt')) {
            $mutationStatus = FinancialTransaction::STATUS_REJECTED;
        }

        $invoice->save();
        $mutation = $this->ledgerService->syncInvoicePayment($invoice, Auth::id(), $mutationStatus);
        $invoice->loadMissing('receivedViaPaymentMethod');
        $invoice->loadMissing('receivedViaPaymentReceiptOption');
        $invoice->loadMissing('paymentReceiver');

        if (!$includeInMutation) {
            // Invoice paid intentionally bypasses mutation, approval, and borrower debt effects.
        } elseif ($nonCompanySelfConfirmDebt && $borrower) {
            $this->borrowerLoanService->createDirectDebt(
                $borrower,
                $invoice,
                $currentUser,
                $selectedReceiver,
                $selectedReceiver,
                'Pembayaran self-confirm oleh akun non-keuangan perusahaan otomatis dimasukkan ke hutang.',
            );
        } elseif (($shouldCreatePendingApproval && $receiverConflictResolution === 'debt') && $borrower) {
            $this->borrowerLoanService->createDirectDebt(
                $borrower,
                $invoice,
                $currentUser,
                $selectedReceiver,
                $selectedReceiver,
                'Pembayaran diarahkan langsung menjadi hutang tanpa menunggu approval penerima.'
            );
        } elseif ($shouldCreatePendingApproval && $selectedReceiver && $mutation && $borrower) {
            $this->borrowerLoanService->createApprovalRequest(
                $borrower,
                $invoice,
                $currentUser,
                $selectedReceiver,
                $mutation
            );
        } elseif (!$isAllowedReceiver && $borrower) {
            if ($receiverConflictResolution === 'debt') {
                $this->borrowerLoanService->createDirectDebt(
                    $borrower,
                    $invoice,
                    $currentUser,
                    $selectedReceiver,
                    $selectedReceiver
                );
            } elseif ($receiverConflictResolution === 'approval' && $selectedReceiver) {
                $this->borrowerLoanService->createApprovalRequest(
                    $borrower,
                    $invoice,
                    $currentUser,
                    $selectedReceiver,
                    $mutation
                );
            }
        }

        $this->sendAutoPaymentConfirmationIfEligible($invoice);

        $message = 'Pembayaran berhasil dikonfirmasi';
        if (!$includeInMutation) {
            $message = 'Pembayaran pelanggan sudah lunas tanpa masuk mutasi dan tanpa hutang penerima.';
        } elseif ($confirmationResult['isolation_restored']) {
            $message = 'Pembayaran berhasil dikonfirmasi dan status isolir pelanggan dicabut.';
        } elseif ($confirmationResult['isolation_restore_failed']) {
            $message = 'Pembayaran berhasil dikonfirmasi, tetapi status isolir belum bisa dicabut otomatis: '
                . ($confirmationResult['isolation_restore_error'] ?: 'silakan cek layanan/PPPoE pelanggan secara manual.');
        } elseif ($nonCompanySelfConfirmDebt) {
            $message = 'Pembayaran pelanggan sudah lunas, mutasi tetap tercatat, dan otomatis dimasukkan ke hutang akun pengkonfirmasi.';
        } elseif ($shouldCreatePendingApproval && $receiverConflictResolution !== 'debt') {
            $message = $selectedReceiverIsCompanyFinance
                ? 'Pembayaran pelanggan sudah lunas dan mutasi menunggu persetujuan akun keuangan perusahaan.'
                : 'Pembayaran pelanggan sudah lunas dan mutasi menunggu persetujuan akun penerima.';
        } elseif ($shouldCreatePendingApproval && $receiverConflictResolution === 'debt') {
            $message = 'Pembayaran pelanggan sudah lunas dan langsung dimasukkan ke hutang akun pengkonfirmasi.';
        } elseif (!$isAllowedReceiver && $receiverConflictResolution === 'debt') {
            $message = 'Pembayaran berhasil dikonfirmasi, mutasi tidak masuk saldo, dan dimasukkan ke hutang akun pengkonfirmasi.';
        } elseif (!$isAllowedReceiver && $receiverConflictResolution === 'approval') {
            $message = $selectedReceiverIsCompanyFinance
                ? 'Pembayaran berhasil dikonfirmasi dan mutasi menunggu persetujuan akun keuangan perusahaan.'
                : 'Pembayaran berhasil dikonfirmasi dan mutasi menunggu persetujuan akun penerima.';
        }

        return response()->json([
            'message' => $message,
            'data' => $invoice,
        ]);
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

    public function sendInvoiceManagementWhatsApp(
        Invoice $invoice,
        InvoiceWhatsAppService $whatsAppService
    ) {
        $invoice->load('customer:id,name,pppoe_username,phone,address,package_type,installation_fee,package_id');
        $result = $whatsAppService->send($invoice);

        return response()->json([
            'success' => $result['success'],
            'message' => $result['success']
                ? 'Invoice PDF berhasil dikirim melalui WhatsApp.'
                : 'Invoice PDF gagal dikirim melalui WhatsApp.',
            'result' => $result,
            'data' => $invoice->fresh(['customer:id,name,pppoe_username,phone']),
        ], $result['success'] ? 200 : 422);
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
            
            $mikrotik = $this->makeMikroTik();
            
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
            
            $result = DB::transaction(function () use ($customer, $currentProfile, $mikrotik) {
                $customer->is_service_isolated = true;
                $customer->service_isolated_at = now();
                $customer->service_isolated_by = Auth::id();
                $customer->isolation_restore_profile = $currentProfile;
                $customer->save();

                Log::info('Saving isolation metadata before isolation', [
                    'customer_id' => $customer->id,
                    'username' => $customer->pppoe_username,
                    'original_profile' => $currentProfile,
                ]);

                $result = $mikrotik->isolateUser($customer->pppoe_username);

                $this->auditLogService->log('billing.customer_isolated', $customer, [
                    'customer_id' => $customer->id,
                    'pppoe_username' => $customer->pppoe_username,
                    'saved_profile' => $currentProfile,
                    'isolated_at' => now()->toIso8601String(),
                ], Auth::id());

                return $result;
            });
            
            return response()->json([
                'success' => true,
                'message' => 'Pelanggan ' . $customer->name . ' berhasil diisolir, koneksi aktif diputus, dan status isolir tersimpan.',
                'data' => array_merge($result, [
                    'saved_profile' => $currentProfile,
                    'customer_name' => $customer->name,
                    'local_isolation_saved' => true,
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
                    'isolated' => (bool) ($customer->is_service_isolated ?? false),
                    'profile' => (bool) ($customer->is_service_isolated ?? false) ? 'Isolir' : null,
                ]);
            }
            
            $mikrotik = $this->makeMikroTik();
            $secret = $mikrotik->getPPPoESecret($customer->pppoe_username);
            
            if (!$secret) {
                return response()->json([
                    'isolated' => (bool) ($customer->is_service_isolated ?? false),
                    'profile' => (bool) ($customer->is_service_isolated ?? false) ? 'Isolir' : null,
                ]);
            }
            
            $isIsolated = $this->isCustomerCurrentlyIsolated($customer, $secret);
            
            return response()->json([
                'isolated' => $isIsolated,
                'profile' => $secret['profile'] ?? ($isIsolated ? 'Isolir' : null),
            ]);
            
        } catch (\Exception $e) {
            \Log::error('Failed to check isolation status', [
                'customer_id' => $customerId,
                'error' => $e->getMessage()
            ]);

            $customer = Customer::find($customerId);
            $fallbackIsolated = (bool) ($customer?->is_service_isolated ?? false);
            
            return response()->json([
                'isolated' => $fallbackIsolated,
                'profile' => $fallbackIsolated ? 'Isolir' : null,
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
