<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
    @auth
    <meta name="user-name" content="{{ auth()->user()->name }}">
    @endauth
    <title>Sistem Pembayaran</title>

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.jsx'])
</head>
<body>
    <div id="app"></div>
    @auth
    <script>
        window.appUser = @json(auth()->user()->name);
        window.appUserId = @json(auth()->id());
        window.appUserRole = @json(auth()->user()->role);
        window.appUserEmail = @json(auth()->user()->email);
        window.appCanEditMutations = @json(auth()->user()->canEditMutations());
        window.appCanChoosePaymentMutation = @json(auth()->user()->canChoosePaymentMutation());
        window.appCanChoosePaymentReceiver = @json(auth()->user()->canChoosePaymentReceiver());
        window.appCanManageCustomerWifi = @json(app(\App\Services\AccessPolicyService::class)->has(auth()->user(), 'customer.wifi.manage'));
        window.isAuthenticated = true;
    </script>
    @else
    <script>
        window.isAuthenticated = false;
    </script>
    @endauth
</body>
</html>
