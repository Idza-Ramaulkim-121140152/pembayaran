<nav class="bg-white shadow-md sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4">
        <div class="flex justify-between items-center h-16">
            <!-- Logo -->
            <div class="flex items-center gap-3">
                <a href="/dashboard" class="flex items-center gap-2">
                    <img src="{{ asset('logo_baru.png') }}" alt="Rumah Kita Net" class="h-10 w-auto" />
                    <span class="font-bold text-lg text-gray-800 hidden sm:inline">Rumah Kita Net</span>
                </a>
            </div>

            <!-- Desktop Menu -->
            <div class="hidden md:flex items-center gap-6">
                <a href="/monitoring" class="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition {{ request()->is('monitoring*') ? 'text-blue-600 font-semibold' : '' }}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    <span>Monitoring</span>
                </a>
                <a href="/dashboard" class="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition {{ request()->is('dashboard') ? 'text-blue-600 font-semibold' : '' }}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 4l4 2m-2-2l-4-2"/></svg>
                    <span>Dashboard</span>
                </a>
                <a href="/penagihan" class="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition {{ request()->is('penagihan*') ? 'text-blue-600 font-semibold' : '' }}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>Penagihan</span>
                </a>
                <a href="/customers" class="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition {{ request()->is('customers') ? 'text-blue-600 font-semibold' : '' }}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 12H9m4 5H9m6 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>Pelanggan</span>
                </a>
                <a href="/customers/create" class="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition {{ request()->is('customers/create') ? 'text-blue-600 font-semibold' : '' }}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    <span>Aktivasi Pelanggan</span>
                </a>
                <a href="/odp" class="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition {{ request()->is('odp*') ? 'text-blue-600 font-semibold' : '' }}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>ODP</span>
                </a>
                <a href="/pengeluaran" class="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition {{ request()->is('pengeluaran*') ? 'text-blue-600 font-semibold' : '' }}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>Pengeluaran</span>
                </a>
            </div>

            <!-- Profile / Logout -->
            <div class="hidden md:flex items-center">
                @if(Auth::check())
                <div class="relative">
                    <button id="blade-profile-btn" class="flex items-center gap-2 text-gray-700 hover:text-blue-600">{{ Auth::user()->name }} <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg></button>
                    <div id="blade-profile-menu" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2">
                        <a href="{{ route('profile.edit') }}" class="block px-4 py-2 text-gray-700 hover:bg-gray-100">Profile</a>
                        <form method="POST" action="{{ route('logout') }}">
                            @csrf
                            <button type="submit" class="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50">Logout</button>
                        </form>
                    </div>
                </div>
                @endif
            </div>

            <!-- Mobile menu button -->
            <div class="md:hidden">
                <button id="blade-mobile-btn" class="text-gray-600">Menu</button>
            </div>
        </div>
    </div>

    <!-- Mobile Menu -->
    <div id="blade-mobile-menu" class="hidden md:hidden bg-white border-t border-gray-200">
        <div class="p-2 space-y-1">
            <a href="/monitoring" class="flex items-center gap-3 px-3 py-2 rounded text-gray-700 hover:bg-gray-50">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                <span>Monitoring</span>
            </a>
            <a href="/dashboard" class="flex items-center gap-3 px-3 py-2 rounded text-gray-700 hover:bg-gray-50">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 4l4 2m-2-2l-4-2"/></svg>
                <span>Dashboard</span>
            </a>
            <a href="/penagihan" class="flex items-center gap-3 px-3 py-2 rounded text-gray-700 hover:bg-gray-50">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>Penagihan</span>
            </a>
            <a href="/customers" class="flex items-center gap-3 px-3 py-2 rounded text-gray-700 hover:bg-gray-50">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 12H9m4 5H9m6 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>Pelanggan</span>
            </a>
            <a href="/customers/create" class="flex items-center gap-3 px-3 py-2 rounded text-gray-700 hover:bg-gray-50">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                <span>Aktivasi Pelanggan</span>
            </a>
            <a href="/odp" class="flex items-center gap-3 px-3 py-2 rounded text-gray-50">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>Manage ODP</span>
            </a>
            <a href="/pengeluaran" class="flex items-center gap-3 px-3 py-2 rounded text-gray-700 hover:bg-gray-50">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>Pengeluaran</span>
            </a>
            @if(Auth::check())
            <a href="{{ route('profile.edit') }}" class="flex items-center gap-3 px-3 py-2 rounded text-gray-700 hover:bg-gray-50">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                <span>Profile</span>
            </a>
            <form method="POST" action="{{ route('logout') }}">
                @csrf
                <button type="submit" class="w-full flex items-center gap-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    <span>Logout</span>
                </button>
            </form>
            @endif
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function(){
            var btn = document.getElementById('blade-mobile-btn');
            var menu = document.getElementById('blade-mobile-menu');
            var profileBtn = document.getElementById('blade-profile-btn');
            var profileMenu = document.getElementById('blade-profile-menu');
            if(btn && menu){ btn.addEventListener('click', function(){ menu.classList.toggle('hidden'); }); }
            if(profileBtn && profileMenu){ profileBtn.addEventListener('click', function(){ profileMenu.classList.toggle('hidden'); }); }
        });
    </script>
</nav>
