@section('title', 'Riwayat Pembayaran')
<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Riwayat Pembayaran') }} - {{ $customer->name }}
        </h2>
    </x-slot>
<div class="max-w-2xl mx-auto py-6">
    <a href="{{ route('customers.list') }}" class="mb-4 inline-block bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded">Kembali ke Daftar</a>
    <div class="overflow-x-auto">
        <table class="min-w-full bg-white border rounded shadow text-xs sm:text-sm">
            <thead class="bg-gray-100">
                <tr>
                    <th class="px-4 py-2">No</th>
                    <th class="px-4 py-2">Tanggal Invoice</th>
                    <th class="px-4 py-2">Jatuh Tempo</th>
                    <th class="px-4 py-2">Nominal</th>
                    <th class="px-4 py-2">Status</th>
                    <th class="px-4 py-2">Aksi</th>
                </tr>
            </thead>
            <tbody>
                @forelse($invoices as $i => $invoice)
                    <tr>
                        <td class="px-4 py-2">{{ $i+1 }}</td>
                        <td class="px-4 py-2">{{ \Carbon\Carbon::parse($invoice->invoice_date)->format('d-m-Y') }}</td>
                        <td class="px-4 py-2">{{ \Carbon\Carbon::parse($invoice->due_date)->format('d-m-Y') }}</td>
                        <td class="px-4 py-2">Rp{{ number_format($invoice->amount, 0, ',', '.') }}</td>
                        <td class="px-4 py-2">
                            @if($invoice->status === 'paid')
                                <span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs">Sudah Bayar</span>
                            @elseif($invoice->status === 'menunggu konfirmasi')
                                <span class="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs">Menunggu Konfirmasi</span>
                            @else
                                <span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">Belum Bayar</span>
                            @endif
                        </td>
                        <td class="px-4 py-2">
                            <a href="{{ url('/invoice/'.$invoice->invoice_link) }}" target="_blank" class="bg-blue-500 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">Lihat Invoice</a>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="6" class="text-center py-2">Belum ada riwayat pembayaran</td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>
</div>
</x-app-layout>
