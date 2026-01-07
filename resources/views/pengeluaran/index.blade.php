<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Pengeluaran') }}
        </h2>
    </x-slot>
<div class="max-w-2xl mx-auto py-6">
    <h2 class="text-xl font-bold mb-4">Catat Pengeluaran</h2>
    @if(session('success'))
        <div class="mb-4 p-3 rounded bg-green-100 text-green-700 text-sm text-center">
            {{ session('success') }}
        </div>
    @endif
    <form method="POST" action="{{ route('pengeluaran.store') }}" class="bg-white rounded shadow p-4 mb-8">
        @csrf
        <div class="mb-3">
            <label class="block font-medium mb-1">Tanggal</label>
            <input type="date" name="tanggal" value="{{ old('tanggal', date('Y-m-d')) }}" class="border rounded px-2 py-1 w-full" required />
        </div>
        <div class="mb-3">
            <label class="block font-medium mb-1">Jumlah (Rp)</label>
            <input type="text" id="jumlahInput" name="jumlah" min="1" value="{{ old('jumlah') }}" class="border rounded px-2 py-1 w-full" required autocomplete="off" inputmode="numeric" pattern="[0-9,]*" />
        </div>
        <div class="mb-3">
            <label class="block font-medium mb-1">Kategori</label>
            <select name="kategori" class="border rounded px-2 py-1 w-full" required>
                <option value="">Pilih Kategori</option>
                <option value="Pembelian Alat" {{ old('kategori')=='Pembelian Alat' ? 'selected' : '' }}>Pembelian Alat</option>
                <option value="Pembayaran Bandwith" {{ old('kategori')=='Pembayaran Bandwith' ? 'selected' : '' }}>Pembayaran Bandwith</option>
                <option value="Pembayaran Pinjaman" {{ old('kategori')=='Pembayaran Pinjaman' ? 'selected' : '' }}>Pembayaran Pinjaman</option>
                <option value="Komsumsi" {{ old('kategori')=='Komsumsi' ? 'selected' : '' }}>Komsumsi</option>
                <option value="Lain-Lain" {{ old('kategori')=='Lain-Lain' ? 'selected' : '' }}>Lain-Lain</option>
            </select>
        </div>
        <div class="mb-3">
            <label class="block font-medium mb-1">Detail</label>
            <textarea name="detail" class="border rounded px-2 py-1 w-full" rows="2" placeholder="Keterangan tambahan...">{{ old('detail') }}</textarea>
        </div>
        <button type="submit" class="bg-blue-600 hover:bg-blue-800 text-white px-4 py-2 rounded">Catat Pengeluaran</button>
    </form>
    <h3 class="text-lg font-bold mb-2">Riwayat Pengeluaran</h3>
    <div class="overflow-x-auto">
        <table class="min-w-full bg-white border rounded shadow text-xs sm:text-sm">
            <thead class="bg-gray-100">
                <tr>
                    <th class="px-4 py-2">Tanggal</th>
                    <th class="px-4 py-2">Jumlah</th>
                    <th class="px-4 py-2">Kategori</th>
                    <th class="px-4 py-2">Detail</th>
                    <th class="px-4 py-2">Aktor</th>
                </tr>
            </thead>
            <tbody>
                @forelse($pengeluarans as $pengeluaran)
                <tr>
                    <td class="px-4 py-2">{{ \Carbon\Carbon::parse($pengeluaran->tanggal)->format('d-m-Y') }}</td>
                    <td class="px-4 py-2">Rp {{ number_format($pengeluaran->jumlah,0,',','.') }}</td>
                    <td class="px-4 py-2">{{ $pengeluaran->kategori }}</td>
                    <td class="px-4 py-2">{{ $pengeluaran->detail ?? '-' }}</td>
                    <td class="px-4 py-2">{{ $pengeluaran->user->name ?? '-' }}</td>
                </tr>
                @empty
                <tr>
                    <td colspan="4" class="text-center py-2">Belum ada data pengeluaran</td>
                </tr>
                @endforelse
            </tbody>
        </table>
    </div>
</div>
<script>
// Format input jumlah otomatis pakai koma ribuan
document.addEventListener('DOMContentLoaded', function() {
    var input = document.getElementById('jumlahInput');
    if (!input) return;
    input.addEventListener('input', function(e) {
        let value = this.value.replace(/[^\d]/g, '');
        if (value) {
            this.value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        } else {
            this.value = '';
        }
    });
    // Saat submit, hapus koma agar value ke backend tetap angka
    input.form && input.form.addEventListener('submit', function() {
        input.value = input.value.replace(/[^\d]/g, '');
    });
});
</script>
</x-app-layout>
