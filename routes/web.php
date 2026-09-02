
<?php
use App\Http\Controllers\CustomerController;

use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\InvoiceDocumentController;
use App\Http\Controllers\OdpController;
use App\Http\Controllers\PengeluaranController;
use App\Http\Controllers\PaymentMethodController;
use App\Http\Controllers\ExpenseCategoryController;
use App\Http\Controllers\PaymentReceiptOptionController;
use App\Http\Controllers\LandingPageController;
use App\Http\Controllers\PromoController;
use App\Http\Controllers\CustomerAuthController;
use App\Http\Controllers\ComplaintController;
use App\Http\Controllers\CompanyFinanceReceiverController;
use App\Http\Controllers\NetworkNoticeController;
use App\Http\Controllers\MonitoringController;
use App\Http\Controllers\MonitoringMapsController;
use App\Http\Controllers\IsolirController;
use App\Http\Controllers\PayrollController;
use App\Http\Controllers\WhatsAppController;
use App\Http\Controllers\PackageController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\FinancialTransactionController;
use App\Http\Controllers\DistributionRouteController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\MasterWilayahController;
use App\Http\Controllers\MasterMikrotikController;
use App\Http\Controllers\CustomerMobilePasswordController;
use App\Http\Controllers\CustomerBillingProfileController;
use App\Http\Controllers\InstallationWorkflowController;
use App\Http\Controllers\InvoiceItemController;
use App\Http\Controllers\InstallationPricingController;
use App\Http\Controllers\NetworkIncidentController;
use App\Http\Controllers\OdpMappingController;
use App\Http\Controllers\PackagePriceHistoryController;
use App\Http\Controllers\AccessControlController;
use App\Http\Controllers\BillingAutomationController;
use App\Http\Controllers\BorrowerController;
use App\Http\Controllers\BorrowerLoanController;
use App\Http\Controllers\CustomerPackageManagementController;
use App\Http\Controllers\CustomerPackageMigrationController;
use App\Http\Controllers\CustomerAccountMappingController;
use App\Http\Controllers\PaymentReceiverApprovalController;
use App\Http\Controllers\PaymentReceiverMappingController;
use App\Http\Controllers\SystemHealthController;
use App\Http\Controllers\CustomerAgreementController;
use App\Http\Controllers\CustomerTerminationController;
use App\Http\Controllers\CustomerWifiController;
use App\Http\Controllers\CustomerWifiLinkMasterController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ProjectReportController;
use App\Http\Controllers\MonthlyBudgetController;
use App\Http\Controllers\CashObligationCalendarController;
use App\Http\Controllers\ReconciliationCenterController;
use App\Http\Controllers\WhatsAppPaymentWebhookController;
use App\Http\Controllers\GenieAcsMonitoringController;
use App\Models\User;
use App\Services\PaymentReceiverService;

// Root domain dinonaktifkan untuk landing page publik.
Route::get('/', function () {
    return redirect()->route('customer.login');
})->name('landing');

// Network Status Page (Public - tanpa login)
Route::get('/status-jaringan', function () {
    return view('app');
})->name('network.status');

// Invoice Page (Public - tanpa login, untuk pelanggan bayar tagihan)
Route::get('/invoice/{invoice_link}', function () {
    return view('app');
})->name('invoice.show');

// Public Customer Self-Service Portal (Tanpa Login via Public Token)
Route::get('/portal-pelanggan/{token}', function () {
    return view('app');
})->name('customer.public-portal');

Route::get('/portal_pelanggan/{token}', function () {
    return view('app');
})->name('customer.public-portal.alias');

// Route publik untuk akses invoice tanpa login
Route::get('/api/invoice/{invoice_link}', [BillingController::class, 'showInvoiceApi'])->name('api.invoice.show');
Route::get('/invoice/{invoice_link}/print', [InvoiceDocumentController::class, 'showPrint'])->name('invoice.public.print');
Route::get('/invoice-documents/{token}/download', [InvoiceDocumentController::class, 'download'])->name('invoice-documents.public.download');
Route::get('/invoice-documents/{token}/verify', [InvoiceDocumentController::class, 'verify'])->name('invoice-documents.public.verify');
Route::post('/invoice/{invoice}/konfirmasi', [\App\Http\Controllers\BillingController::class, 'confirmPayment'])->name('invoice.confirm-payment');

// Public Customer Self-Service Portal API (Tanpa Login)
Route::get('/api/public/portal/{token}', [\App\Http\Controllers\CustomerPublicPortalController::class, 'show'])->name('api.public.portal.show');
Route::post('/api/public/portal/{token}/wifi', [\App\Http\Controllers\CustomerPublicPortalController::class, 'updateWifi'])->name('api.public.portal.wifi.update');
Route::post('/api/public/portal/{token}/block-device', [\App\Http\Controllers\CustomerPublicPortalController::class, 'blockDevice'])->name('api.public.portal.device.block');
Route::post('/api/public/portal/{token}/unblock-device', [\App\Http\Controllers\CustomerPublicPortalController::class, 'unblockDevice'])->name('api.public.portal.device.unblock');
Route::post('/api/public/portal/{token}/complaints', [\App\Http\Controllers\CustomerPublicPortalController::class, 'storeComplaint'])->name('api.public.portal.complaint.store');

// Public payment methods API (for invoice page)
Route::get('/api/payment-methods/active', [PaymentMethodController::class, 'activeList'])->name('api.payment-methods.active');

// Public Customer Prospect Registration (Tanpa Login)
Route::get('/registrasi', fn() => view('app'))->name('public.register');
Route::get('/daftar', fn() => view('app'))->name('public.register.alias');
Route::post('/api/public/register-prospect', [\App\Http\Controllers\CustomerProspectController::class, 'publicStore'])->name('api.public.register-prospect');
Route::get('/api/public/wilayah/kecamatan', [\App\Http\Controllers\MasterWilayahController::class, 'kecamatanOptions'])->name('api.public.wilayah.kecamatan');
Route::get('/api/public/wilayah/desa', [\App\Http\Controllers\MasterWilayahController::class, 'desaOptions'])->name('api.public.wilayah.desa');
Route::get('/api/public/wilayah/dusun', [\App\Http\Controllers\MasterWilayahController::class, 'dusunOptions'])->name('api.public.wilayah.dusun');
Route::get('/api/public/packages', [\App\Http\Controllers\PackageController::class, 'publicPackages'])->name('api.public.packages');

// Landing Page Public API
Route::get('/api/landing-page', [LandingPageController::class, 'getData'])->name('api.landing-page');

// Public Network Notices API (for landing page - mass disruptions & maintenance only)
Route::get('/api/network-notices/public', [NetworkNoticeController::class, 'publicNotices'])->name('api.network-notices.public');

// Public customer agreement verification/download.
Route::get('/contracts/{token}/verify', [CustomerAgreementController::class, 'publicVerify'])->name('contracts.public.verify');
Route::get('/contracts/{token}/download', [CustomerAgreementController::class, 'publicDownload'])->name('contracts.public.download');
Route::get('/terminations/{token}/verify', [CustomerTerminationController::class, 'publicVerify'])->name('terminations.public.verify');
Route::get('/terminations/{token}/download', [CustomerTerminationController::class, 'publicDownload'])->name('terminations.public.download');

// Customer Network Notices API (for customer portal - all relevant notices)
Route::get('/api/network-notices/customer', [NetworkNoticeController::class, 'customerNotices'])->name('api.network-notices.customer');

// Customer Portal API (Public)
Route::post('/api/customer/login', [CustomerAuthController::class, 'login'])->middleware('throttle:customer-portal-login')->name('api.customer.login');
Route::post('/api/customer/logout', [CustomerAuthController::class, 'logout'])->name('api.customer.logout');
Route::get('/api/customer/check', [CustomerAuthController::class, 'check'])->name('api.customer.check');
Route::get('/api/customer/dashboard', [CustomerAuthController::class, 'dashboard'])->name('api.customer.dashboard');
Route::post('/api/customer/complaint', [CustomerAuthController::class, 'submitComplaint'])->name('api.customer.complaint');
Route::get('/api/customer/tickets/{complaint}', [CustomerAuthController::class, 'ticket'])->name('api.customer.tickets.show');
Route::post('/api/customer/network-notices/{notice}/read', [CustomerAuthController::class, 'markNoticeRead'])->name('api.customer.network-notices.read');
Route::get('/api/customer/payment-methods', [CustomerAuthController::class, 'paymentMethods'])->name('api.customer.payment-methods');
Route::post('/api/customer/payments/confirm', [CustomerAuthController::class, 'confirmPayment'])->name('api.customer.payments.confirm');
Route::patch('/api/customer/profile', [CustomerAuthController::class, 'updateProfile'])->name('api.customer.profile.update');
Route::patch('/api/customer/password', [CustomerAuthController::class, 'updatePassword'])->name('api.customer.password.update');
Route::get('/api/customer/wifi/device', [CustomerAuthController::class, 'wifiDevice'])->name('api.customer.wifi.device');
Route::post('/api/customer/wifi/password', [CustomerAuthController::class, 'updateWifiPassword'])->name('api.customer.wifi.password.update');
Route::get('/api/customer/wifi/password-verifications/{verificationId}', [CustomerAuthController::class, 'wifiPasswordVerification'])->name('api.customer.wifi.password.verification');
Route::patch('/api/customer/auto-message', [CustomerAuthController::class, 'updateAutoMessage'])->name('api.customer.auto-message.update');
Route::post('/api/whatsapp/webhooks/payments', [WhatsAppPaymentWebhookController::class, 'store'])
    ->middleware('throttle:60,1')
    ->name('api.whatsapp.webhooks.payments');

// Customer Portal Pages (Public - tanpa auth admin)
Route::get('/customer/login', function () {
    return view('app');
})->name('customer.login');

Route::get('/customer/dashboard', function () {
    return view('app');
})->name('customer.dashboard');

// Auth API routes
Route::post('/login', [\App\Http\Controllers\Auth\AuthenticatedSessionController::class, 'store'])->name('login.store');
// Register disabled — akun dibuat oleh admin saja
Route::post('/logout', [\App\Http\Controllers\Auth\AuthenticatedSessionController::class, 'destroy'])->name('logout');

// Auth routes (login, register, etc.) - untuk view
require __DIR__.'/auth.php';

// API Routes & Protected Pages
Route::middleware(['auth', 'track.user.activity'])->group(function () {
    Route::get('/dashboard', fn() => view('app'))->name('dashboard');
    Route::get('/profile', fn() => view('app'))->name('profile.edit');

    // User API (any authenticated user)
    Route::get('/api/user', function () {
        return response()->json(auth()->user());
    })->name('api.user');
    Route::get('/api/staff-users-lite', function () {
        return response()->json([
            'data' => app(PaymentReceiverService::class)
                ->staffUsersLite(),
        ]);
    })->name('api.staff-users-lite');
    Route::get('/api/payment-receivers', function () {
        if (!auth()->user()?->canChoosePaymentReceiver()) {
            return response()->json([
                'message' => 'Anda tidak memiliki izin memilih penerima pembayaran. Hubungi superadmin.',
            ], 403);
        }

        return response()->json([
            'data' => app(PaymentReceiverService::class)
                ->allowedReceivers(auth()->user())
                ->values(),
        ]);
    })->name('api.payment-receivers.index');
    Route::get('/api/payment-receiver-approvals/pending', [PaymentReceiverApprovalController::class, 'pending'])->name('api.payment-receiver-approvals.pending');
    Route::post('/api/payment-receiver-approvals/{approval}/approve', [PaymentReceiverApprovalController::class, 'approve'])->name('api.payment-receiver-approvals.approve');
    Route::post('/api/payment-receiver-approvals/{approval}/reject', [PaymentReceiverApprovalController::class, 'reject'])->name('api.payment-receiver-approvals.reject');
    Route::get('/api/access-control/me', [AccessControlController::class, 'me'])->name('api.access-control.me');

    // Profile (any authenticated user)
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::post('/api/customers/{customer}/mobile-password/reset', [CustomerMobilePasswordController::class, 'reset'])
        ->middleware(['role:teknisi,finance', 'throttle:mobile-customer-reset'])
        ->name('api.customers.mobile-password.reset');
    
    // View routes - Return React app view (any authenticated user)
    Route::get('/monitoring', fn() => view('app'))->name('monitoring');
    Route::get('/monitoring-maps', fn() => view('app'))->name('monitoring.maps');
    Route::get('/monitoring-genieacs', fn() => view('app'))->name('monitoring.genieacs');
    Route::get('/settings/master-data', fn() => view('app'))->name('settings.master-data');
    Route::get('/settings/expense-categories', fn() => view('app'))->name('settings.expense-categories');
    Route::get('/settings/customer-package-management', fn() => view('app'))->name('settings.customer-package-management');
    Route::get('/settings/borrowers', fn() => view('app'))->name('settings.borrowers');
    Route::get('/settings/company-finance-receivers', fn() => view('app'))->name('settings.company-finance-receivers');
    Route::get('/settings/payment-receiver-mappings', fn() => view('app'))->name('settings.payment-receiver-mappings');
    Route::get('/pinjaman', fn() => view('app'))->name('borrower-loans.index');

    // Shared routes: all authenticated staff can access
    Route::middleware('role:teknisi,finance')->group(function () {
        // Dashboard API
        Route::get('/api/dashboard', [DashboardController::class, 'api'])->name('api.dashboard');

        // Packages active list (needed in customer form by teknisi)
        Route::get('/api/packages/active', [PackageController::class, 'active'])->name('api.packages.active');
        Route::post('/api/customers/{customer}/billing-profile', [CustomerBillingProfileController::class, 'upsert'])->name('api.customers.billing-profile.upsert');
        Route::get('/api/packages/{package}/price-history', [PackagePriceHistoryController::class, 'index'])->name('api.packages.price-history.index');

        // Payroll lite members list (needed in customer verification for pelaksana checklist)
        Route::get('/api/payroll/members-lite', [PayrollController::class, 'members'])->name('api.payroll.members.lite');
        Route::get('/api/master-wilayah/kecamatan', [MasterWilayahController::class, 'kecamatanOptions'])->name('api.master-wilayah.kecamatan');
        Route::get('/api/master-wilayah/desa', [MasterWilayahController::class, 'desaOptions'])->name('api.master-wilayah.desa');
        Route::get('/api/master-wilayah/dusun', [MasterWilayahController::class, 'dusunOptions'])->name('api.master-wilayah.dusun');

        // Inventory Pages
        Route::get('/inventori', fn() => view('app'))->name('inventory.index');

        // Inventory API
        Route::get('/api/inventory/summary', [InventoryController::class, 'summary'])->name('api.inventory.summary');
        Route::get('/api/inventory/items/options', [InventoryController::class, 'itemOptions'])->name('api.inventory.items.options');
        Route::get('/api/inventory/items/install-options', [InventoryController::class, 'installationItemOptions'])->name('api.inventory.items.install-options');
        Route::get('/api/inventory/movements', [InventoryController::class, 'movements'])->name('api.inventory.movements');
        Route::put('/api/inventory/movements/{movement}', [InventoryController::class, 'updateMovement'])->name('api.inventory.movements.update');
        Route::delete('/api/inventory/movements/{movement}', [InventoryController::class, 'destroyMovement'])->name('api.inventory.movements.destroy');
        Route::post('/api/inventory/incoming', [InventoryController::class, 'storeIncoming'])->name('api.inventory.incoming.store');
        Route::post('/api/inventory/outgoing', [InventoryController::class, 'storeOutgoing'])->name('api.inventory.outgoing.store');
        Route::get('/api/inventory/debts', [InventoryController::class, 'debts'])->name('api.inventory.debts.index');
        Route::post('/api/inventory/debts/{debt}/pay', [InventoryController::class, 'payDebt'])->name('api.inventory.debts.pay');
        Route::post('/api/inventory/debts/pay-bulk', [InventoryController::class, 'payDebtBulk'])->name('api.inventory.debts.pay-bulk');
    });

    // Technical routes: admin + teknisi (superadmin always has access via RoleMiddleware)
    Route::middleware('role:teknisi')->group(function () {
        // Customers API
        Route::get('/api/customers', [CustomerController::class, 'list'])->name('api.customers.list');
        Route::post('/api/customers', [CustomerController::class, 'store'])->name('api.customers.store');
        Route::post('/api/customers/active-status', [CustomerController::class, 'activeStatusBulk'])->name('api.customers.active-status');
        Route::get('/api/customers/{customer}', [CustomerController::class, 'show'])->name('api.customers.show');
        Route::post('/api/customers/{customer}', [CustomerController::class, 'update'])->name('api.customers.update');
        Route::delete('/api/customers/{customer}', [CustomerController::class, 'destroy'])->name('api.customers.destroy');
        Route::get('/api/customers/{customer}/riwayat', [CustomerController::class, 'riwayatApi'])->name('api.customers.riwayat');
        Route::post('/api/customers/{customer}/compensation', [CustomerController::class, 'giveCompensation'])->name('api.customers.compensation');
        Route::patch('/api/customers/{customer}/service-package', [CustomerController::class, 'updateServicePackage'])->name('api.customers.service-package.update');
        Route::get('/api/customers/{customer}/wifi/device', [CustomerWifiController::class, 'device'])
            ->middleware('permission:customer.wifi.manage')
            ->name('api.customers.wifi.device');
        Route::post('/api/customers/{customer}/wifi/password', [CustomerWifiController::class, 'updatePassword'])
            ->middleware('permission:customer.wifi.manage')
            ->name('api.customers.wifi.password.update');
        Route::get('/api/customers/{customer}/wifi/password-verifications/{verificationId}', [CustomerWifiController::class, 'verification'])
            ->middleware('permission:customer.wifi.manage')
            ->name('api.customers.wifi.password.verification');
        Route::get('/api/customers/export/excel', [CustomerController::class, 'exportExcel'])->name('api.customers.export');

        // Customer Routes (for form-based activation)
        Route::get('/pelanggan', fn() => view('app'))->name('customers.list');
        Route::get('/pelanggan-legacy', [CustomerController::class, 'list'])->name('customers.list.legacy');
        Route::get('/pelanggan/create', [CustomerController::class, 'create'])->name('customers.create');
        Route::post('/pelanggan', [CustomerController::class, 'store'])->name('customers.store');
        Route::get('/pelanggan/{customerId}/edit', [CustomerController::class, 'edit'])->name('customers.edit');
        Route::post('/pelanggan/{customerId}/edit', [CustomerController::class, 'update'])->name('customers.update');
        Route::get('/pelanggan/{customerId}/riwayat', [CustomerController::class, 'riwayat'])->name('customers.riwayat');
        Route::get('/pelanggan/{customerId}/secret', [CustomerController::class, 'getSecret'])->name('customers.secret');
        Route::delete('/pelanggan/{customerId}/delete', [CustomerController::class, 'destroy'])->name('customers.destroy');

        // Customer Verification (Google Sheets Integration)
        // Customer Verification (Google Sheets Integration)
        Route::prefix('api/customer-verification')->group(function () {
            Route::get('/form-url', [\App\Http\Controllers\CustomerVerificationController::class, 'getFormUrl'])->name('customer-verification.form-url');
            Route::get('/pending', [\App\Http\Controllers\CustomerVerificationController::class, 'fetchPendingCustomers'])->name('customer-verification.pending');
            Route::post('/register', [\App\Http\Controllers\CustomerVerificationController::class, 'registerCustomer'])->name('customer-verification.register');
            Route::post('/analyze-mac', [\App\Http\Controllers\CustomerVerificationController::class, 'analyzeMacPhoto'])->name('customer-verification.analyze-mac');
            Route::get('/get/{timestamp}', [\App\Http\Controllers\CustomerVerificationController::class, 'getCustomerForVerification'])->name('customer-verification.get');
            Route::get('/odps/options', [\App\Http\Controllers\CustomerVerificationController::class, 'odpOptions'])->name('customer-verification.odps.options');
            Route::post('/verify', [\App\Http\Controllers\CustomerVerificationController::class, 'verifyCustomer'])->name('customer-verification.verify');
            Route::get('/verified', [\App\Http\Controllers\CustomerVerificationController::class, 'getVerifiedTimestamps'])->name('customer-verification.verified');
        });

        // Customer Prospects (Verifikasi Calon Pelanggan Publik/Internal)
        Route::prefix('api/customer-prospects')->group(function () {
            Route::get('/', [\App\Http\Controllers\CustomerProspectController::class, 'index'])->name('customer-prospects.index');
            Route::get('/recommendations', [\App\Http\Controllers\CustomerProspectController::class, 'recommendations'])->name('customer-prospects.recommendations');
            Route::post('/{id}/status', [\App\Http\Controllers\CustomerProspectController::class, 'updateStatus'])->name('customer-prospects.status');
            Route::delete('/{id}', [\App\Http\Controllers\CustomerProspectController::class, 'destroy'])->name('customer-prospects.destroy');
        });

        // Customer Verification & Prospect Pages (React SPA)
        Route::get('/customer-verification', fn() => view('app'))->name('customer-verification.index');
        Route::get('/customer-verification/register', fn() => view('app'))->name('customer-verification.register');
        Route::get('/customer-verification/verify/{timestamp}', fn() => view('app'))->name('customer-verification.form');
        Route::get('/customer-prospects', fn() => view('app'))->name('customer-prospects.index');

        // Distribution Route Page (React SPA)
        Route::get('/jalur-distribusi', fn() => view('app'))->name('distribution.route');
        Route::get('/odp-mapping', fn() => view('app'))->name('odp.mapping');

        // Distribution Route API
        Route::get('/api/distribution-routes/latest', [DistributionRouteController::class, 'latest'])->name('api.distribution-routes.latest');
        Route::post('/api/distribution-routes/save', [DistributionRouteController::class, 'save'])->name('api.distribution-routes.save');

        // ODP API
        Route::get('/api/odp', [OdpController::class, 'apiIndex'])->name('api.odp.index');
        Route::post('/api/odp', [OdpController::class, 'apiStore'])->name('api.odp.store');
        Route::get('/api/odp/{odp}', [OdpController::class, 'apiShow'])->name('api.odp.show');
        Route::post('/api/odp/{odp}', [OdpController::class, 'apiUpdate'])->name('api.odp.update');
        Route::put('/api/odp/{odp}', [OdpController::class, 'apiUpdate'])->name('api.odp.update.put');
        Route::delete('/api/odp/{odp}', [OdpController::class, 'apiDestroy'])->name('api.odp.destroy');
        Route::get('/api/odp/{odp}/customers', [OdpController::class, 'apiCustomers'])->name('api.odp.customers');
        Route::post('/api/odp/{odp}/customers', [OdpController::class, 'apiAttachCustomer'])->name('api.odp.customers.attach');
        Route::delete('/api/odp/{odp}/customers', [OdpController::class, 'apiDetachCustomer'])->name('api.odp.customers.detach');

        // ODP Mapping v2 API
        Route::get('/api/odp-mapping/customers', [OdpMappingController::class, 'customers'])->middleware('permission:odp.mapping.view')->name('api.odp-mapping.customers');
        Route::post('/api/odp-mapping/assign', [OdpMappingController::class, 'assign'])->middleware('permission:odp.mapping.assign')->name('api.odp-mapping.assign');
        Route::post('/api/odp-mapping/unassign', [OdpMappingController::class, 'unassign'])->middleware('permission:odp.mapping.assign')->name('api.odp-mapping.unassign');
        Route::post('/api/odp-mapping/backfill', [OdpMappingController::class, 'backfill'])->middleware('permission:odp.mapping.assign')->name('api.odp-mapping.backfill');
        Route::get('/api/odp-mapping/quality-audit', [OdpMappingController::class, 'qualityAudit'])->middleware('permission:odp.mapping.view')->name('api.odp-mapping.quality-audit');
        Route::get('/api/odps/options', [OdpMappingController::class, 'options'])->middleware('permission:odp.mapping.view')->name('api.odp.options');

        // Complaints API
        Route::get('/api/complaints', [ComplaintController::class, 'index'])->middleware('permission:complaint.view')->name('api.complaints.index');
        Route::get('/api/complaints/sla-live', [ComplaintController::class, 'slaLive'])->middleware('permission:complaint.view')->name('api.complaints.sla-live');
        Route::get('/api/complaints/stats', [ComplaintController::class, 'stats'])->name('api.complaints.stats');
        Route::get('/api/complaints/{complaint}', [ComplaintController::class, 'show'])->middleware('permission:complaint.view')->name('api.complaints.show');
        Route::put('/api/complaints/{complaint}', [ComplaintController::class, 'update'])->middleware('permission:complaint.update')->name('api.complaints.update');
        Route::delete('/api/complaints/{complaint}', [ComplaintController::class, 'destroy'])->middleware('permission:complaint.update')->name('api.complaints.destroy');
        Route::post('/api/complaints/{complaint}/reply', [ComplaintController::class, 'reply'])->middleware('permission:complaint.update')->name('api.complaints.reply');
        Route::post('/api/complaints/{complaint}/escalate', [ComplaintController::class, 'escalate'])->middleware('permission:complaint.update')->name('api.complaints.escalate');
        Route::get('/api/complaints/report', [ComplaintController::class, 'report'])->middleware('permission:complaint.report')->name('api.complaints.report');
        Route::get('/api/complaints/cause-categories', [ComplaintController::class, 'causeCategories'])->name('api.complaints.cause-categories');

        // Network Notices API
        Route::get('/api/network-notices', [NetworkNoticeController::class, 'index'])->name('api.network-notices.index');
        Route::get('/api/network-notices/stats', [NetworkNoticeController::class, 'stats'])->name('api.network-notices.stats');
        Route::post('/api/network-notices', [NetworkNoticeController::class, 'store'])->name('api.network-notices.store');
        Route::get('/api/network-notices/{networkNotice}', [NetworkNoticeController::class, 'show'])->name('api.network-notices.show');
        Route::put('/api/network-notices/{networkNotice}', [NetworkNoticeController::class, 'update'])->name('api.network-notices.update');
        Route::delete('/api/network-notices/{networkNotice}', [NetworkNoticeController::class, 'destroy'])->name('api.network-notices.destroy');
        Route::patch('/api/network-notices/{networkNotice}/toggle', [NetworkNoticeController::class, 'toggleActive'])->name('api.network-notices.toggle');

        // Isolir API
        Route::get('/api/isolir', [IsolirController::class, 'index'])->name('api.isolir.index');

        // Monitoring API
        Route::get('/api/monitoring', [MonitoringController::class, 'getData'])->name('api.monitoring.data');
        Route::post('/api/monitoring/refresh', [MonitoringController::class, 'refresh'])->name('api.monitoring.refresh');
        Route::get('/api/monitoring/connection/{username}', [MonitoringController::class, 'connectionDetails'])->name('api.monitoring.connection');
        Route::get('/api/monitoring-maps', [MonitoringMapsController::class, 'getMapData'])->middleware('permission:monitoring.maps.view')->name('api.monitoring-maps');

        // GenieACS Monitoring & TR-069 Management API
        Route::get('/api/genieacs/devices', [GenieAcsMonitoringController::class, 'devices'])->name('api.genieacs.devices');
        Route::get('/api/genieacs/devices/{deviceId}', [GenieAcsMonitoringController::class, 'show'])->name('api.genieacs.show');
        Route::post('/api/genieacs/devices/{deviceId}/wifi', [GenieAcsMonitoringController::class, 'updateWifi'])->name('api.genieacs.wifi.update');
        Route::post('/api/genieacs/devices/{deviceId}/reboot', [GenieAcsMonitoringController::class, 'reboot'])->name('api.genieacs.reboot');
        Route::post('/api/genieacs/devices/{deviceId}/refresh', [GenieAcsMonitoringController::class, 'refresh'])->name('api.genieacs.refresh');
        Route::post('/api/genieacs/devices/{deviceId}/assign-customer', [GenieAcsMonitoringController::class, 'assignCustomer'])->name('api.genieacs.assign-customer');

        // WhatsApp API
        Route::get('/api/whatsapp/status', [WhatsAppController::class, 'status'])->name('api.whatsapp.status');
        Route::get('/api/whatsapp/qr', [WhatsAppController::class, 'qr'])->name('api.whatsapp.qr');
        Route::post('/api/whatsapp/restart', [WhatsAppController::class, 'restart'])->name('api.whatsapp.restart');
        Route::post('/api/whatsapp/logout', [WhatsAppController::class, 'logout'])->name('api.whatsapp.logout');
        Route::post('/api/whatsapp/send-notification', [WhatsAppController::class, 'sendNotification'])->name('api.whatsapp.send-notification');
        Route::post('/api/whatsapp/send-test', [WhatsAppController::class, 'sendTest'])->name('api.whatsapp.send-test');
        Route::get('/api/whatsapp/logs', [WhatsAppController::class, 'logs'])->name('api.whatsapp.logs');

        // Incident engine and incident management
        Route::get('/api/network-incidents', [NetworkIncidentController::class, 'index'])->middleware('permission:incident.view')->name('api.network-incidents.index');
        Route::post('/api/network-incidents', [NetworkIncidentController::class, 'store'])->middleware('permission:incident.manage')->name('api.network-incidents.store');
        Route::post('/api/network-incidents/{networkIncident}/acknowledge', [NetworkIncidentController::class, 'acknowledge'])->middleware('permission:incident.manage')->name('api.network-incidents.acknowledge');
        Route::post('/api/network-incidents/{networkIncident}/escalate', [NetworkIncidentController::class, 'escalate'])->middleware('permission:incident.manage')->name('api.network-incidents.escalate');
        Route::post('/api/network-incidents/{networkIncident}/mitigate', [NetworkIncidentController::class, 'mitigate'])->middleware('permission:incident.manage')->name('api.network-incidents.mitigate');
        Route::post('/api/network-incidents/{networkIncident}/resolve', [NetworkIncidentController::class, 'resolve'])->middleware('permission:incident.manage')->name('api.network-incidents.resolve');
        Route::post('/api/network-incidents/{networkIncident}/postmortem', [NetworkIncidentController::class, 'postmortem'])->middleware('permission:incident.manage')->name('api.network-incidents.postmortem');
        Route::post('/api/network-incidents/run-engine', [NetworkIncidentController::class, 'runEngine'])->middleware('permission:incident.run_engine')->name('api.network-incidents.run-engine');

        // Installation workflow
        Route::get('/instalasi', fn() => view('app'))->name('installation.index');
        Route::get('/api/installations/leads', [InstallationWorkflowController::class, 'leads'])->middleware('permission:installation.view')->name('api.installations.leads');
        Route::post('/api/installations/leads', [InstallationWorkflowController::class, 'storeLead'])->middleware('permission:installation.manage')->name('api.installations.leads.store');
        Route::get('/api/installations/work-orders', [InstallationWorkflowController::class, 'workOrders'])->middleware('permission:installation.view')->name('api.installations.work-orders');
        Route::post('/api/installations/work-orders', [InstallationWorkflowController::class, 'storeWorkOrder'])->middleware('permission:installation.manage')->name('api.installations.work-orders.store');
        Route::get('/api/installations/work-orders/{installationWorkOrder}', [InstallationWorkflowController::class, 'showWorkOrder'])->middleware('permission:installation.view')->name('api.installations.work-orders.show');
        Route::put('/api/installations/checklists/{installationChecklist}', [InstallationWorkflowController::class, 'updateChecklist'])->middleware('permission:installation.manage')->name('api.installations.checklists.update');
        Route::post('/api/installations/work-orders/{installationWorkOrder}/complete', [InstallationWorkflowController::class, 'completeWorkOrder'])->middleware('permission:installation.manage')->name('api.installations.work-orders.complete');
    }); // end teknisi routes

    // Billing/Penagihan API (permission-driven, role-agnostic)
    Route::middleware('permission:billing.invoice.view')->group(function () {
        Route::get('/api/billing', [BillingController::class, 'apiIndex'])->name('api.billing.index');
        Route::get('/api/billing/auto-invoice/{jobId}', [BillingController::class, 'autoInvoiceStatus'])->name('api.billing.auto-invoice.status');
        Route::get('/billing/invoice/{invoice}/payment-proof', [BillingController::class, 'paymentProof'])->name('billing.invoice.payment-proof');
        Route::get('/api/billing/invoice/{invoice}/payment-proof/blob', [BillingController::class, 'paymentProofBlob'])->name('api.billing.invoice.payment-proof-blob');
        Route::get('/api/billing/invoice/{invoice}/payment-proof/preview', [BillingController::class, 'paymentProofPreview'])->name('api.billing.invoice.payment-proof-preview');
        Route::get('/api/billing/customer/{customer}/isolation-status', [BillingController::class, 'checkIsolationStatus'])->name('api.billing.isolation-status');
        Route::post('/api/billing/isolation-status-bulk', [BillingController::class, 'isolationStatusBulk'])->name('api.billing.isolation-status-bulk');
        Route::get('/api/invoices/{invoice}', [InvoiceItemController::class, 'show'])->name('api.invoices.show');
    });

    Route::middleware('permission:billing.invoice.create')->group(function () {
        Route::post('/api/billing/auto-invoice', [BillingController::class, 'autoInvoice'])->name('api.billing.auto-invoice');
        Route::post('/api/billing/{customer}/create-invoice', [BillingController::class, 'createInvoice'])->name('api.billing.create-invoice');
    });

    Route::middleware('permission:billing.invoice.approve')->group(function () {
        Route::post('/api/billing/invoice/{invoice}/confirm', [BillingController::class, 'confirmPaymentApi'])->name('api.billing.confirm');
        Route::post('/api/billing/invoice/{invoice}/reject', [BillingController::class, 'rejectPaymentApi'])->name('api.billing.reject');
    });

    Route::middleware('permission:billing.invoice.adjust')->group(function () {
        Route::put('/api/billing/invoice/{invoice}/amount', [BillingController::class, 'updateInvoiceAmountApi'])->name('api.billing.update-amount');
        Route::post('/api/invoices/{invoice}/items', [InvoiceItemController::class, 'store'])->name('api.invoices.items.store');
        Route::put('/api/invoices/{invoice}/items/{item}', [InvoiceItemController::class, 'update'])->name('api.invoices.items.update');
        Route::delete('/api/invoices/{invoice}/items/{item}', [InvoiceItemController::class, 'destroy'])->name('api.invoices.items.destroy');
    });

    Route::middleware('permission:billing.invoice.manage')->group(function () {
        Route::post('/api/billing/customer/{customer}/isolate', [BillingController::class, 'isolateCustomer'])->name('api.billing.isolate');
        Route::patch('/api/billing/customer/{customer}/service-package', [BillingController::class, 'updateCustomerServicePackage'])->name('api.billing.customer.service-package');
    });

    Route::middleware('permission:billing.dunning.view')->group(function () {
        Route::get('/api/billing/dunning/config', [BillingAutomationController::class, 'dunningConfig'])->name('api.billing.dunning.config');
        Route::get('/api/billing/dunning/logs', [BillingAutomationController::class, 'dunningLogs'])->name('api.billing.dunning.logs');
    });

    Route::middleware('permission:billing.dunning.manage')->group(function () {
        Route::put('/api/billing/dunning/config', [BillingAutomationController::class, 'updateDunningConfig'])->name('api.billing.dunning.config.update');
        Route::post('/api/billing/dunning/run', [BillingAutomationController::class, 'runDunning'])->name('api.billing.dunning.run');
    });

    Route::middleware('permission:billing.payment_capture.manage')->group(function () {
        Route::post('/api/billing/payments/capture', [BillingAutomationController::class, 'capturePayment'])->name('api.billing.payments.capture');
        Route::post('/api/billing/payments/upload-and-analyze', [BillingAutomationController::class, 'uploadAndAnalyze'])->name('api.billing.payments.upload-and-analyze');
        Route::post('/api/billing/payments/match', [BillingAutomationController::class, 'runMatch'])->name('api.billing.payments.match');
        Route::put('/api/billing/payment-verification/config', [BillingAutomationController::class, 'updatePaymentVerificationConfig'])->name('api.billing.payment-verification.config.update');
        Route::post('/api/billing/payments/{capture}/reanalyze', [BillingAutomationController::class, 'reanalyzeCapture'])->name('api.billing.payments.reanalyze');
    });

    Route::middleware('permission:billing.payment_capture.review')->group(function () {
        Route::get('/api/billing/payment-verification/config', [BillingAutomationController::class, 'paymentVerificationConfig'])->name('api.billing.payment-verification.config');
        Route::get('/api/billing/payments/unmatched', [BillingAutomationController::class, 'unmatched'])->name('api.billing.payments.unmatched');
        Route::get('/api/billing/payments/captures', [BillingAutomationController::class, 'captures'])->name('api.billing.payments.captures');
        Route::post('/api/billing/payments/{capture}/resolve', [BillingAutomationController::class, 'resolveCapture'])->name('api.billing.payments.resolve');
        Route::post('/api/billing/payments/{capture}/assign-customer', [BillingAutomationController::class, 'assignCustomer'])->name('api.billing.payments.assign-customer');
    });

    Route::middleware('permission:customer.package_audit.view')->group(function () {
        Route::get('/api/customer-package-management/summary', [CustomerPackageManagementController::class, 'summary'])->name('api.customer-package-management.summary');
        Route::get('/api/customer-package-management/customers', [CustomerPackageManagementController::class, 'customers'])->name('api.customer-package-management.customers');
        Route::get('/api/customer-package-management/pppoe-secrets', [CustomerPackageManagementController::class, 'pppoeSecrets'])->name('api.customer-package-management.pppoe-secrets');
    });

    Route::middleware('permission:customer.package_audit.manage')->group(function () {
        Route::post('/api/customer-package-management/{customer}/resolve-system-to-mikrotik', [CustomerPackageManagementController::class, 'resolveSystemToMikrotik'])->name('api.customer-package-management.resolve-system-to-mikrotik');
        Route::post('/api/customer-package-management/{customer}/resolve-mikrotik-to-system', [CustomerPackageManagementController::class, 'resolveMikrotikToSystem'])->name('api.customer-package-management.resolve-mikrotik-to-system');
        Route::post('/api/customer-package-management/{customer}/pppoe/create', [CustomerPackageManagementController::class, 'createPppoe'])->name('api.customer-package-management.pppoe.create');
        Route::post('/api/customer-package-management/{customer}/pppoe/link', [CustomerPackageManagementController::class, 'linkPppoe'])->name('api.customer-package-management.pppoe.link');
        Route::post('/api/customer-package-management/{customer}/assign-package', [CustomerPackageManagementController::class, 'assignPackage'])->name('api.customer-package-management.assign-package');
        Route::post('/api/customer-package-management/{customer}/ignore', [CustomerPackageManagementController::class, 'ignore'])->name('api.customer-package-management.ignore');
        Route::delete('/api/customer-package-management/{customer}/ignore', [CustomerPackageManagementController::class, 'unignore'])->name('api.customer-package-management.unignore');
    });

    // Finance routes: admin + finance
    Route::middleware('role:finance')->group(function () {
        Route::get('/laporan', fn() => view('app'))->name('reports.index');
        Route::get('/laporan/income-pelanggan', fn() => view('app'))->name('reports.customer-income.index');
        Route::get('/laporan/pemasangan', fn() => view('app'))->name('reports.installations.index');
        Route::get('/laporan/pelanggan-nonaktif', fn() => view('app'))->name('reports.inactive-customers.index');
        Route::get('/laporan/project', fn() => view('app'))->name('reports.project.index');
        Route::get('/kalender-kas', fn() => view('app'))->name('cash-obligation-calendar.index');
        Route::get('/rekonsiliasi', fn() => view('app'))->name('reconciliation-center.index');
        Route::get('/api/reports/summary', [ReportController::class, 'summary'])->name('api.reports.summary');
        Route::get('/api/reports/customer-income', [ReportController::class, 'customerIncome'])->name('api.reports.customer-income');
        Route::get('/api/reports/installations', [ReportController::class, 'installations'])->name('api.reports.installations');
        Route::get('/api/reports/inactive-customers', [ReportController::class, 'inactiveCustomers'])->name('api.reports.inactive-customers');
        Route::get('/api/reports/projects', [ProjectReportController::class, 'index'])->name('api.reports.projects.index');
        Route::get('/api/reports/projects/options', [ProjectReportController::class, 'options'])->name('api.reports.projects.options');
        Route::get('/api/reports/projects/{projectReport}', [ProjectReportController::class, 'show'])->name('api.reports.projects.show');
        Route::post('/api/reports/projects', [ProjectReportController::class, 'store'])->name('api.reports.projects.store');
        Route::put('/api/reports/projects/{projectReport}', [ProjectReportController::class, 'update'])->name('api.reports.projects.update');
        Route::get('/api/master/installation-pricing', [InstallationPricingController::class, 'index'])->name('api.finance.master.installation-pricing.index');
        Route::post('/api/master/installation-pricing', [InstallationPricingController::class, 'store'])->name('api.finance.master.installation-pricing.store');
        Route::get('/api/monthly-budgets', [MonthlyBudgetController::class, 'index'])->name('api.monthly-budgets.show');
        Route::post('/api/monthly-budgets', [MonthlyBudgetController::class, 'store'])->name('api.monthly-budgets.store');
        Route::put('/api/monthly-budgets/{monthlyBudget}', [MonthlyBudgetController::class, 'update'])->name('api.monthly-budgets.update');
        Route::get('/api/cash-obligation-calendar', [CashObligationCalendarController::class, 'index'])->name('api.cash-obligation-calendar.index');
        Route::post('/api/cash-obligation-calendar/manual-entries', [CashObligationCalendarController::class, 'storeManualEntry'])->name('api.cash-obligation-calendar.manual-entries.store');
        Route::put('/api/cash-obligation-calendar/manual-entries/{entry}', [CashObligationCalendarController::class, 'updateManualEntry'])->name('api.cash-obligation-calendar.manual-entries.update');
        Route::patch('/api/cash-obligation-calendar/manual-entries/{entry}/status', [CashObligationCalendarController::class, 'updateManualEntryStatus'])->name('api.cash-obligation-calendar.manual-entries.status');
        Route::delete('/api/cash-obligation-calendar/manual-entries/{entry}', [CashObligationCalendarController::class, 'destroyManualEntry'])->name('api.cash-obligation-calendar.manual-entries.destroy');
        Route::get('/api/reconciliation-center/summary', [ReconciliationCenterController::class, 'summary'])->name('api.reconciliation-center.summary');
        Route::get('/api/reconciliation-center/issues', [ReconciliationCenterController::class, 'issues'])->name('api.reconciliation-center.issues');
        Route::post('/api/reconciliation-center/refresh', [ReconciliationCenterController::class, 'refresh'])->name('api.reconciliation-center.refresh');
        Route::patch('/api/reconciliation-center/issues/{issue}/status', [ReconciliationCenterController::class, 'updateStatus'])->name('api.reconciliation-center.issues.status');
        Route::post('/api/reconciliation-center/issues/{issue}/actions/{action}', [ReconciliationCenterController::class, 'performAction'])->name('api.reconciliation-center.issues.actions');

        Route::get('/api/dashboard/prediction-bundle', [DashboardController::class, 'predictionBundle'])->name('api.dashboard.prediction-bundle');
        Route::get('/api/dashboard/revenue-forecast', [DashboardController::class, 'revenueForecast'])->name('api.dashboard.revenue-forecast');
        Route::get('/api/dashboard/management-kpis', [DashboardController::class, 'managementKpis'])->name('api.dashboard.management-kpis');
        Route::get('/api/dashboard/financial-projection', [DashboardController::class, 'financialProjection'])->name('api.dashboard.financial-projection');
        Route::get('/api/dashboard/isp-intelligence', [DashboardController::class, 'ispIntelligence'])->name('api.dashboard.isp-intelligence');
        Route::post('/api/dashboard/financial-projection/mandatory-events/confirm', [DashboardController::class, 'confirmMandatoryExpenseExecution'])->name('api.dashboard.financial-projection.mandatory.confirm');
        Route::delete('/api/dashboard/financial-projection/mandatory-events/confirm', [DashboardController::class, 'revokeMandatoryExpenseExecution'])->name('api.dashboard.financial-projection.mandatory.revoke');
        Route::post('/api/dashboard/financial-projection/purchase-goals/fulfill', [DashboardController::class, 'fulfillPurchaseGoal'])->name('api.dashboard.financial-projection.purchase.fulfill');
        Route::post('/api/dashboard/financial-projection/simulate-purchase', [DashboardController::class, 'simulatePurchase'])->name('api.dashboard.financial-projection.purchase.simulate');

        // Unified finance transactions
        Route::get('/api/finance/transactions', [FinancialTransactionController::class, 'index'])->name('api.finance.transactions.index');
        Route::post('/api/finance/manual-income', [FinancialTransactionController::class, 'storeManualIncome'])->name('api.finance.manual-income.store');
        Route::post('/api/finance/balance-adjustments', [FinancialTransactionController::class, 'adjustBalance'])->name('api.finance.adjustments.store');
        Route::put('/api/finance/transactions/{financialTransaction}', [FinancialTransactionController::class, 'update'])->name('api.finance.transactions.update');
        Route::delete('/api/finance/transactions/{financialTransaction}', [FinancialTransactionController::class, 'destroy'])->name('api.finance.transactions.destroy');
        Route::get('/api/borrowers', [BorrowerController::class, 'index'])->name('api.borrowers.index');
        Route::post('/api/borrowers', [BorrowerController::class, 'store'])->name('api.borrowers.store');
        Route::put('/api/borrowers/{borrower}', [BorrowerController::class, 'update'])->name('api.borrowers.update');
        Route::delete('/api/borrowers/{borrower}', [BorrowerController::class, 'destroy'])->name('api.borrowers.destroy');
        Route::get('/api/borrowers/{borrower}/loans', [BorrowerLoanController::class, 'borrowerLoans'])->name('api.borrowers.loans.index');
        Route::get('/api/borrowers/{borrower}/settlement-expenses', [BorrowerLoanController::class, 'settlementExpenseOptions'])->name('api.borrowers.settlement-expenses.index');
        Route::post('/api/borrowers/{borrower}/settle', [BorrowerLoanController::class, 'settleBorrower'])->name('api.borrowers.settle');
        Route::get('/api/borrower-loans', [BorrowerLoanController::class, 'index'])->name('api.borrower-loans.index');
        Route::post('/api/borrower-loans', [BorrowerLoanController::class, 'store'])->name('api.borrower-loans.store');
        Route::put('/api/borrower-loans/{borrowerLoan}', [BorrowerLoanController::class, 'updateLoan'])->name('api.borrower-loans.update');
        Route::delete('/api/borrower-loans/{borrowerLoan}', [BorrowerLoanController::class, 'destroyLoan'])->name('api.borrower-loans.destroy');
        Route::post('/api/borrower-loans/{borrowerLoan}/settle', [BorrowerLoanController::class, 'settle'])->name('api.borrower-loans.settle');
        Route::put('/api/borrower-loan-settlements/{actionGroupKey}', [BorrowerLoanController::class, 'updateSettlementGroup'])->name('api.borrower-loan-settlements.update');
        Route::delete('/api/borrower-loan-settlements/{actionGroupKey}', [BorrowerLoanController::class, 'destroySettlementGroup'])->name('api.borrower-loan-settlements.destroy');
        Route::get('/api/company-finance-receivers', [CompanyFinanceReceiverController::class, 'index'])->name('api.company-finance-receivers.index');
        Route::post('/api/company-finance-receivers', [CompanyFinanceReceiverController::class, 'store'])->name('api.company-finance-receivers.store');
        Route::delete('/api/company-finance-receivers/{user}', [CompanyFinanceReceiverController::class, 'destroy'])->name('api.company-finance-receivers.destroy');

        // Pengeluaran API
        Route::get('/api/pengeluaran', [PengeluaranController::class, 'apiIndex'])->name('api.pengeluaran.index');
        Route::post('/api/pengeluaran', [PengeluaranController::class, 'apiStore'])->name('api.pengeluaran.store');
        Route::put('/api/pengeluaran/{pengeluaran}', [PengeluaranController::class, 'apiUpdate'])->name('api.pengeluaran.update');
        Route::delete('/api/pengeluaran/{pengeluaran}', [PengeluaranController::class, 'apiDestroy'])->name('api.pengeluaran.destroy');
        Route::get('/api/expense-categories', [ExpenseCategoryController::class, 'index'])->name('api.expense-categories.index');
        Route::post('/api/expense-categories', [ExpenseCategoryController::class, 'store'])->middleware('permission:master.expense_category.manage')->name('api.expense-categories.store');
        Route::put('/api/expense-categories/{expenseCategory}', [ExpenseCategoryController::class, 'update'])->middleware('permission:master.expense_category.manage')->name('api.expense-categories.update');
        Route::delete('/api/expense-categories/{expenseCategory}', [ExpenseCategoryController::class, 'destroy'])->middleware('permission:master.expense_category.manage')->name('api.expense-categories.destroy');

        // Payment Methods API
        Route::get('/api/payment-methods', [PaymentMethodController::class, 'index'])->name('api.payment-methods.index');
        Route::post('/api/payment-methods', [PaymentMethodController::class, 'store'])->name('api.payment-methods.store');
        Route::post('/api/payment-methods/{paymentMethod}', [PaymentMethodController::class, 'update'])->name('api.payment-methods.update');
        Route::delete('/api/payment-methods/{paymentMethod}', [PaymentMethodController::class, 'destroy'])->name('api.payment-methods.destroy');
        Route::patch('/api/payment-methods/{paymentMethod}/toggle', [PaymentMethodController::class, 'toggleActive'])->name('api.payment-methods.toggle');
        Route::post('/api/payment-methods/reorder', [PaymentMethodController::class, 'reorder'])->name('api.payment-methods.reorder');

        // Payment Receipt Options API
        Route::get('/api/payment-receipt-options', [PaymentReceiptOptionController::class, 'index'])->name('api.payment-receipt-options.index');
        Route::get('/api/payment-receipt-options/active', [PaymentReceiptOptionController::class, 'activeList'])->name('api.payment-receipt-options.active');
        Route::post('/api/payment-receipt-options', [PaymentReceiptOptionController::class, 'store'])->name('api.payment-receipt-options.store');
        Route::put('/api/payment-receipt-options/{paymentReceiptOption}', [PaymentReceiptOptionController::class, 'update'])->name('api.payment-receipt-options.update');
        Route::delete('/api/payment-receipt-options/{paymentReceiptOption}', [PaymentReceiptOptionController::class, 'destroy'])->name('api.payment-receipt-options.destroy');
        Route::patch('/api/payment-receipt-options/{paymentReceiptOption}/toggle', [PaymentReceiptOptionController::class, 'toggleActive'])->name('api.payment-receipt-options.toggle');
        Route::get('/api/payment-receiver-mappings', [PaymentReceiverMappingController::class, 'index'])->name('api.payment-receiver-mappings.index');
        Route::put('/api/payment-receiver-mappings/{user}', [PaymentReceiverMappingController::class, 'sync'])->name('api.payment-receiver-mappings.sync');

        // Payroll API
        Route::get('/api/payroll', [PayrollController::class, 'index'])->name('api.payroll.index');
        Route::get('/api/payroll/members', [PayrollController::class, 'members'])->name('api.payroll.members');
        Route::post('/api/payroll/members', [PayrollController::class, 'storeMember'])->name('api.payroll.members.store');
        Route::put('/api/payroll/members/{id}', [PayrollController::class, 'updateMember'])->name('api.payroll.members.update');
        Route::delete('/api/payroll/members/{id}', [PayrollController::class, 'destroyMember'])->name('api.payroll.members.destroy');
        Route::get('/api/payroll/projects/{id}', [PayrollController::class, 'showProject'])->name('api.payroll.projects.show');
        Route::post('/api/payroll/projects', [PayrollController::class, 'storeProject'])->name('api.payroll.projects.store');
        Route::put('/api/payroll/projects/{id}', [PayrollController::class, 'updateProject'])->name('api.payroll.projects.update');
        Route::post('/api/payroll/projects/{id}/confirm', [PayrollController::class, 'confirmPayment'])->name('api.payroll.projects.confirm');
        Route::delete('/api/payroll/projects/{id}', [PayrollController::class, 'destroyProject'])->name('api.payroll.projects.destroy');
        Route::post('/api/payroll/members/{id}/pay', [PayrollController::class, 'payMember'])->name('api.payroll.members.pay');
        Route::get('/api/payroll/members/{id}/payments', [PayrollController::class, 'memberPayments'])->name('api.payroll.members.payments');
    }); // end finance routes

    // Admin-only settings routes (superadmin + admin only)
    Route::middleware('role:admin')->group(function () {
        Route::get('/settings/master-wilayah', fn() => view('app'))->name('master-wilayah.settings');
        Route::get('/settings/master-mikrotik', fn() => view('app'))->name('master-mikrotik.settings');
        Route::get('/settings/customer-wifi-links', fn() => view('app'))->name('settings.customer-wifi-links');

        Route::get('/api/master-wilayah', [MasterWilayahController::class, 'index'])->name('api.master-wilayah.index');
        Route::post('/api/master-wilayah/kecamatan', [MasterWilayahController::class, 'storeKecamatan'])->name('api.master-wilayah.kecamatan.store');
        Route::put('/api/master-wilayah/kecamatan/{kecamatan}', [MasterWilayahController::class, 'updateKecamatan'])->name('api.master-wilayah.kecamatan.update');
        Route::delete('/api/master-wilayah/kecamatan/{kecamatan}', [MasterWilayahController::class, 'destroyKecamatan'])->name('api.master-wilayah.kecamatan.destroy');
        Route::post('/api/master-wilayah/desa', [MasterWilayahController::class, 'storeDesa'])->name('api.master-wilayah.desa.store');
        Route::put('/api/master-wilayah/desa/{desa}', [MasterWilayahController::class, 'updateDesa'])->name('api.master-wilayah.desa.update');
        Route::delete('/api/master-wilayah/desa/{desa}', [MasterWilayahController::class, 'destroyDesa'])->name('api.master-wilayah.desa.destroy');
        Route::post('/api/master-wilayah/dusun', [MasterWilayahController::class, 'storeDusun'])->name('api.master-wilayah.dusun.store');
        Route::put('/api/master-wilayah/dusun/{dusun}', [MasterWilayahController::class, 'updateDusun'])->name('api.master-wilayah.dusun.update');
        Route::delete('/api/master-wilayah/dusun/{dusun}', [MasterWilayahController::class, 'destroyDusun'])->name('api.master-wilayah.dusun.destroy');

        Route::get('/api/master-mikrotik', [MasterMikrotikController::class, 'index'])->name('api.master-mikrotik.index');
        Route::post('/api/master-mikrotik', [MasterMikrotikController::class, 'store'])->name('api.master-mikrotik.store');
        Route::put('/api/master-mikrotik/{masterMikrotik}', [MasterMikrotikController::class, 'update'])->name('api.master-mikrotik.update');
        Route::delete('/api/master-mikrotik/{masterMikrotik}', [MasterMikrotikController::class, 'destroy'])->name('api.master-mikrotik.destroy');
        Route::patch('/api/master-mikrotik/{masterMikrotik}/activate', [MasterMikrotikController::class, 'activate'])->name('api.master-mikrotik.activate');
        Route::post('/api/master-mikrotik/{masterMikrotik}/test-connection', [MasterMikrotikController::class, 'testConnection'])->name('api.master-mikrotik.test-connection');

        // Packages API
        Route::get('/api/packages', [PackageController::class, 'index'])->name('api.packages.index');
        Route::post('/api/packages', [PackageController::class, 'store'])->name('api.packages.store');
        Route::put('/api/packages/{package}', [PackageController::class, 'update'])->name('api.packages.update');
        Route::post('/api/packages/{package}/toggle-public', [PackageController::class, 'togglePublic'])->name('api.packages.toggle-public');
        Route::delete('/api/packages/{package}', [PackageController::class, 'destroy'])->name('api.packages.destroy');

        // MikroTik Profiles API
        Route::get('/api/mikrotik/profiles', [PackageController::class, 'mikrotikProfiles'])->name('api.mikrotik.profiles');

        // Promotions API
        Route::get('/api/promotions', [PromoController::class, 'index'])->name('api.promotions.index');
        Route::post('/api/promotions', [PromoController::class, 'store'])->name('api.promotions.store');
        Route::post('/api/promotions/{promotion}', [PromoController::class, 'update'])->name('api.promotions.update');
        Route::delete('/api/promotions/{promotion}', [PromoController::class, 'destroy'])->name('api.promotions.destroy');
        Route::patch('/api/promotions/{promotion}/toggle', [PromoController::class, 'toggleActive'])->name('api.promotions.toggle');

        // Site Settings API
        Route::get('/api/site-settings', [PromoController::class, 'settings'])->name('api.site-settings.index');
        Route::post('/api/site-settings', [PromoController::class, 'updateSettings'])->name('api.site-settings.update');
        Route::get('/api/master/customer-wifi-links', [CustomerWifiLinkMasterController::class, 'index'])->middleware('permission:master.customer_wifi_links.manage')->name('api.master.customer-wifi-links.index');
        Route::post('/api/master/customer-wifi-links', [CustomerWifiLinkMasterController::class, 'storeLink'])->middleware('permission:master.customer_wifi_links.manage')->name('api.master.customer-wifi-links.store');
        Route::put('/api/master/customer-wifi-links/{link}', [CustomerWifiLinkMasterController::class, 'updateLink'])->middleware('permission:master.customer_wifi_links.manage')->name('api.master.customer-wifi-links.update');
        Route::delete('/api/master/customer-wifi-links/{link}', [CustomerWifiLinkMasterController::class, 'destroyLink'])->middleware('permission:master.customer_wifi_links.manage')->name('api.master.customer-wifi-links.destroy');
        Route::post('/api/master/customer-wifi-allowed-public-ips', [CustomerWifiLinkMasterController::class, 'storeIp'])->middleware('permission:master.customer_wifi_links.manage')->name('api.master.customer-wifi-allowed-public-ips.store');
        Route::put('/api/master/customer-wifi-allowed-public-ips/{ip}', [CustomerWifiLinkMasterController::class, 'updateIp'])->middleware('permission:master.customer_wifi_links.manage')->name('api.master.customer-wifi-allowed-public-ips.update');
        Route::delete('/api/master/customer-wifi-allowed-public-ips/{ip}', [CustomerWifiLinkMasterController::class, 'destroyIp'])->middleware('permission:master.customer_wifi_links.manage')->name('api.master.customer-wifi-allowed-public-ips.destroy');
    }); // end admin settings

    // Superadmin-only routes (User Management)
    Route::middleware('role:superadmin')->group(function () {
        Route::get('/settings/invoice-management', fn() => view('app'))->name('invoice.management');
        Route::get('/settings/payment-verification', fn() => view('app'))->name('payment-verification.settings');
        Route::get('/settings/financial-targets', fn() => view('app'))->name('financial-targets.settings');
        Route::get('/settings/access-policy', fn() => view('app'))->name('access-policy.settings');
        Route::get('/settings/customer-accounts', fn() => view('app'))->name('customer-accounts.settings');
        Route::get('/settings/customer-package-migration', fn() => view('app'))->name('customer-package-migration.settings');
        Route::get('/settings/system-health', fn() => view('app'))->name('system-health.settings');
        Route::get('/settings/system-logs', fn() => view('app'))->name('settings.system-logs');
        Route::get('/settings/installation-pricing', fn() => view('app'))->name('settings.installation-pricing');

        Route::get('/api/billing/invoice-management', [BillingController::class, 'invoiceManagementIndex'])->name('api.billing.invoice-management.index');
        Route::put('/api/billing/invoice-management/{invoice}', [BillingController::class, 'updateInvoiceManagementApi'])->name('api.billing.invoice-management.update');
        Route::delete('/api/billing/invoice-management/{invoice}', [BillingController::class, 'deleteInvoiceManagementApi'])->name('api.billing.invoice-management.destroy');
        Route::post('/api/billing/invoice-management/{invoice}/send-whatsapp', [BillingController::class, 'sendInvoiceManagementWhatsApp'])->name('api.billing.invoice-management.send-whatsapp');
        Route::put('/api/billing/customers/{customer}/automation', [BillingController::class, 'updateCustomerAutomationApi'])->name('api.billing.customer.automation.update');
        Route::get('/api/customer-accounts', [CustomerAccountMappingController::class, 'index'])->name('api.customer-accounts.index');
        Route::patch('/api/customer-accounts/{customer}', [CustomerAccountMappingController::class, 'update'])->name('api.customer-accounts.update');
        Route::post('/api/customer-accounts/{customer}/set-password', [CustomerAccountMappingController::class, 'setPassword'])->name('api.customer-accounts.set-password');
        Route::post('/api/customer-accounts/{customer}/reset-password', [CustomerAccountMappingController::class, 'resetPassword'])->name('api.customer-accounts.reset-password');
        Route::patch('/api/customer-accounts/{customer}/login-status', [CustomerAccountMappingController::class, 'updateLoginStatus'])->name('api.customer-accounts.login-status');
        Route::get('/api/customer-package-migration/preview', [CustomerPackageMigrationController::class, 'preview'])->name('api.customer-package-migration.preview');
        Route::post('/api/customer-package-migration/run', [CustomerPackageMigrationController::class, 'run'])->name('api.customer-package-migration.run');

        Route::get('/api/dashboard/financial-targets', [DashboardController::class, 'financialTargets'])->name('api.dashboard.financial-targets.index');
        Route::post('/api/dashboard/financial-targets', [DashboardController::class, 'storeFinancialTarget'])->name('api.dashboard.financial-targets.store');
        Route::put('/api/dashboard/financial-targets/{financialTarget}', [DashboardController::class, 'updateFinancialTarget'])->name('api.dashboard.financial-targets.update');
        Route::delete('/api/dashboard/financial-targets/{financialTarget}', [DashboardController::class, 'destroyFinancialTarget'])->name('api.dashboard.financial-targets.destroy');

        Route::get('/inventori/master', fn() => view('app'))->name('inventory.master');

        Route::get('/api/inventory/master/types', [InventoryController::class, 'itemTypesIndex'])->name('api.inventory.master.types.index');
        Route::post('/api/inventory/master/types', [InventoryController::class, 'itemTypesStore'])->name('api.inventory.master.types.store');
        Route::put('/api/inventory/master/types/{type}', [InventoryController::class, 'itemTypesUpdate'])->name('api.inventory.master.types.update');
        Route::delete('/api/inventory/master/types/{type}', [InventoryController::class, 'itemTypesDestroy'])->name('api.inventory.master.types.destroy');

        Route::get('/api/inventory/master/items', [InventoryController::class, 'itemsIndex'])->name('api.inventory.master.items.index');
        Route::post('/api/inventory/master/items', [InventoryController::class, 'itemsStore'])->name('api.inventory.master.items.store');
        Route::put('/api/inventory/master/items/{item}', [InventoryController::class, 'itemsUpdate'])->name('api.inventory.master.items.update');
        Route::delete('/api/inventory/master/items/{item}', [InventoryController::class, 'itemsDestroy'])->name('api.inventory.master.items.destroy');

        Route::get('/api/inventory/master/default-pricing', [InventoryController::class, 'defaultPricing'])->name('api.inventory.master.default-pricing.show');
        Route::put('/api/inventory/master/default-pricing', [InventoryController::class, 'updateDefaultPricing'])->name('api.inventory.master.default-pricing.update');
        Route::get('/api/users', [UserManagementController::class, 'index'])->name('api.users.index');
        Route::post('/api/users', [UserManagementController::class, 'store'])->name('api.users.store');
        Route::put('/api/users/{user}', [UserManagementController::class, 'update'])->name('api.users.update');
        Route::delete('/api/users/{user}', [UserManagementController::class, 'destroy'])->name('api.users.destroy');
        Route::post('/api/packages/{package}/price-change', [PackagePriceHistoryController::class, 'changePrice'])->name('api.packages.price-change');

        Route::get('/api/access-control/permissions', [AccessControlController::class, 'permissions'])->name('api.access-control.permissions');
        Route::get('/api/access-control/menu-map', [AccessControlController::class, 'menuMap'])->name('api.access-control.menu-map');
        Route::get('/api/access-control/groups', [AccessControlController::class, 'groups'])->name('api.access-control.groups.index');
        Route::post('/api/access-control/groups', [AccessControlController::class, 'storeGroup'])->name('api.access-control.groups.store');
        Route::put('/api/access-control/groups/{accessGroup}', [AccessControlController::class, 'updateGroup'])->name('api.access-control.groups.update');
        Route::delete('/api/access-control/groups/{accessGroup}', [AccessControlController::class, 'destroyGroup'])->name('api.access-control.groups.destroy');
        Route::post('/api/access-control/groups/{accessGroup}/members', [AccessControlController::class, 'upsertGroupMembers'])->name('api.access-control.groups.members');
        Route::get('/api/access-control/roles/{role}/rules', [AccessControlController::class, 'roleRules'])->name('api.access-control.roles.rules.show');
        Route::put('/api/access-control/roles/{role}/rules', [AccessControlController::class, 'upsertRoleRules'])->name('api.access-control.roles.rules.upsert');
        Route::get('/api/access-control/groups/{accessGroup}/rules', [AccessControlController::class, 'groupRules'])->name('api.access-control.groups.rules.show');
        Route::put('/api/access-control/groups/{accessGroup}/rules', [AccessControlController::class, 'upsertGroupRules'])->name('api.access-control.groups.rules.upsert');
        Route::get('/api/access-control/users/{user}/rules', [AccessControlController::class, 'userRules'])->name('api.access-control.users.rules.show');
        Route::put('/api/access-control/users/{user}/rules', [AccessControlController::class, 'upsertUserRules'])->name('api.access-control.users.rules.upsert');
        Route::get('/api/access-control/users/{user}/effective', [AccessControlController::class, 'userEffective'])->name('api.access-control.users.effective');
        Route::get('/api/access-control/effective-preview', [AccessControlController::class, 'effectivePreview'])->name('api.access-control.effective-preview');
        Route::get('/api/access-control/audit-logs', [AccessControlController::class, 'auditLogs'])->name('api.access-control.audit-logs');
        Route::get('/api/system-activity-logs', [\App\Http\Controllers\SystemActivityLogController::class, 'index'])->name('api.system-activity-logs.index');
        Route::get('/api/system-health', [SystemHealthController::class, 'index'])->name('api.system-health.index');
        Route::post('/api/system-health/check-now', [SystemHealthController::class, 'checkNow'])->name('api.system-health.check-now');
        Route::get('/api/customers/{customer}/contracts', [CustomerAgreementController::class, 'index'])->name('api.customers.contracts.index');
        Route::post('/api/customers/{customer}/contracts', [CustomerAgreementController::class, 'store'])->name('api.customers.contracts.store');
        Route::post('/api/customers/{customer}/contracts/{contract}/send-whatsapp', [CustomerAgreementController::class, 'sendWhatsApp'])->name('api.customers.contracts.send-whatsapp');
    }); // end superadmin middleware

    Route::middleware('role:admin')->group(function () {
        Route::get('/api/customers/{customer}/termination', [CustomerTerminationController::class, 'index'])->name('api.customers.termination.index');
        Route::post('/api/customers/{customer}/termination', [CustomerTerminationController::class, 'store'])->name('api.customers.termination.store');
        Route::post('/api/customers/{customer}/termination/{termination}/send-whatsapp', [CustomerTerminationController::class, 'sendWhatsApp'])->name('api.customers.termination.send-whatsapp');
        Route::post('/api/customers/{customer}/termination/{termination}/finalize', [CustomerTerminationController::class, 'finalize'])->name('api.customers.termination.finalize');
        Route::post('/api/customers/{customer}/termination/{termination}/cancel', [CustomerTerminationController::class, 'cancel'])->name('api.customers.termination.cancel');
    });

    // Serve React app untuk semua routes yang tidak dimulai dengan /api
    Route::get('{any}', function () {
        return view('app');
    })->where('any', '^(?!api).*$')->name('react.app');
});
