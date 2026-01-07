<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\PengeluaranController;

Route::middleware('auth')->group(function () {
    Route::get('/pengeluaran', [PengeluaranController::class, 'index'])->name('pengeluaran.index');
    Route::post('/pengeluaran', [PengeluaranController::class, 'store'])->name('pengeluaran.store');
});
