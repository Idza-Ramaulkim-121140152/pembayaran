@section('title', 'Daftar Pelanggan')
<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Daftar Pelanggan') }}
        </h2>
    </x-slot>
<div class="container mx-auto py-6">
    @if(session('success'))
        <div class="mb-4 p-3 rounded bg-green-100 text-green-700 text-sm text-center">
            {{ session('success') }}
        </div>
    @endif
    <form method="GET" action="" class="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input type="text" name="search" value="{{ request('search') }}" placeholder="Cari nama, PPPoE, atau No WA..." class="border rounded px-2 py-1 w-full sm:w-64 text-xs sm:text-sm" />
        <select name="sort" class="border rounded px-2 py-1 text-xs sm:text-sm">
            <option value="">Urutkan...</option>
            <option value="name_asc" {{ request('sort')=='name_asc' ? 'selected' : '' }}>Nama A-Z</option>
            <option value="name_desc" {{ request('sort')=='name_desc' ? 'selected' : '' }}>Nama Z-A</option>
            <option value="due_asc" {{ request('sort')=='due_asc' ? 'selected' : '' }}>Jatuh Tempo Terdekat</option>
            <option value="due_desc" {{ request('sort')=='due_desc' ? 'selected' : '' }}>Jatuh Tempo Terjauh</option>
        </select>
        <button type="submit" class="bg-blue-500 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">Cari/Urutkan</button>
    </form>
    <div class="overflow-x-auto">
        <table class="min-w-full bg-white border rounded shadow text-xs sm:text-sm">
            <thead class="bg-gray-100">
                <tr>
                    <th class="px-4 py-2">No</th>
                    <th class="px-4 py-2">
                        <a href="?sort={{ request('sort')=='name_asc' ? 'name_desc' : 'name_asc' }}{{ request('search') ? '&search='.urlencode(request('search')) : '' }}" class="hover:underline flex items-center gap-1">
                            Nama
                            @if(request('sort')=='name_asc')
                                <span>&uarr;</span>
                            @elseif(request('sort')=='name_desc')
                                <span>&darr;</span>
                            @endif
                        </a>
                    </th>
                    <th class="px-4 py-2">
                        <a href="?sort={{ request('sort')=='pppoe_asc' ? 'pppoe_desc' : 'pppoe_asc' }}{{ request('search') ? '&search='.urlencode(request('search')) : '' }}" class="hover:underline flex items-center gap-1">
                            PPPoE
                            @if(request('sort')=='pppoe_asc')
                                <span>&uarr;</span>
                            @elseif(request('sort')=='pppoe_desc')
                                <span>&darr;</span>
                            @endif
                        </a>
                    </th>
                    <th class="px-4 py-2">
                        <a href="?sort={{ request('sort')=='wa_asc' ? 'wa_desc' : 'wa_asc' }}{{ request('search') ? '&search='.urlencode(request('search')) : '' }}" class="hover:underline flex items-center gap-1">
                            No WA
                            @if(request('sort')=='wa_asc')
                                <span>&uarr;</span>
                            @elseif(request('sort')=='wa_desc')
                                <span>&darr;</span>
                            @endif
                        </a>
                    </th>
                    <th class="px-4 py-2">
                        <a href="?sort={{ request('sort')=='due_asc' ? 'due_desc' : 'due_asc' }}{{ request('search') ? '&search='.urlencode(request('search')) : '' }}" class="hover:underline flex items-center gap-1">
                            Aktif Sampai
                            @if(request('sort')=='due_asc')
                                <span>&uarr;</span>
                            @elseif(request('sort')=='due_desc')
                                <span>&darr;</span>
                            @endif
                        </a>
                    </th>
                    <th class="px-4 py-2">Action</th>
                </tr>
            </thead>
            <tbody>
                @foreach($customers as $i => $customer)
                    @php
                        $due = $customer->due_date ? \Carbon\Carbon::parse($customer->due_date) : null;
                        $today = \Carbon\Carbon::today();
                        $color = 'bg-gray-200 text-gray-700';
                        if($due) {
                            if($due->isToday()) {
                                $color = 'bg-orange-100 text-orange-700';
                            } elseif($due->isPast()) {
                                $color = 'bg-red-100 text-red-700';
                            } elseif($due->isFuture()) {
                                $color = 'bg-green-100 text-green-700';
                            }
                        }
                    @endphp
                    <tr>
                        <td class="px-4 py-2">{{ $i+1 }}</td>
                        <td class="px-4 py-2">{{ $customer->name }}</td>
                        <td class="px-4 py-2">{{ $customer->pppoe_username }}</td>
                        <td class="px-4 py-2">{{ $customer->phone }}</td>
                        <td class="px-4 py-2">
                            <span class="px-2 py-1 rounded {{ $color }}">
                                {{ $due ? $due->format('d-m-Y') : '-' }}
                            </span>
                        </td>
                        <td class="px-4 py-2 flex gap-2">
                            <button type="button"
                                class="bg-green-600 hover:bg-green-800 text-white px-3 py-1 rounded text-xs detail-btn"
                                data-customer='@json($customer)'
                                data-photo-front="{{ $customer->photo_front ? asset('storage/'.$customer->photo_front) : '' }}"
                                data-photo-modem="{{ $customer->photo_modem ? asset('storage/'.$customer->photo_modem) : '' }}"
                                data-photo-opm="{{ $customer->photo_opm ? asset('storage/'.$customer->photo_opm) : '' }}"
                                data-photo-ktp="{{ $customer->photo_ktp ? asset('storage/'.$customer->photo_ktp) : '' }}"
                            >Lihat Detail</button>
                            <a href="{{ route('customers.edit', $customer->id) }}" class="bg-blue-500 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">Edit</a>
                            <a href="{{ route('customers.riwayat', $customer->id) }}" class="bg-gray-500 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs">Riwayat Pembayaran</a>
                            <a href="https://wa.me/{{ preg_replace('/[^0-9]/', '', $customer->phone) }}" target="_blank" class="bg-green-500 hover:bg-green-700 text-white px-3 py-1 rounded text-xs">Hubungi</a>
                            <button type="button" class="bg-red-600 hover:bg-red-800 text-white px-3 py-1 rounded text-xs delete-btn" data-id="{{ $customer->id }}" data-name="{{ $customer->name }}">Hapus</button>
                        </td>
<!-- Modal Konfirmasi Hapus -->
<div id="deleteModal" class="fixed z-50 inset-0 bg-black bg-opacity-40 flex items-center justify-center hidden">
    <div class="bg-white rounded-lg shadow-lg max-w-md w-full p-6 relative">
        <button onclick="closeDeleteModal()" class="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-xl">&times;</button>
        <h3 class="text-lg font-bold mb-4">Konfirmasi Hapus</h3>
        <p id="deleteText" class="mb-4">Yakin ingin menghapus pelanggan ini?</p>
        <form id="deleteForm" method="POST" action="">
            @csrf
            @method('DELETE')
            <div class="flex gap-2 justify-end">
                <button type="button" onclick="closeDeleteModal()" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Batal</button>
                <button type="submit" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Hapus</button>
            </div>
        </form>
    </div>
</div>
<script>
function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
}
document.querySelectorAll('.delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var name = this.getAttribute('data-name');
        document.getElementById('deleteText').innerText = 'Yakin ingin menghapus pelanggan "' + name + '"?';
        document.getElementById('deleteForm').action = '/pelanggan/' + id + '/delete';
        document.getElementById('deleteModal').classList.remove('hidden');
    });
});
</script>
<!-- Modal Detail Pelanggan -->
<div id="detailModal" class="fixed z-50 inset-0 bg-black bg-opacity-40 flex items-center justify-center hidden">
    <div class="bg-white rounded-lg shadow-lg max-w-2xl w-full p-6 relative overflow-y-auto max-h-[90vh]">
        <button onclick="closeModal()" class="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-xl">&times;</button>
        <h3 class="text-lg font-bold mb-2">Detail Pelanggan</h3>
        <div id="modalContent" class="space-y-2 text-sm">
            <!-- Konten diisi via JS -->
        </div>
    </div>
</div>
<script>
function closeModal() {
    document.getElementById('detailModal').classList.add('hidden');
}
document.querySelectorAll('.detail-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        const data = JSON.parse(this.getAttribute('data-customer'));
        const modal = document.getElementById('detailModal');
        let html = '';
        html += `<div class='grid grid-cols-1 sm:grid-cols-2 gap-2'>`;
        html += `<div><b>Nama:</b> ${data.name}</div>`;
        html += `<div><b>Tanggal Aktivasi:</b> ${data.activation_date ?? '-'}</div>`;
        html += `<div><b>Jatuh Tempo:</b> ${data.due_date ?? '-'}</div>`;
        html += `<div><b>NIK:</b> ${data.nik ?? '-'}</div>`;
        html += `<div><b>Jenis Kelamin:</b> ${data.gender ?? '-'}</div>`;
        html += `<div><b>Alamat:</b> ${data.address ?? '-'}</div>`;
        html += `<div><b>Jenis Paket:</b> ${data.package_type ?? '-'}</div>`;
        if(data.package_type === 'Paket Custom') html += `<div><b>Paket Custom:</b> ${data.custom_package ?? '-'}</div>`;
        html += `<div><b>Username PPPoE:</b> ${data.pppoe_username ?? '-'}</div>`;
        html += `<div><b>ODP:</b> ${data.odp ?? '-'}</div>`;
        html += `<div><b>No WA:</b> ${data.phone ?? '-'}</div>`;
        html += `<div><b>Biaya Pemasangan:</b> ${data.installation_fee ?? '-'}</div>`;
        html += `<div><b>Email:</b> ${data.email ?? '-'}</div>`;
        html += `<div><b>Koordinat:</b> ${data.latitude ?? '-'}, ${data.longitude ?? '-'}</div>`;
        html += `</div>`;
        // Foto
        html += `<div class='grid grid-cols-2 gap-2 mt-2'>`;
        if(this.getAttribute('data-photo-front')) html += `<div><b>Foto Depan Rumah:</b><br><img src='${this.getAttribute('data-photo-front')}' class='rounded border max-h-32'></div>`;
        if(this.getAttribute('data-photo-modem')) html += `<div><b>Foto Modem:</b><br><img src='${this.getAttribute('data-photo-modem')}' class='rounded border max-h-32'></div>`;
        if(this.getAttribute('data-photo-opm')) html += `<div><b>Foto Redaman OPM:</b><br><img src='${this.getAttribute('data-photo-opm')}' class='rounded border max-h-32'></div>`;
        if(this.getAttribute('data-photo-ktp')) html += `<div><b>Foto KTP:</b><br><img src='${this.getAttribute('data-photo-ktp')}' class='rounded border max-h-32'></div>`;
        html += `</div>`;
        // Peta
        if(data.latitude && data.longitude) {
            html += `<div class='mt-2'><b>Lokasi Rumah di Peta:</b><div id='mapDetail' style='height:220px;border-radius:8px;'></div></div>`;
        }
        document.getElementById('modalContent').innerHTML = html;
        modal.classList.remove('hidden');
        // Render peta jika ada koordinat
        if(data.latitude && data.longitude) {
            setTimeout(function() {
                if(window.detailMap) window.detailMap.remove();
                window.detailMap = L.map('mapDetail').setView([data.latitude, data.longitude], 17);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(window.detailMap);
                L.marker([data.latitude, data.longitude]).addTo(window.detailMap);
            }, 200);
        }
    });
});
</script>
<!-- Leaflet CSS & JS untuk modal detail -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
</div>
</x-app-layout>
