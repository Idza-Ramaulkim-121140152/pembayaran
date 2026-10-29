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
    ->name('api.whatsapp.webhooks.payments.api');

Route::post('/whatsapp/webhooks/night-support', [\App\Http\Controllers\WhatsAppNightSupportController::class, 'store'])
    ->name('api.whatsapp.webhooks.night-support.api');
Route::get('/whatsapp/night-support/status', [\App\Http\Controllers\WhatsAppNightSupportController::class, 'status'])
    ->name('api.whatsapp.night-support.status.api');

// QRIS Dinamis & Webhook Notifikasi GoBiz (MacroDroid Android)
Route::post('/qris/webhook', [\App\Http\Controllers\QrisWebhookController::class, 'webhook'])
    ->name('api.qris.webhook');
Route::get('/qris/status', [\App\Http\Controllers\QrisWebhookController::class, 'getSettings'])
    ->name('api.qris.status');
Route::get('/invoice/{invoice_link}/dynamic-qris', [\App\Http\Controllers\QrisWebhookController::class, 'getDynamicQris'])
    ->name('api.invoice.dynamic-qris');
Route::get('/invoice/{invoice_link}/check-status', [\App\Http\Controllers\QrisWebhookController::class, 'checkInvoiceStatus'])
    ->name('api.invoice.check-status');



