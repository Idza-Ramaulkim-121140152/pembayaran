
<?php
use App\Http\Controllers\CustomerController;

use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\OdpController;
use App\Http\Controllers\PengeluaranController;
use App\Http\Controllers\PaymentMethodController;
use App\Http\Controllers\LandingPageController;
use App\Http\Controllers\PromoController;
use App\Http\Controllers\CustomerAuthController;
use App\Http\Controllers\ComplaintController;
use App\Http\Controllers\NetworkNoticeController;
use App\Http\Controllers\MonitoringController;
use App\Http\Controllers\IsolirController;

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
Route::post('/register', [\App\Http\Controllers\Auth\RegisteredUserController::class, 'store'])->name('register.store');
Route::post('/logout', [\App\Http\Controllers\Auth\AuthenticatedSessionController::class, 'destroy'])->name('logout');

// Auth routes (login, register, etc.) - untuk view
require __DIR__.'/auth.php';

// API Routes & Protected Pages
Route::middleware('auth')->group(function () {
    // Dashboard API
    Route::get('/api/dashboard', [DashboardController::class, 'api'])->name('api.dashboard');

    // Customers API
    Route::get('/api/customers', [CustomerController::class, 'list'])->name('api.customers.list');
    Route::post('/api/customers', [CustomerController::class, 'store'])->name('api.customers.store');
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

    // Billing/Penagihan API
    Route::get('/api/billing', [BillingController::class, 'apiIndex'])->name('api.billing.index');
    Route::post('/api/billing/{customer}/create-invoice', [BillingController::class, 'createInvoice'])->name('api.billing.create-invoice');
    Route::post('/api/billing/invoice/{invoice}/confirm', [BillingController::class, 'confirmPaymentApi'])->name('api.billing.confirm');
    Route::post('/api/billing/invoice/{invoice}/reject', [BillingController::class, 'rejectPaymentApi'])->name('api.billing.reject');
    Route::post('/api/billing/customer/{customer}/isolate', [BillingController::class, 'isolateCustomer'])->name('api.billing.isolate');
    Route::get('/api/billing/customer/{customer}/isolation-status', [BillingController::class, 'checkIsolationStatus'])->name('api.billing.isolation-status');

    // ODP API
    Route::get('/api/odp', [OdpController::class, 'apiIndex'])->name('api.odp.index');
    Route::post('/api/odp', [OdpController::class, 'apiStore'])->name('api.odp.store');
    Route::get('/api/odp/{odp}', [OdpController::class, 'apiShow'])->name('api.odp.show');
    Route::post('/api/odp/{odp}', [OdpController::class, 'apiUpdate'])->name('api.odp.update');
    Route::delete('/api/odp/{odp}', [OdpController::class, 'apiDestroy'])->name('api.odp.destroy');

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

    // Promotions API
    Route::get('/api/promotions', [PromoController::class, 'index'])->name('api.promotions.index');
    Route::post('/api/promotions', [PromoController::class, 'store'])->name('api.promotions.store');
    Route::post('/api/promotions/{promotion}', [PromoController::class, 'update'])->name('api.promotions.update');
    Route::delete('/api/promotions/{promotion}', [PromoController::class, 'destroy'])->name('api.promotions.destroy');
    Route::patch('/api/promotions/{promotion}/toggle', [PromoController::class, 'toggleActive'])->name('api.promotions.toggle');

    // Packages API
    Route::get('/api/packages', [PromoController::class, 'packages'])->name('api.packages.index');
    Route::post('/api/packages', [PromoController::class, 'storePackage'])->name('api.packages.store');
    Route::post('/api/packages/{package}', [PromoController::class, 'updatePackage'])->name('api.packages.update');
    Route::delete('/api/packages/{package}', [PromoController::class, 'destroyPackage'])->name('api.packages.destroy');

    // Site Settings API
    Route::get('/api/site-settings', [PromoController::class, 'settings'])->name('api.site-settings.index');
    Route::post('/api/site-settings', [PromoController::class, 'updateSettings'])->name('api.site-settings.update');

    // Complaints API (Admin)
    Route::get('/api/complaints', [ComplaintController::class, 'index'])->name('api.complaints.index');
    Route::get('/api/complaints/stats', [ComplaintController::class, 'stats'])->name('api.complaints.stats');
    Route::get('/api/complaints/{complaint}', [ComplaintController::class, 'show'])->name('api.complaints.show');
    Route::put('/api/complaints/{complaint}', [ComplaintController::class, 'update'])->name('api.complaints.update');
    Route::delete('/api/complaints/{complaint}', [ComplaintController::class, 'destroy'])->name('api.complaints.destroy');

    // Network Notices API (Admin)
    Route::get('/api/network-notices', [NetworkNoticeController::class, 'index'])->name('api.network-notices.index');
    Route::get('/api/network-notices/stats', [NetworkNoticeController::class, 'stats'])->name('api.network-notices.stats');
    
    // Isolir API (Isolated Devices)
    Route::get('/api/isolir', [IsolirController::class, 'index'])->name('api.isolir.index');
    Route::post('/api/network-notices', [NetworkNoticeController::class, 'store'])->name('api.network-notices.store');
    Route::get('/api/network-notices/{networkNotice}', [NetworkNoticeController::class, 'show'])->name('api.network-notices.show');
    Route::put('/api/network-notices/{networkNotice}', [NetworkNoticeController::class, 'update'])->name('api.network-notices.update');
    Route::delete('/api/network-notices/{networkNotice}', [NetworkNoticeController::class, 'destroy'])->name('api.network-notices.destroy');
    Route::patch('/api/network-notices/{networkNotice}/toggle', [NetworkNoticeController::class, 'toggleActive'])->name('api.network-notices.toggle');

    // Monitoring API
    Route::get('/api/monitoring', [MonitoringController::class, 'getData'])->name('api.monitoring.data');
    Route::post('/api/monitoring/refresh', [MonitoringController::class, 'refresh'])->name('api.monitoring.refresh');
    Route::get('/api/monitoring/connection/{username}', [MonitoringController::class, 'connectionDetails'])->name('api.monitoring.connection');

    // User API
    Route::get('/api/user', function () {
        return response()->json(auth()->user());
    })->name('api.user');

    // Profile
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    
    // Serve React app untuk semua routes yang tidak dimulai dengan /api
    Route::get('{any}', function () {
        return view('app');
    })->where('any', '^(?!api).*$')->name('react.app');
});
