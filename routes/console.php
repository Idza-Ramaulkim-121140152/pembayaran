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
    ->weeklyOn(1, '00:05')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('dashboard:prediction-evaluate')
    ->weeklyOn(1, '00:15')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();

Schedule::command('dashboard:prediction-health --max-age-minutes=11000 --quiet-ok')
    ->dailyAt('06:00')
    ->timezone('Asia/Jakarta')
    ->withoutOverlapping();
