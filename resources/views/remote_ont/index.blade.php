<x-app-layout>
    <x-slot name="header">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
                <h2 class="font-bold text-2xl text-gray-800 leading-tight flex items-center gap-2">
                    <svg class="h-7 w-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2zM9 9h6M9 13h6"/>
                    </svg>
                    Remote ONT Web Gateway
                </h2>
                <p class="text-sm text-gray-500 mt-1">
                    Akses langsung web interface ONT pelanggan dari internal server & MikroTik PPPoE tanpa port forwarding.
                </p>
            </div>
            <div class="flex items-center gap-2">
                <a href="{{ route('remote-ont.index', ['refresh' => 1]) }}" class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition">
                    <svg class="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    Refresh MikroTik Data
                </a>
            </div>
        </div>
    </x-slot>

    <div class="space-y-6">
        <!-- Top Stats Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Terdaftar</span>
                    <div class="text-2xl font-bold text-gray-800 mt-1" id="stat-total">{{ $totalDevices }}</div>
                    <span class="text-xs text-gray-400">Secret & Sesi PPPoE</span>
                </div>
                <div class="p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                </div>
            </div>

            <div class="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <span class="text-xs font-semibold text-green-600 uppercase tracking-wider">ONT Online</span>
                    <div class="text-2xl font-bold text-green-700 mt-1" id="stat-online">{{ $totalOnline }}</div>
                    <span class="text-xs text-green-600/80">Koneksi Aktif di MikroTik</span>
                </div>
                <div class="p-3 bg-green-50 text-green-600 rounded-xl">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
            </div>

            <div class="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">ONT Offline</span>
                    <div class="text-2xl font-bold text-gray-600 mt-1" id="stat-offline">{{ max(0, $totalDevices - $totalOnline) }}</div>
                    <span class="text-xs text-gray-400">Belum Ada Sesi Aktif</span>
                </div>
                <div class="p-3 bg-gray-50 text-gray-500 rounded-xl">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                </div>
            </div>
        </div>

        <!-- Quick Remote Box (Manual IP) -->
        <div class="bg-gradient-to-r from-blue-900 to-indigo-800 rounded-2xl p-6 text-white shadow-lg">
            <div class="max-w-3xl">
                <div class="flex items-center gap-2 mb-2">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/30 text-blue-200 border border-blue-400/30">
                        Akses Cepat
                    </span>
                    <span class="text-xs text-blue-200">Koneksi Langsung Lewat Reverse Proxy Server</span>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">Buka Web Interface ONT Secara Manual</h3>
                <p class="text-sm text-blue-100 mb-5">
                    Masukkan IP target ONT (contoh: <code class="bg-blue-950/60 px-1.5 py-0.5 rounded font-mono text-xs">10.1.0.80</code> atau <code class="bg-blue-950/60 px-1.5 py-0.5 rounded font-mono text-xs">10.1.0.10</code>). Server Ubuntu akan membuka halaman web manajemen ONT untuk Anda.
                </p>

                <form id="quickConnectForm" onsubmit="event.preventDefault(); openManualGateway();" class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div class="sm:col-span-6">
                        <label class="block text-xs font-semibold text-blue-100 uppercase tracking-wider mb-1">Target IP ONT</label>
                        <div class="relative">
                            <input type="text" id="manualIpInput" placeholder="Contoh: 10.1.0.80" required
                                class="w-full pl-9 pr-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/60 focus:bg-white/20 focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm font-mono transition" />
                            <svg class="h-4 w-4 text-blue-300 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
                        </div>
                    </div>

                    <div class="sm:col-span-2">
                        <label class="block text-xs font-semibold text-blue-100 uppercase tracking-wider mb-1">Port</label>
                        <input type="number" id="manualPortInput" value="80" min="1" max="65535" required
                            class="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/60 focus:bg-white/20 focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm font-mono transition" />
                    </div>

                    <div class="sm:col-span-4 flex gap-2">
                        <button type="button" onclick="testManualPing()" id="btnTestPing"
                            class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white/15 hover:bg-white/25 border border-white/30 rounded-xl text-sm font-semibold text-white transition active:scale-95">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            <span>Tes Ping</span>
                        </button>
                        <button type="submit" id="btnOpenGateway"
                            class="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-sm font-semibold shadow-md transition active:scale-95">
                            <span>Buka Web</span>
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        </button>
                    </div>
                </form>

                <!-- Ping Result Alert -->
                <div id="pingResultBox" class="hidden mt-4 p-3 rounded-xl text-sm flex items-center gap-3"></div>
            </div>
        </div>

        <!-- PPPoE Customer List Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <!-- Table Controls -->
            <div class="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div class="flex items-center gap-3">
                    <div class="relative w-full sm:w-80">
                        <input type="text" id="searchInput" placeholder="Cari nama, PPPoE, IP, atau MAC..." onkeyup="filterTable()"
                            class="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition" />
                        <svg class="h-4 w-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <button type="button" onclick="clearSearch()" id="clearSearchBtn" class="hidden absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>

                    <!-- Status Filter Tabs -->
                    <div class="inline-flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
                        <button type="button" onclick="setStatusFilter('all')" id="filter-tab-all" class="px-3 py-1.5 rounded-lg bg-white shadow-sm text-blue-600 transition">
                            Semua (<span id="count-filter-all">{{ $totalDevices }}</span>)
                        </button>
                        <button type="button" onclick="setStatusFilter('online')" id="filter-tab-online" class="px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 transition">
                            Online (<span id="count-filter-online">{{ $totalOnline }}</span>)
                        </button>
                        <button type="button" onclick="setStatusFilter('offline')" id="filter-tab-offline" class="px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 transition">
                            Offline (<span id="count-filter-offline">{{ max(0, $totalDevices - $totalOnline) }}</span>)
                        </button>
                    </div>
                </div>

                <div class="text-xs text-gray-400 flex items-center gap-1.5">
                    <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                    <span>Klik <strong>"Buka Web ONT"</strong> untuk membuka halaman ONT lewat gateway internal</span>
                </div>
            </div>

            <!-- Table -->
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-gray-600">
                    <thead class="bg-gray-50/75 text-xs uppercase font-semibold text-gray-500 tracking-wider border-b border-gray-100">
                        <tr>
                            <th class="py-3.5 px-4">Status</th>
                            <th class="py-3.5 px-4">Pelanggan / PPPoE Secret</th>
                            <th class="py-3.5 px-4">IP Remote ONT</th>
                            <th class="py-3.5 px-4">MAC / Caller ID</th>
                            <th class="py-3.5 px-4">Profile</th>
                            <th class="py-3.5 px-4">Uptime</th>
                            <th class="py-3.5 px-4 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="deviceTableBody" class="divide-y divide-gray-100">
                        @forelse($devices as $device)
                        <tr class="hover:bg-blue-50/40 transition duration-150 device-row" 
                            data-username="{{ strtolower($device['username']) }}"
                            data-customer="{{ strtolower($device['customer_name']) }}"
                            data-ip="{{ $device['remote_ip'] }}"
                            data-caller="{{ strtolower($device['caller_id']) }}"
                            data-online="{{ $device['is_online'] ? '1' : '0' }}">
                            
                            <!-- Status -->
                            <td class="py-3.5 px-4 whitespace-nowrap">
                                @if($device['is_online'])
                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                                        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                        Online
                                    </span>
                                @else
                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                                        <span class="w-2 h-2 rounded-full bg-gray-400"></span>
                                        Offline
                                    </span>
                                @endif
                            </td>

                            <!-- Customer & Secret -->
                            <td class="py-3.5 px-4">
                                <div class="font-semibold text-gray-900">{{ $device['customer_name'] }}</div>
                                <div class="text-xs font-mono text-gray-500 flex items-center gap-1">
                                    <svg class="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                                    {{ $device['username'] }}
                                </div>
                            </td>

                            <!-- IP Address -->
                            <td class="py-3.5 px-4 whitespace-nowrap">
                                <div class="flex items-center gap-2">
                                    <span class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-200">
                                        {{ $device['remote_ip'] }}
                                    </span>
                                    <button type="button" onclick="testInlinePing('{{ $device['remote_ip'] }}', this)" title="Tes Ping ke ONT"
                                        class="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
                                        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                    </button>
                                </div>
                                <div class="inline-ping-result text-xs mt-0.5 hidden"></div>
                            </td>

                            <!-- MAC / Caller ID -->
                            <td class="py-3.5 px-4 whitespace-nowrap text-xs font-mono text-gray-500">
                                {{ $device['caller_id'] ?: '-' }}
                            </td>

                            <!-- Profile -->
                            <td class="py-3.5 px-4 whitespace-nowrap">
                                <span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                    {{ $device['profile'] ?: 'default' }}
                                </span>
                            </td>

                            <!-- Uptime -->
                            <td class="py-3.5 px-4 whitespace-nowrap text-xs text-gray-500">
                                {{ $device['uptime'] }}
                            </td>

                            <!-- Actions -->
                            <td class="py-3.5 px-4 whitespace-nowrap text-center">
                                <a href="{{ route('remote-ont.proxy', ['ip' => $device['remote_ip']]) }}" target="_blank"
                                    class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition active:scale-95">
                                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                    <span>Buka Web ONT</span>
                                </a>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="7" class="text-center py-10 text-gray-400">
                                <div class="flex flex-col items-center">
                                    <svg class="h-10 w-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                    <p class="font-medium">Belum ada data perangkat yang dapat ditampilkan.</p>
                                    <p class="text-xs text-gray-400 mt-1">Gunakan kotak "Quick Connect" di atas untuk mengakses langsung IP ONT.</p>
                                </div>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            <div id="noMatchRow" class="hidden text-center py-8 text-gray-400 border-t border-gray-100">
                <p class="text-sm font-medium">Tidak ada perangkat yang sesuai dengan kata kunci pencarian.</p>
            </div>
        </div>
    </div>

    <!-- Client-side script for Live Filter & Ping Tester -->
    <script>
        let currentStatusFilter = 'all';

        function setStatusFilter(filter) {
            currentStatusFilter = filter;
            ['all', 'online', 'offline'].forEach(f => {
                const tab = document.getElementById('filter-tab-' + f);
                if (f === filter) {
                    tab.className = 'px-3 py-1.5 rounded-lg bg-white shadow-sm text-blue-600 transition';
                } else {
                    tab.className = 'px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 transition';
                }
            });
            filterTable();
        }

        function filterTable() {
            const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
            const clearBtn = document.getElementById('clearSearchBtn');
            clearBtn.style.display = query ? 'block' : 'none';

            const rows = document.querySelectorAll('.device-row');
            let visibleCount = 0;

            rows.forEach(row => {
                const username = row.getAttribute('data-username') || '';
                const customer = row.getAttribute('data-customer') || '';
                const ip = row.getAttribute('data-ip') || '';
                const caller = row.getAttribute('data-caller') || '';
                const isOnline = row.getAttribute('data-online') === '1';

                const matchesQuery = !query || 
                    username.includes(query) || 
                    customer.includes(query) || 
                    ip.includes(query) || 
                    caller.includes(query);

                let matchesFilter = true;
                if (currentStatusFilter === 'online') {
                    matchesFilter = isOnline;
                } else if (currentStatusFilter === 'offline') {
                    matchesFilter = !isOnline;
                }

                if (matchesQuery && matchesFilter) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });

            const noMatchRow = document.getElementById('noMatchRow');
            if (noMatchRow) {
                noMatchRow.classList.toggle('hidden', visibleCount > 0 || rows.length === 0);
            }
        }

        function clearSearch() {
            document.getElementById('searchInput').value = '';
            filterTable();
        }

        function openManualGateway() {
            const ip = document.getElementById('manualIpInput').value.trim();
            const port = document.getElementById('manualPortInput').value.trim() || '80';
            if (!ip) return;

            let url = `/ont-gateway/${encodeURIComponent(ip)}`;
            if (port !== '80') {
                url += `?__port=${encodeURIComponent(port)}`;
            }
            window.open(url, '_blank');
        }

        async function testManualPing() {
            const ip = document.getElementById('manualIpInput').value.trim();
            const port = document.getElementById('manualPortInput').value.trim() || '80';
            const btn = document.getElementById('btnTestPing');
            const resultBox = document.getElementById('pingResultBox');

            if (!ip) {
                alert('Silakan masukkan target IP ONT terlebih dahulu.');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<span class="inline-block animate-spin">&#9696;</span><span>Mengecek...</span>';
            resultBox.className = 'mt-4 p-3 rounded-xl text-sm flex items-center gap-2 bg-white/10 text-white border border-white/20';
            resultBox.innerHTML = `<span>Sedang mengetes konektivitas ke ${ip}:${port}...</span>`;
            resultBox.classList.remove('hidden');

            try {
                const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
                const response = await fetch('/api/remote-ont/check-ping', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': token,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ ip, port })
                });

                const data = await response.json();
                if (data.online) {
                    resultBox.className = 'mt-4 p-3 rounded-xl text-sm flex items-center gap-2 bg-green-500/20 text-green-200 border border-green-400/30';
                    resultBox.innerHTML = `
                        <svg class="h-5 w-5 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        <div>
                            <strong>Port ${port} Terbuka Aktif!</strong> Latensi: ${data.latency_ms} ms. Web ONT siap diakses.
                        </div>
                    `;
                } else {
                    resultBox.className = 'mt-4 p-3 rounded-xl text-sm flex items-center gap-2 bg-red-500/20 text-red-200 border border-red-400/30';
                    resultBox.innerHTML = `
                        <svg class="h-5 w-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        <div>
                            <strong>Tidak Ada Respon di Port ${port}.</strong> ${data.message || 'Perangkat mungkin mati atau memblokir port HTTP.'}
                        </div>
                    `;
                }
            } catch (err) {
                resultBox.className = 'mt-4 p-3 rounded-xl text-sm flex items-center gap-2 bg-red-500/20 text-red-200 border border-red-400/30';
                resultBox.innerHTML = `<span>Gagal melakukan tes ping: ${err.message}</span>`;
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg><span>Tes Ping</span>';
            }
        }

        async function testInlinePing(ip, btnElement) {
            const td = btnElement.closest('td');
            const resultDiv = td.querySelector('.inline-ping-result');
            resultDiv.classList.remove('hidden');
            resultDiv.className = 'inline-ping-result text-xs mt-0.5 text-gray-400 font-mono';
            resultDiv.innerText = 'Pinging...';

            try {
                const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
                const response = await fetch('/api/remote-ont/check-ping', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': token,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ ip, port: 80 })
                });
                const data = await response.json();
                if (data.online) {
                    resultDiv.className = 'inline-ping-result text-xs mt-0.5 text-green-600 font-semibold font-mono';
                    resultDiv.innerText = `● Aktif (${data.latency_ms} ms)`;
                } else {
                    resultDiv.className = 'inline-ping-result text-xs mt-0.5 text-red-500 font-mono';
                    resultDiv.innerText = `✕ Timeout (Port 80 tertutup)`;
                }
            } catch (err) {
                resultDiv.className = 'inline-ping-result text-xs mt-0.5 text-red-500 font-mono';
                resultDiv.innerText = '✕ Error ping';
            }
        }
    </script>
</x-app-layout>