@section('title', 'Edit ODP')
<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Edit ODP') }}
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
        <form method="POST" action="{{ route('odp.update', $odp->id) }}" enctype="multipart/form-data" class="space-y-4">
            @csrf
            @method('PUT')
            <div>
                <label class="block font-medium mb-1">Nama ODP</label>
                <input type="text" name="nama" value="{{ old('nama', $odp->nama) }}" class="border rounded px-3 py-2 w-full" required />
            </div>
            <div>
                <label class="block font-medium mb-1">Rasio Spesial</label>
                <input type="text" name="rasio_spesial" value="{{ old('rasio_spesial', $odp->rasio_spesial) }}" class="border rounded px-3 py-2 w-full" placeholder="Boleh dikosongkan" />
            </div>
            <div>
                <label class="block font-medium mb-1">Rasio Distribusi</label>
                <select name="rasio_distribusi" class="border rounded px-3 py-2 w-full" required>
                    <option value="">Pilih Rasio</option>
                    <option value="1:2" {{ old('rasio_distribusi', $odp->rasio_distribusi)=='1:2' ? 'selected' : '' }}>1:2</option>
                    <option value="1:4" {{ old('rasio_distribusi', $odp->rasio_distribusi)=='1:4' ? 'selected' : '' }}>1:4</option>
                    <option value="1:8" {{ old('rasio_distribusi', $odp->rasio_distribusi)=='1:8' ? 'selected' : '' }}>1:8</option>
                    <option value="1:16" {{ old('rasio_distribusi', $odp->rasio_distribusi)=='1:16' ? 'selected' : '' }}>1:16</option>
                </select>
            </div>
            <div>
                <label class="block font-medium mb-1">Foto ODP</label>
                @if($odp->foto)
                    <img src="{{ asset('storage/'.$odp->foto) }}" alt="Foto ODP" class="mb-2 rounded w-32 h-20 object-cover">
                @endif
                <input type="file" name="foto" class="border rounded px-3 py-2 w-full" accept="image/*" />
            </div>
            <div class="flex justify-end gap-2 pt-2">
                <a href="{{ route('odp.index') }}" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Batal</a>
                <button type="submit" class="bg-blue-600 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded transition-colors duration-150 text-sm">Simpan</button>
            </div>
        </form>
    </div>
</x-app-layout>
