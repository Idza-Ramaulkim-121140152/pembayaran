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
