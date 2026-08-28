<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
        <meta name="user-name" content="{{ Auth::user()?->name ?? 'User' }}">

    <title>@yield('title', (isset($pageTitle) ? $pageTitle : (isset($header) ? strip_tags($header) : config('app.name', 'Laravel'))))</title>

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=figtree:400,500,600&display=swap" rel="stylesheet" />

        <!-- Scripts -->
        @vite(['resources/css/app.css', 'resources/js/main.jsx'])
    </head>
    <body class="font-sans antialiased bg-gray-100">
        <script>
            // Set username to localStorage for React to read
            window.appUser = "{{ Auth::user()?->name ?? 'User' }}";
            window.appUserId = @json(Auth::id());
            window.appCanChoosePaymentMutation = @json(Auth::user()?->canChoosePaymentMutation() ?? false);
            window.appCanChoosePaymentReceiver = @json(Auth::user()?->canChoosePaymentReceiver() ?? false);
            window.appCanManageCustomerWifi = @json(Auth::user() ? app(\App\Services\AccessPolicyService::class)->has(Auth::user(), 'customer.wifi.manage') : false);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('appUserName', "{{ Auth::user()?->name ?? 'User' }}");
            }
        </script>
        <div class="min-h-screen flex flex-col">
            @if(!(isset($hideNavbar) && $hideNavbar))
                @include('layouts.navigation')
            @endif

            <!-- Page Heading -->
            @isset($header)
                <header class="bg-white shadow w-full">
                    <div class="max-w-7xl mx-auto py-4 px-3 sm:px-6 lg:px-8">
                        {{ $header }}
                    </div>
                </header>
            @endisset

            <!-- Page Content -->
            <main class="flex-1 w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4">
                {{ $slot }}
            </main>
        </div>
        @yield('scripts')
    </body>
</html>
