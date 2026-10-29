<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Ensure BaconQrCode & DASPRiD\Enum are autoloaded reliably
        spl_autoload_register(function ($class) {
            if (str_starts_with($class, 'BaconQrCode\\')) {
                $file = base_path('vendor/bacon/bacon-qr-code/src/' . str_replace('\\', '/', substr($class, 12)) . '.php');
                if (file_exists($file)) {
                    require_once $file;
                }
            } elseif (str_starts_with($class, 'DASPRiD\\Enum\\')) {
                $file = base_path('vendor/dasprid/enum/src/' . str_replace('\\', '/', substr($class, 13)) . '.php');
                if (file_exists($file)) {
                    require_once $file;
                }
            }
        });

        // Register MikroTikService as singleton to reuse connection within request
        $this->app->singleton(\App\Services\MikroTikService::class, function ($app) {
            return new \App\Services\MikroTikService();
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('mobile-customer-login', function (Request $request) {
            $username = strtolower((string) $request->input('pppoe_username', ''));

            return Limit::perMinute(5)->by($username.'|'.$request->ip());
        });

        RateLimiter::for('customer-portal-login', function (Request $request) {
            $identifier = strtolower((string) $request->input('identifier', ''));

            return Limit::perMinute(5)->by($identifier.'|'.$request->ip());
        });

        RateLimiter::for('mobile-customer-reset', function (Request $request) {
            $userId = optional($request->user())->id ?: 'guest';

            return Limit::perMinute(10)->by((string) $userId.'|'.$request->ip());
        });
    }
}
