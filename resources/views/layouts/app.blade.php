<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="user-name" content="{{ Auth::user()?->name ?? 'User' }}">

    <title>@yield('title', (isset($pageTitle) ? $pageTitle : (isset($header) ? strip_tags($header) : config('app.name', 'Laravel'))))</title>

        <!-- Fonts -->
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=figtree:400,500,600&display=swap" rel="stylesheet" />

        <!-- Google AdSense -->
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2060193879936074"
            crossorigin="anonymous"></script>

        <!-- Scripts -->
        @vite(['resources/css/app.css', 'resources/js/main.jsx'])
    </head>
    <body class="font-sans antialiased bg-gray-100">
        <script>
            // Set username to localStorage for React to read
            window.appUser = "{{ Auth::user()?->name ?? 'User' }}";
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
