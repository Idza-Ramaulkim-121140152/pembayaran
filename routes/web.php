
<?php
use App\Http\Controllers\CustomerController;

use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\OdpController;
use App\Http\Controllers\PengeluaranController;
use App\Http\Controllers\PaymentMethodController;
use App\Http\Controllers\PaymentReceiptOptionController;
use App\Http\Controllers\LandingPageController;
use App\Http\Controllers\PromoController;
use App\Http\Controllers\CustomerAuthController;
use App\Http\Controllers\ComplaintController;
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
use App\Http\Controllers\NetworkIncidentController;
use App\Http\Controllers\OdpMappingController;
use App\Http\Controllers\PackagePriceHistoryController;
use App\Http\Controllers\AccessControlController;
use App\Http\Controllers\BillingAutomationController;

// Landing Page - HARUS PALING ATAS sebelum route lainnya
Route::get('/', function () {
    return view('app');
})->name('landing');

// Network Status Page (Public - tanpa login)
Route::get('/status-jaringan', function () {
    return view('app');
})->name('network.status');

// Invoice Page (Public - tanpa login, untuk pelanggan bayar tagihan)
Route::get('/invoice/{invoice_link}', function () {
    return view('app');
})->name('invoice.show');

// Route publik untuk akses invoice tanpa login
Route::get('/api/invoice/{invoice_link}', [BillingController::class, 'showInvoiceApi'])->name('api.invoice.show');
Route::post('/invoice/{invoice}/konfirmasi', [\App\Http\Controllers\BillingController::class, 'confirmPayment'])->name('invoice.confirm-payment');

// Public payment methods API (for invoice page)
Route::get('/api/payment-methods/active', [PaymentMethodController::class, 'activeList'])->name('api.payment-methods.active');

// Landing Page Public API
Route::get('/api/landing-page', [LandingPageController::class, 'getData'])->name('api.landing-page');

// Public Network Notices API (for landing page - mass disruptions & maintenance only)
Route::get('/api/network-notices/public', [NetworkNoticeController::class, 'publicNotices'])->name('api.network-notices.public');

// Customer Network Notices API (for customer portal - all relevant notices)
Route::get('/api/network-notices/customer', [NetworkNoticeController::class, 'customerNotices'])->name('api.network-notices.customer');

// Customer Portal API (Public)
Route::post('/api/customer/login', [CustomerAuthController::class, 'login'])->name('api.customer.login');
Route::post('/api/customer/logout', [CustomerAuthController::class, 'logout'])->name('api.customer.logout');
Route::get('/api/customer/check', [CustomerAuthController::class, 'check'])->name('api.customer.check');
Route::get('/api/customer/dashboard', [CustomerAuthController::class, 'dashboard'])->name('api.customer.dashboard');
Route::post('/api/customer/complaint', [CustomerAuthController::class, 'submitComplaint'])->name('api.customer.complaint');

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
Route::middleware('auth')->group(function () {
    Route::get('/dashboard', fn() => view('app'))->name('dashboard');
    Route::get('/profile', fn() => view('app'))->name('profile.edit');

    // User API (any authenticated user)
    Route::get('/api/user', function () {
        return response()->json(auth()->user());
    })->name('api.user');
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
    Route::get('/settings/master-data', fn() => view('app'))->name('settings.master-data');

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
        Route::prefix('api/customer-verification')->group(function () {
            Route::get('/form-url', [\App\Http\Controllers\CustomerVerificationController::class, 'getFormUrl'])->name('customer-verification.form-url');
            Route::get('/pending', [\App\Http\Controllers\CustomerVerificationController::class, 'fetchPendingCustomers'])->name('customer-verification.pending');
            Route::get('/get/{timestamp}', [\App\Http\Controllers\CustomerVerificationController::class, 'getCustomerForVerification'])->name('customer-verification.get');
            Route::get('/odps/options', [\App\Http\Controllers\CustomerVerificationController::class, 'odpOptions'])->name('customer-verification.odps.options');
            Route::post('/verify', [\App\Http\Controllers\CustomerVerificationController::class, 'verifyCustomer'])->name('customer-verification.verify');
            Route::get('/verified', [\App\Http\Controllers\CustomerVerificationController::class, 'getVerifiedTimestamps'])->name('customer-verification.verified');
        });

        // Customer Verification Pages (React SPA)
        Route::get('/customer-verification', fn() => view('app'))->name('customer-verification.index');
        Route::get('/customer-verification/verify/{timestamp}', fn() => view('app'))->name('customer-verification.form');

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
        Route::get('/api/odps/options', [OdpMappingController::class, 'options'])->middleware('permission:odp.mapping.view')->name('api.odp.options');

        // Complaints API
        Route::get('/api/complaints', [ComplaintController::class, 'index'])->middleware('permission:complaint.view')->name('api.complaints.index');
        Route::get('/api/complaints/stats', [ComplaintController::class, 'stats'])->name('api.complaints.stats');
        Route::get('/api/complaints/{complaint}', [ComplaintController::class, 'show'])->middleware('permission:complaint.view')->name('api.complaints.show');
        Route::put('/api/complaints/{complaint}', [ComplaintController::class, 'update'])->middleware('permission:complaint.update')->name('api.complaints.update');
        Route::delete('/api/complaints/{complaint}', [ComplaintController::class, 'destroy'])->middleware('permission:complaint.update')->name('api.complaints.destroy');
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
        Route::post('/api/network-incidents/{networkIncident}/resolve', [NetworkIncidentController::class, 'resolve'])->middleware('permission:incident.manage')->name('api.network-incidents.resolve');
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

    // Finance routes: admin + finance
    Route::middleware('role:finance')->group(function () {
        Route::get('/api/dashboard/revenue-forecast', [DashboardController::class, 'revenueForecast'])->name('api.dashboard.revenue-forecast');
        Route::get('/api/dashboard/management-kpis', [DashboardController::class, 'managementKpis'])->name('api.dashboard.management-kpis');
        Route::get('/api/dashboard/financial-projection', [DashboardController::class, 'financialProjection'])->name('api.dashboard.financial-projection');
        Route::get('/api/dashboard/isp-intelligence', [DashboardController::class, 'ispIntelligence'])->name('api.dashboard.isp-intelligence');
        Route::post('/api/dashboard/financial-projection/mandatory-events/confirm', [DashboardController::class, 'confirmMandatoryExpenseExecution'])->name('api.dashboard.financial-projection.mandatory.confirm');
        Route::delete('/api/dashboard/financial-projection/mandatory-events/confirm', [DashboardController::class, 'revokeMandatoryExpenseExecution'])->name('api.dashboard.financial-projection.mandatory.revoke');
        Route::post('/api/dashboard/financial-projection/purchase-goals/fulfill', [DashboardController::class, 'fulfillPurchaseGoal'])->name('api.dashboard.financial-projection.purchase.fulfill');

        // Billing/Penagihan API
        Route::get('/api/billing', [BillingController::class, 'apiIndex'])->middleware('permission:billing.invoice.view')->name('api.billing.index');
        Route::post('/api/billing/auto-invoice', [BillingController::class, 'autoInvoice'])->middleware('permission:billing.invoice.create')->name('api.billing.auto-invoice');
        Route::get('/api/billing/auto-invoice/{jobId}', [BillingController::class, 'autoInvoiceStatus'])->name('api.billing.auto-invoice.status');
        Route::post('/api/billing/{customer}/create-invoice', [BillingController::class, 'createInvoice'])->middleware('permission:billing.invoice.create')->name('api.billing.create-invoice');
        Route::post('/api/billing/invoice/{invoice}/confirm', [BillingController::class, 'confirmPaymentApi'])->middleware('permission:billing.invoice.approve')->name('api.billing.confirm');
        Route::post('/api/billing/invoice/{invoice}/reject', [BillingController::class, 'rejectPaymentApi'])->middleware('permission:billing.invoice.approve')->name('api.billing.reject');
        Route::put('/api/billing/invoice/{invoice}/amount', [BillingController::class, 'updateInvoiceAmountApi'])->middleware('permission:billing.invoice.adjust')->name('api.billing.update-amount');
        Route::get('/billing/invoice/{invoice}/payment-proof', [BillingController::class, 'paymentProof'])->middleware('permission:billing.invoice.view')->name('billing.invoice.payment-proof');
        Route::get('/api/billing/dunning/config', [BillingAutomationController::class, 'dunningConfig'])->middleware('permission:billing.dunning.view')->name('api.billing.dunning.config');
        Route::put('/api/billing/dunning/config', [BillingAutomationController::class, 'updateDunningConfig'])->middleware('permission:billing.dunning.manage')->name('api.billing.dunning.config.update');
        Route::post('/api/billing/dunning/run', [BillingAutomationController::class, 'runDunning'])->middleware('permission:billing.dunning.manage')->name('api.billing.dunning.run');
        Route::get('/api/billing/dunning/logs', [BillingAutomationController::class, 'dunningLogs'])->middleware('permission:billing.dunning.view')->name('api.billing.dunning.logs');
        Route::post('/api/billing/payments/capture', [BillingAutomationController::class, 'capturePayment'])->middleware('permission:billing.payment_capture.manage')->name('api.billing.payments.capture');
        Route::post('/api/billing/payments/match', [BillingAutomationController::class, 'runMatch'])->middleware('permission:billing.payment_capture.manage')->name('api.billing.payments.match');
        Route::get('/api/billing/payments/unmatched', [BillingAutomationController::class, 'unmatched'])->middleware('permission:billing.payment_capture.review')->name('api.billing.payments.unmatched');
        Route::post('/api/billing/payments/{capture}/resolve', [BillingAutomationController::class, 'resolveCapture'])->middleware('permission:billing.payment_capture.review')->name('api.billing.payments.resolve');
        Route::post('/api/billing/customer/{customer}/isolate', [BillingController::class, 'isolateCustomer'])->name('api.billing.isolate');
        Route::get('/api/billing/customer/{customer}/isolation-status', [BillingController::class, 'checkIsolationStatus'])->name('api.billing.isolation-status');
        Route::post('/api/billing/isolation-status-bulk', [BillingController::class, 'isolationStatusBulk'])->name('api.billing.isolation-status-bulk');
        Route::patch('/api/billing/customer/{customer}/service-package', [BillingController::class, 'updateCustomerServicePackage'])->name('api.billing.customer.service-package');

        // Billing breakdown (invoice items) - compat-first extension
        Route::get('/api/invoices/{invoice}', [InvoiceItemController::class, 'show'])->middleware('permission:billing.invoice.view')->name('api.invoices.show');
        Route::post('/api/invoices/{invoice}/items', [InvoiceItemController::class, 'store'])->middleware('permission:billing.invoice.adjust')->name('api.invoices.items.store');
        Route::put('/api/invoices/{invoice}/items/{item}', [InvoiceItemController::class, 'update'])->middleware('permission:billing.invoice.adjust')->name('api.invoices.items.update');
        Route::delete('/api/invoices/{invoice}/items/{item}', [InvoiceItemController::class, 'destroy'])->middleware('permission:billing.invoice.adjust')->name('api.invoices.items.destroy');

        // Unified finance transactions
        Route::get('/api/finance/transactions', [FinancialTransactionController::class, 'index'])->name('api.finance.transactions.index');
        Route::post('/api/finance/manual-income', [FinancialTransactionController::class, 'storeManualIncome'])->name('api.finance.manual-income.store');
        Route::post('/api/finance/balance-adjustments', [FinancialTransactionController::class, 'adjustBalance'])->name('api.finance.adjustments.store');
        Route::put('/api/finance/transactions/{financialTransaction}', [FinancialTransactionController::class, 'update'])->name('api.finance.transactions.update');
        Route::delete('/api/finance/transactions/{financialTransaction}', [FinancialTransactionController::class, 'destroy'])->name('api.finance.transactions.destroy');

        // Pengeluaran API
        Route::get('/api/pengeluaran', [PengeluaranController::class, 'apiIndex'])->name('api.pengeluaran.index');
        Route::post('/api/pengeluaran', [PengeluaranController::class, 'apiStore'])->name('api.pengeluaran.store');
        Route::put('/api/pengeluaran/{pengeluaran}', [PengeluaranController::class, 'apiUpdate'])->name('api.pengeluaran.update');
        Route::delete('/api/pengeluaran/{pengeluaran}', [PengeluaranController::class, 'apiDestroy'])->name('api.pengeluaran.destroy');

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
    Route::middleware('admin')->group(function () {
        Route::get('/settings/master-wilayah', fn() => view('app'))->name('master-wilayah.settings');
        Route::get('/settings/master-mikrotik', fn() => view('app'))->name('master-mikrotik.settings');

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
    }); // end admin settings

    // Superadmin-only routes (User Management)
    Route::middleware('role:superadmin')->group(function () {
        Route::get('/settings/invoice-management', fn() => view('app'))->name('invoice.management');
        Route::get('/settings/financial-targets', fn() => view('app'))->name('financial-targets.settings');
        Route::get('/settings/access-policy', fn() => view('app'))->name('access-policy.settings');

        Route::get('/api/billing/invoice-management', [BillingController::class, 'invoiceManagementIndex'])->name('api.billing.invoice-management.index');
        Route::put('/api/billing/invoice-management/{invoice}', [BillingController::class, 'updateInvoiceManagementApi'])->name('api.billing.invoice-management.update');
        Route::delete('/api/billing/invoice-management/{invoice}', [BillingController::class, 'deleteInvoiceManagementApi'])->name('api.billing.invoice-management.destroy');

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
    }); // end superadmin middleware

    // Serve React app untuk semua routes yang tidak dimulai dengan /api
    Route::get('{any}', function () {
        return view('app');
    })->where('any', '^(?!api).*$')->name('react.app');
});
