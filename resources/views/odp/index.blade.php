<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Manage ODP') }}
        </h2>
    </x-slot>
    <div class="max-w-3xl mx-auto py-6">
        @if(session('success'))
            <div class="mb-4 p-3 rounded bg-green-100 text-green-700 text-sm text-center">
                {{ session('success') }}
            </div>
        @endif
        <form method="POST" action="{{ route('odp.store') }}" enctype="multipart/form-data" class="bg-white rounded shadow p-4 mb-8">
            @csrf
            <div class="mb-3">
                <label class="block font-medium mb-1">Nama ODP</label>
                <input type="text" name="nama" value="{{ old('nama') }}" class="border rounded px-2 py-1 w-full" required />
            </div>
            <div class="mb-3">
                <label class="block font-medium mb-1">Rasio Spesial</label>
                <input type="text" name="rasio_spesial" value="{{ old('rasio_spesial') }}" class="border rounded px-2 py-1 w-full" placeholder="Boleh dikosongkan" />
            </div>
            <div class="mb-3">
                <label class="block font-medium mb-1">Rasio Distribusi</label>
                <select name="rasio_distribusi" class="border rounded px-2 py-1 w-full" required>
                    <option value="">Pilih Rasio</option>
                    <option value="1:2" {{ old('rasio_distribusi')=='1:2' ? 'selected' : '' }}>1:2</option>
                    <option value="1:4" {{ old('rasio_distribusi')=='1:4' ? 'selected' : '' }}>1:4</option>
                    <option value="1:8" {{ old('rasio_distribusi')=='1:8' ? 'selected' : '' }}>1:8</option>
                    <option value="1:16" {{ old('rasio_distribusi')=='1:16' ? 'selected' : '' }}>1:16</option>
                </select>
            </div>
            <div class="mb-3">
                <label class="block font-medium mb-1">Foto ODP</label>
                <input type="file" name="foto" class="border rounded px-2 py-1 w-full" accept="image/*" />
            </div>
            <button type="submit" class="bg-blue-600 hover:bg-blue-800 text-white px-4 py-2 rounded">Tambah ODP</button>
        </form>
        <h3 class="text-lg font-bold mb-2">Daftar ODP</h3>
        <div class="overflow-x-auto">
            <table class="min-w-full bg-white border rounded shadow text-xs sm:text-sm">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="px-4 py-2">Nama ODP</th>
                        <th class="px-4 py-2">Rasio Spesial</th>
                        <th class="px-4 py-2">Rasio Distribusi</th>
                        <th class="px-4 py-2">Foto</th>
                        <th class="px-4 py-2">Status</th>
                        <th class="px-4 py-2">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($odps as $odp)
                        @php
                            $max = (int)str_replace('1:', '', $odp->rasio_distribusi);
                            $status = $odp->customers_count < $max ? 'Tersedia' : 'Penuh';
                        @endphp
                        <tr>
                            <td class="px-4 py-2">{{ $odp->nama }}</td>
                            <td class="px-4 py-2">{{ $odp->rasio_spesial ?? '-' }}</td>
                            <td class="px-4 py-2">{{ $odp->rasio_distribusi }}</td>
                            <td class="px-4 py-2">
                                @if($odp->foto)
                                    <img src="{{ asset('storage/'.$odp->foto) }}" alt="Foto ODP" class="h-10 w-auto rounded">
                                @else
                                    -
                                @endif
                            </td>
                            <td class="px-4 py-2">
                                <span class="px-2 py-1 rounded {{ $status=='Tersedia' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700' }}">
                                    {{ $status }}
                                    <span class="ml-1 text-xs text-gray-600">({{ $odp->customers_count }}/{{ $max }})</span>
                                </span>
                            </td>
                            <td class="px-4 py-2 flex gap-2">
                                <a href="{{ route('odp.show', $odp->id) }}" class="bg-green-500 hover:bg-green-700 text-white px-3 py-1 rounded text-xs">Detail</a>
                                <a href="{{ route('odp.edit', $odp->id) }}" class="bg-blue-500 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">Edit</a>
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>
</x-app-layout>
