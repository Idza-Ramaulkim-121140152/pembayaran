<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('finance:snapshot-balance')
    ->dailyAt('23:59')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('mikrotik:health-check')
    ->everyMinute()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('incident:run-odp-engine')
    ->everyMinute()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('billing:dunning-run')
    ->everyMinute()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('dashboard:prediction-snapshot')
    ->hourlyAt(5)
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('dashboard:prediction-train')
    ->dailyAt('01:10')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();
