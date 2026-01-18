<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
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
        //
    }
}
