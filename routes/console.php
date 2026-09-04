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
    ->everyFiveMinutes()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('incident:run-odp-engine')
    ->everyFiveMinutes()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('billing:dunning-run')
    ->hourly()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('complaints:sla-watch')
    ->everyFiveMinutes()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('system:health-check')
    ->everyFiveMinutes()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('customer:usage-snapshot')
    ->everyFiveMinutes()
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('dashboard:prediction-snapshot')
    ->hourlyAt(5)
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('dashboard:prediction-evaluate')
    ->dailyAt('00:15')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('dashboard:prediction-health --max-age-minutes=11000 --quiet-ok')
    ->dailyAt('06:00')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();
