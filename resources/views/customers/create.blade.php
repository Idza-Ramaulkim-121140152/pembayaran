
@section('title', 'Aktivasi / Tambah Pelanggan')
<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Aktivasi / Tambah Pelanggan') }}
        </h2>
    </x-slot>

    <div class="py-6 px-2 sm:px-0">
        <div class="max-w-2xl mx-auto w-full sm:px-6 lg:px-8">
            <div class="bg-white overflow-hidden shadow-sm rounded-lg">
                <div class="p-4 sm:p-6 text-gray-900">
                    <form method="POST" action="{{ route('customers.store') }}" enctype="multipart/form-data" class="space-y-4" id="form-aktivasi">
                        @csrf
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block font-medium mb-1">Nama Pelanggan</label>
                                <input type="text" name="name" required class="border rounded px-3 py-2 w-full" />
                            </div>
                            <div>
                                <label class="block font-medium mb-1">Tanggal Aktivasi</label>
                                <input type="date" name="activation_date" id="activation_date" required class="border rounded px-3 py-2 w-full" />
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block font-medium mb-1">Jatuh Tempo</label>
                                <input type="date" name="due_date" id="due_date" readonly required class="border rounded px-3 py-2 w-full bg-gray-100" />
                            </div>
                            <div>
                                <label class="block font-medium mb-1">NIK Pelanggan</label>
                                <input type="text" name="nik" required class="border rounded px-3 py-2 w-full" />
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block font-medium mb-1">Jenis Kelamin</label>
                                <div class="flex gap-4 mt-1">
                                    <label><input type="radio" name="gender" value="Pria" required> Pria</label>
                                    <label><input type="radio" name="gender" value="Wanita" required> Wanita</label>
                                </div>
                            </div>
                            <div>
                                <label class="block font-medium mb-1">Alamat (Desa, Dusun)</label>
                                <textarea name="address" required class="border rounded px-3 py-2 w-full"></textarea>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block font-medium mb-1">Jenis Paket</label>
                                <select name="package_type" id="package_type" required class="border rounded px-3 py-2 w-full">
                                    <option value="">-- Pilih Paket --</option>
                                    <option value="Paket 175k">Paket 175k</option>
                                    <option value="Paket 200k">Paket 200k</option>
                                    <option value="Paket 250k">Paket 250k</option>
                                    <option value="Paket Custom">Paket Custom</option>
                                </select>
                            </div>
                            <div id="custom_package_div" style="display:none;">
                                <label class="block font-medium mb-1">Jenis Paket Custom</label>
                                <input type="text" name="custom_package" id="custom_package_input" class="border rounded px-3 py-2 w-full" />
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block font-medium mb-1">Foto Depan Rumah</label>
                                <input type="file" name="photo_front" accept="image/*" class="border rounded px-3 py-2 w-full" required />
                            </div>
                            <div>
                                <label class="block font-medium mb-1">Foto Modem</label>
                                <input type="file" name="photo_modem" accept="image/*" class="border rounded px-3 py-2 w-full" required />
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block font-medium mb-1">Username PPPoE</label>
                                <input type="text" name="pppoe_username" class="border rounded px-3 py-2 w-full" required />
                            </div>
                            <div>
                                <label class="block font-medium mb-1">ODP</label>
                                <select name="odp" class="border rounded px-3 py-2 w-full" required>
                                    <option value="">-- Pilih ODP --</option>
                                    @foreach($odps as $odp)
                                        <option value="{{ $odp->nama }}">{{ $odp->nama }}</option>
                                    @endforeach
                                </select>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block font-medium mb-1">Nomor WhatsApp</label>
                                <input type="text" name="phone" required class="border rounded px-3 py-2 w-full" />
                            </div>
                            <div>
                                <label class="block font-medium mb-1">Biaya Pemasangan</label>
                                <input type="number" name="installation_fee" class="border rounded px-3 py-2 w-full" required />
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block font-medium mb-1">Foto Redaman OPM</label>
                                <input type="file" name="photo_opm" accept="image/*" class="border rounded px-3 py-2 w-full" required />
                            </div>
                            <div>
                                <label class="block font-medium mb-1">Foto KTP</label>
                                <input type="file" name="photo_ktp" accept="image/*" class="border rounded px-3 py-2 w-full" required />
                        <div>
                            <label class="block font-medium mb-1">Lokasi Rumah (Pilih di Peta)</label>
                            <div id="map" style="height: 300px; border-radius: 8px; margin-bottom: 8px;"></div>
                            <input type="hidden" name="latitude" id="latitude" required />
                            <input type="hidden" name="longitude" id="longitude" required />
                            <div class="text-xs text-gray-500">Geser marker ke lokasi rumah pelanggan.</div>
                        </div>
    <!-- Leaflet CSS & JS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Inisialisasi peta Leaflet
    var defaultLat = -5.576003; // Kalianda, Lampung Selatan
    var defaultLng = 105.470091;
    var map = L.map('map').setView([defaultLat, defaultLng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        var marker = L.marker([defaultLat, defaultLng], {draggable:true}).addTo(map);
        // Set input value awal
        document.getElementById('latitude').value = defaultLat;
        document.getElementById('longitude').value = defaultLng;
        marker.on('dragend', function(e) {
            var latlng = marker.getLatLng();
            document.getElementById('latitude').value = latlng.lat;
            document.getElementById('longitude').value = latlng.lng;
        });
        map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            document.getElementById('latitude').value = e.latlng.lat;
            document.getElementById('longitude').value = e.latlng.lng;
        });
    </script>
                            </div>
                        </div>
                        <div class="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                            <button type="submit" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded transition-colors duration-150 text-sm">
                                Simpan & Aktivasi
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Jatuh tempo otomatis = tanggal aktivasi + 30 hari
        document.getElementById('activation_date').addEventListener('change', function() {
            var val = this.value;
            if(val) {
                var date = new Date(val);
                date.setDate(date.getDate() + 30);
                var month = (date.getMonth()+1).toString().padStart(2,'0');
                var day = date.getDate().toString().padStart(2,'0');
                var due = date.getFullYear() + '-' + month + '-' + day;
                document.getElementById('due_date').value = due;
            } else {
                document.getElementById('due_date').value = '';
            }
        });
        // Paket custom logic: required hanya jika Paket Custom
        document.getElementById('package_type').addEventListener('change', function() {
            var customDiv = document.getElementById('custom_package_div');
            var customInput = document.getElementById('custom_package_input');
            if(this.value === 'Paket Custom') {
                customDiv.style.display = '';
                customInput.required = true;
            } else {
                customDiv.style.display = 'none';
                customInput.required = false;
                customInput.value = '';
            }
        });
    </script>
</x-app-layout>
