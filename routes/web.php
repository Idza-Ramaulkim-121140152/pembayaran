
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
    // User API (any authenticated user)
    Route::get('/api/user', function () {
        return response()->json(auth()->user());
    })->name('api.user');

    // Profile (any authenticated user)
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    
    // View routes - Return React app view (any authenticated user)
    Route::get('/monitoring', fn() => view('app'))->name('monitoring');
    Route::get('/monitoring-maps', fn() => view('app'))->name('monitoring.maps');

    // Shared routes: all authenticated staff can access
    Route::middleware('role:teknisi,finance')->group(function () {
        // Dashboard API
        Route::get('/api/dashboard', [DashboardController::class, 'api'])->name('api.dashboard');

        // Packages active list (needed in customer form by teknisi)
        Route::get('/api/packages/active', [PackageController::class, 'active'])->name('api.packages.active');

        // Payroll lite members list (needed in customer verification for pelaksana checklist)
        Route::get('/api/payroll/members-lite', [PayrollController::class, 'members'])->name('api.payroll.members.lite');

        // Inventory Pages
        Route::get('/inventori', fn() => view('app'))->name('inventory.index');

        // Inventory API
        Route::get('/api/inventory/summary', [InventoryController::class, 'summary'])->name('api.inventory.summary');
        Route::get('/api/inventory/items/options', [InventoryController::class, 'itemOptions'])->name('api.inventory.items.options');
        Route::get('/api/inventory/items/install-options', [InventoryController::class, 'installationItemOptions'])->name('api.inventory.items.install-options');
        Route::get('/api/inventory/movements', [InventoryController::class, 'movements'])->name('api.inventory.movements');
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
        Route::get('/api/customers/export/excel', [CustomerController::class, 'exportExcel'])->name('api.customers.export');

        // Customer Routes (for form-based activation)
        Route::get('/pelanggan', [CustomerController::class, 'list'])->name('customers.list');
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
            Route::post('/verify', [\App\Http\Controllers\CustomerVerificationController::class, 'verifyCustomer'])->name('customer-verification.verify');
            Route::get('/verified', [\App\Http\Controllers\CustomerVerificationController::class, 'getVerifiedTimestamps'])->name('customer-verification.verified');
        });

        // Customer Verification Pages (React SPA)
        Route::get('/customer-verification', fn() => view('app'))->name('customer-verification.index');
        Route::get('/customer-verification/verify/{timestamp}', fn() => view('app'))->name('customer-verification.form');

        // Distribution Route Page (React SPA)
        Route::get('/jalur-distribusi', fn() => view('app'))->name('distribution.route');

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

        // Complaints API
        Route::get('/api/complaints', [ComplaintController::class, 'index'])->name('api.complaints.index');
        Route::get('/api/complaints/stats', [ComplaintController::class, 'stats'])->name('api.complaints.stats');
        Route::get('/api/complaints/{complaint}', [ComplaintController::class, 'show'])->name('api.complaints.show');
        Route::put('/api/complaints/{complaint}', [ComplaintController::class, 'update'])->name('api.complaints.update');
        Route::delete('/api/complaints/{complaint}', [ComplaintController::class, 'destroy'])->name('api.complaints.destroy');

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
        Route::get('/api/monitoring-maps', [MonitoringMapsController::class, 'getMapData'])->name('api.monitoring-maps');

        // WhatsApp API
        Route::get('/api/whatsapp/status', [WhatsAppController::class, 'status'])->name('api.whatsapp.status');
        Route::get('/api/whatsapp/qr', [WhatsAppController::class, 'qr'])->name('api.whatsapp.qr');
        Route::post('/api/whatsapp/restart', [WhatsAppController::class, 'restart'])->name('api.whatsapp.restart');
        Route::post('/api/whatsapp/logout', [WhatsAppController::class, 'logout'])->name('api.whatsapp.logout');
        Route::post('/api/whatsapp/send-notification', [WhatsAppController::class, 'sendNotification'])->name('api.whatsapp.send-notification');
        Route::post('/api/whatsapp/send-test', [WhatsAppController::class, 'sendTest'])->name('api.whatsapp.send-test');
        Route::get('/api/whatsapp/logs', [WhatsAppController::class, 'logs'])->name('api.whatsapp.logs');
    }); // end teknisi routes

    // Finance routes: admin + finance
    Route::middleware('role:finance')->group(function () {
        Route::get('/api/dashboard/revenue-forecast', [DashboardController::class, 'revenueForecast'])->name('api.dashboard.revenue-forecast');
        Route::get('/api/dashboard/management-kpis', [DashboardController::class, 'managementKpis'])->name('api.dashboard.management-kpis');
        Route::get('/api/dashboard/financial-projection', [DashboardController::class, 'financialProjection'])->name('api.dashboard.financial-projection');
        Route::get('/api/dashboard/isp-intelligence', [DashboardController::class, 'ispIntelligence'])->name('api.dashboard.isp-intelligence');
        Route::post('/api/dashboard/financial-projection/mandatory-events/confirm', [DashboardController::class, 'confirmMandatoryExpenseExecution'])->name('api.dashboard.financial-projection.mandatory.confirm');
        Route::delete('/api/dashboard/financial-projection/mandatory-events/confirm', [DashboardController::class, 'revokeMandatoryExpenseExecution'])->name('api.dashboard.financial-projection.mandatory.revoke');

        // Billing/Penagihan API
        Route::get('/api/billing', [BillingController::class, 'apiIndex'])->name('api.billing.index');
        Route::post('/api/billing/{customer}/create-invoice', [BillingController::class, 'createInvoice'])->name('api.billing.create-invoice');
        Route::post('/api/billing/invoice/{invoice}/confirm', [BillingController::class, 'confirmPaymentApi'])->name('api.billing.confirm');
        Route::post('/api/billing/invoice/{invoice}/reject', [BillingController::class, 'rejectPaymentApi'])->name('api.billing.reject');
        Route::put('/api/billing/invoice/{invoice}/amount', [BillingController::class, 'updateInvoiceAmountApi'])->name('api.billing.update-amount');
        Route::post('/api/billing/customer/{customer}/isolate', [BillingController::class, 'isolateCustomer'])->name('api.billing.isolate');
        Route::get('/api/billing/customer/{customer}/isolation-status', [BillingController::class, 'checkIsolationStatus'])->name('api.billing.isolation-status');
        Route::post('/api/billing/isolation-status-bulk', [BillingController::class, 'isolationStatusBulk'])->name('api.billing.isolation-status-bulk');
        Route::patch('/api/billing/customer/{customer}/service-package', [BillingController::class, 'updateCustomerServicePackage'])->name('api.billing.customer.service-package');

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
    }); // end superadmin middleware

    // Serve React app untuk semua routes yang tidak dimulai dengan /api
    Route::get('{any}', function () {
        return view('app');
    })->where('any', '^(?!api).*$')->name('react.app');
});
