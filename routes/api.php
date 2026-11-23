<?php

use App\Http\Controllers\Mobile\Customer\AuthController as MobileCustomerAuthController;
use App\Http\Controllers\Mobile\Customer\DashboardController as MobileCustomerDashboardController;
use App\Http\Controllers\Mobile\Customer\InvoiceController as MobileCustomerInvoiceController;
use App\Http\Controllers\Mobile\Customer\PaymentConfirmationController as MobileCustomerPaymentConfirmationController;
use App\Http\Controllers\Mobile\Customer\PaymentMethodController as MobileCustomerPaymentMethodController;
use Illuminate\Support\Facades\Route;

Route::prefix('mobile/customer')->group(function () {
    Route::post('/auth/login', [MobileCustomerAuthController::class, 'login'])
        ->middleware('throttle:mobile-customer-login');

    Route::middleware('customer.mobile.auth')->group(function () {
        Route::post('/auth/change-password', [MobileCustomerAuthController::class, 'changePassword']);
        Route::post('/auth/logout', [MobileCustomerAuthController::class, 'logout']);

        Route::get('/dashboard', [MobileCustomerDashboardController::class, 'show']);
        Route::get('/invoices', [MobileCustomerInvoiceController::class, 'index']);
        Route::get('/invoices/{invoice}', [MobileCustomerInvoiceController::class, 'show']);
        Route::get('/payment-methods', [MobileCustomerPaymentMethodController::class, 'index']);
        Route::post('/payments/confirm', [MobileCustomerPaymentConfirmationController::class, 'store']);
    });
});

Route::post('/whatsapp/webhooks/payments', [\App\Http\Controllers\WhatsAppPaymentWebhookController::class, 'store'])
    ->middleware('throttle:60,1')
    ->name('api.whatsapp.webhooks.payments');

Route::post('/whatsapp/webhooks/night-support', [\App\Http\Controllers\WhatsAppNightSupportController::class, 'store'])
    ->middleware('throttle:60,1')
    ->name('api.whatsapp.webhooks.night-support');
Route::get('/whatsapp/night-support/status', [\App\Http\Controllers\WhatsAppNightSupportController::class, 'status'])
    ->name('api.whatsapp.night-support.status');

// QRIS Dinamis & Webhook Notifikasi GoBiz (MacroDroid Android)
Route::post('/qris/webhook', [\App\Http\Controllers\QrisWebhookController::class, 'webhook'])
    ->middleware('throttle:60,1')
    ->name('api.qris.webhook');
Route::get('/qris/status', [\App\Http\Controllers\QrisWebhookController::class, 'publicStatus'])
    ->name('api.qris.status');
Route::get('/invoice/{invoice_link}/dynamic-qris', [\App\Http\Controllers\QrisWebhookController::class, 'getDynamicQris'])
    ->name('api.invoice.dynamic-qris');
Route::get('/invoice/{invoice_link}/check-status', [\App\Http\Controllers\QrisWebhookController::class, 'checkInvoiceStatus'])
    ->name('api.invoice.check-status');

// Public Self-Service Hotspot Voucher API (Tanpa Login)
Route::prefix('hotspot')->group(function () {
    Route::get('/packages', [\App\Http\Controllers\HotspotVoucherController::class, 'publicPackages'])
        ->name('api.hotspot.packages');
    Route::get('/locations', [\App\Http\Controllers\HotspotVoucherController::class, 'publicLocations'])
        ->name('api.hotspot.locations');
    Route::post('/orders', [\App\Http\Controllers\HotspotVoucherController::class, 'createPublicOrder'])
        ->middleware('throttle:20,1')
        ->name('api.hotspot.orders.create');
    Route::get('/orders/{orderCode}/status', [\App\Http\Controllers\HotspotVoucherController::class, 'publicOrderStatus'])
        ->name('api.hotspot.orders.status');
});



