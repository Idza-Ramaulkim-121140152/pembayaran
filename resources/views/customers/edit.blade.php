@section('title', 'Edit Data Pelanggan')
<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Edit Data Pelanggan') }}
        </h2>
    </x-slot>
<div class="max-w-lg mx-auto py-6">
    @if($errors->any())
        <div class="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm">
            <ul class="list-disc pl-5">
                @foreach($errors->all() as $error)
                    <li>{{ $error }}</li>
                @endforeach
            </ul>
        </div>
    @endif
    <form method="POST" action="{{ route('customers.update', $customer->id) }}" enctype="multipart/form-data" class="space-y-4" id="form-edit-pelanggan">
        @csrf
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium mb-1">Nama Pelanggan</label>
                <input type="text" name="name" value="{{ old('name', $customer->name) }}" required class="border rounded px-3 py-2 w-full" />
            </div>
            <div>
                <label class="block font-medium mb-1">Tanggal Aktivasi</label>
                <input type="date" name="activation_date" id="activation_date" value="{{ old('activation_date', $customer->activation_date ? \Carbon\Carbon::parse($customer->activation_date)->format('Y-m-d') : '' ) }}" required class="border rounded px-3 py-2 w-full" />
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium mb-1">Jatuh Tempo</label>
                <input type="date" name="due_date" id="due_date" value="{{ old('due_date', $customer->due_date ? \Carbon\Carbon::parse($customer->due_date)->format('Y-m-d') : '' ) }}" required class="border rounded px-3 py-2 w-full bg-gray-100" />
            </div>
            <div>
                <label class="block font-medium mb-1">NIK Pelanggan</label>
                <input type="text" name="nik" value="{{ old('nik', $customer->nik) }}" required class="border rounded px-3 py-2 w-full" />
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium mb-1">Jenis Kelamin</label>
                <div class="flex gap-4 mt-1">
                    <label><input type="radio" name="gender" value="Pria" {{ old('gender', $customer->gender)==='Pria' ? 'checked' : '' }}> Pria</label>
                    <label><input type="radio" name="gender" value="Wanita" {{ old('gender', $customer->gender)==='Wanita' ? 'checked' : '' }}> Wanita</label>
                </div>
            </div>
            <div>
                <label class="block font-medium mb-1">Alamat (Desa, Dusun)</label>
                <textarea name="address" required class="border rounded px-3 py-2 w-full">{{ old('address', $customer->address) }}</textarea>
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium mb-1">Jenis Paket</label>
                <select name="package_type" id="package_type" required class="border rounded px-3 py-2 w-full">
                    <option value="">-- Pilih Paket --</option>
                    <option value="Paket 175k" {{ old('package_type', $customer->package_type)==='Paket 175k' ? 'selected' : '' }}>Paket 175k</option>
                    <option value="Paket 200k" {{ old('package_type', $customer->package_type)==='Paket 200k' ? 'selected' : '' }}>Paket 200k</option>
                    <option value="Paket 250k" {{ old('package_type', $customer->package_type)==='Paket 250k' ? 'selected' : '' }}>Paket 250k</option>
                    <option value="Paket Custom" {{ old('package_type', $customer->package_type)==='Paket Custom' ? 'selected' : '' }}>Paket Custom</option>
                </select>
            </div>
            <div id="custom_package_div" style="display:{{ old('package_type', $customer->package_type)==='Paket Custom' ? '' : 'none' }};">
                <label class="block font-medium mb-1">Jenis Paket Custom</label>
                <input type="text" name="custom_package" id="custom_package_input" value="{{ old('custom_package', $customer->custom_package) }}" class="border rounded px-3 py-2 w-full" />
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium mb-1">Foto Depan Rumah</label>
                @if($customer->photo_front)
                    <img src="{{ asset('storage/'.$customer->photo_front) }}" alt="Foto Depan Rumah" class="mb-2 rounded w-32 h-20 object-cover">
                @endif
                <input type="file" name="photo_front" accept="image/*" class="border rounded px-3 py-2 w-full" />
            </div>
            <div>
                <label class="block font-medium mb-1">Foto Modem</label>
                @if($customer->photo_modem)
                    <img src="{{ asset('storage/'.$customer->photo_modem) }}" alt="Foto Modem" class="mb-2 rounded w-32 h-20 object-cover">
                @endif
                <input type="file" name="photo_modem" accept="image/*" class="border rounded px-3 py-2 w-full" />
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium mb-1">Username PPPoE</label>
                <input type="text" name="pppoe_username" value="{{ old('pppoe_username', $customer->pppoe_username) }}" class="border rounded px-3 py-2 w-full" required />
            </div>
            <div>
                <label class="block font-medium mb-1">ODP</label>
                <select name="odp" class="border rounded px-3 py-2 w-full" required>
                    <option value="">-- Pilih ODP --</option>
                    @foreach($odps as $odp)
                        <option value="{{ $odp->nama }}" {{ old('odp', $customer->odp)==$odp->nama ? 'selected' : '' }}>{{ $odp->nama }}</option>
                    @endforeach
                </select>
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium mb-1">Nomor WhatsApp</label>
                <input type="text" name="phone" value="{{ old('phone', $customer->phone) }}" required class="border rounded px-3 py-2 w-full" />
            </div>
            <div>
                <label class="block font-medium mb-1">Biaya Pemasangan</label>
                <input type="number" name="installation_fee" value="{{ old('installation_fee', $customer->installation_fee) }}" class="border rounded px-3 py-2 w-full" required />
            </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block font-medium mb-1">Foto Redaman OPM</label>
                @if($customer->photo_opm)
                    <img src="{{ asset('storage/'.$customer->photo_opm) }}" alt="Foto OPM" class="mb-2 rounded w-32 h-20 object-cover">
                @endif
                <input type="file" name="photo_opm" accept="image/*" class="border rounded px-3 py-2 w-full" />
            </div>
            <div>
                <label class="block font-medium mb-1">Foto KTP</label>
                @if($customer->photo_ktp)
                    <img src="{{ asset('storage/'.$customer->photo_ktp) }}" alt="Foto KTP" class="mb-2 rounded w-32 h-20 object-cover">
                @endif
                <input type="file" name="photo_ktp" accept="image/*" class="border rounded px-3 py-2 w-full" />
            </div>
        </div>
        <div>
            <label class="block font-medium mb-1">Lokasi Rumah (Pilih di Peta)</label>
            <div id="map" style="height: 300px; border-radius: 8px; margin-bottom: 8px;"></div>
            <input type="hidden" name="latitude" id="latitude" value="{{ old('latitude', $customer->latitude) }}" required />
            <input type="hidden" name="longitude" id="longitude" value="{{ old('longitude', $customer->longitude) }}" required />
            <div class="text-xs text-gray-500">Geser marker ke lokasi rumah pelanggan.</div>
        </div>
        <!-- Leaflet CSS & JS -->
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
            // Inisialisasi peta Leaflet
            var defaultLat = {{ old('latitude', $customer->latitude ?? -5.576003) }};
            var defaultLng = {{ old('longitude', $customer->longitude ?? 105.470091) }};
            var map = L.map('map').setView([defaultLat, defaultLng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
            var marker = L.marker([defaultLat, defaultLng], {draggable:true}).addTo(map);
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
        <div class="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <a href="{{ route('customers.list') }}" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Batal</a>
            <button type="submit" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded transition-colors duration-150 text-sm">Simpan</button>
        </div>
    </form>
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
</div>
</x-app-layout>
