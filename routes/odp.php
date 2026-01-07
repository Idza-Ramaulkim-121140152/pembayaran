<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\OdpController;

Route::middleware('auth')->group(function () {
    Route::get('/odp', [OdpController::class, 'index'])->name('odp.index');
    Route::post('/odp', [OdpController::class, 'store'])->name('odp.store');
    Route::get('/odp/{odp}/edit', [OdpController::class, 'edit'])->name('odp.edit');
    Route::put('/odp/{odp}', [OdpController::class, 'update'])->name('odp.update');
    Route::get('/odp/{odp}', [OdpController::class, 'show'])->name('odp.show');
});
