        
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice Pembayaran</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white flex items-center justify-center min-h-screen font-sans">
    <div class="w-full max-w-md bg-white shadow-lg rounded-2xl p-6">
        @if($invoice->status === 'paid')
            <div class="mb-4 p-3 rounded bg-green-100 text-green-700 text-sm text-center">
                Pembayaran Anda sudah dikonfirmasi oleh admin. Terima kasih!
            </div>
        @endif
        @if(session('error'))
            <div class="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm text-center">
                {{ session('error') }}
            </div>
        @endif
        @if(isset($invoice->tolak_info) && $invoice->tolak_info)
            <div class="mb-4 p-3 rounded bg-orange-100 text-orange-700 text-sm text-center">
                {{ $invoice->tolak_info }}
            </div>
        @endif

        <!-- Logo dan Header -->
        <div class="flex flex-col items-center mb-4">
            <img src="{{ asset('logo_baru.png') }}" alt="Logo" class="h-14 w-auto mb-2">
        </div>


        @if($invoice->status !== 'paid')
            <!-- QR Code -->
            <div class="flex flex-col items-center">
                <div class="border rounded-xl p-3">
                    <img src="{{ asset('qr.jpg') }}" alt="QRIS" class="w-48 h-48">
                </div>
            </div>

            <!-- Title -->
            <div class="text-center mt-4">
                <h2 class="text-lg font-semibold">Selesaikan Pembayaran</h2>
                <p class="text-sm text-gray-500">
                    Scan atau simpan QRIS untuk melanjutkan pembayaran kamu sebelum jatuh tempo
                </p>
                <div class="flex items-center justify-center mt-2 text-orange-500 font-medium">
                    <span class="material-icons mr-1">⏰</span> {{ \Carbon\Carbon::parse($invoice->due_date)->diffForHumans(null, false, false, 2) }}
                </div>
            </div>

            <!-- Detail Pembayaran -->
            <div class="bg-gray-100 rounded-xl p-4 mt-5">
                <div class="flex justify-between text-sm text-gray-500">
                    <span>Detail Pembayaran</span>
                </div>
                <div class="flex justify-between mt-2">
                    <span class="font-medium">Nama</span>
                    <span class="font-medium">{{ $invoice->customer->name }}</span>
                </div>
                <div class="flex justify-between mt-2">
                    <span class="font-medium">No WA</span>
                    <span class="font-medium">{{ $invoice->customer->phone }}</span>
                </div>
                <div class="flex justify-between mt-2">
                    <span class="font-medium">Metode</span>
                    <span class="font-medium">QRIS</span>
                </div>
                <div class="flex justify-between mt-2">
                    <span class="font-medium">Total Transaksi</span>
                    <span class="font-bold text-indigo-700">Rp{{ number_format($invoice->amount, 0, ',', '.') }}</span>
                </div>
                <div class="flex justify-between mt-2">
                    <span class="font-medium">Status</span>
                    <span class="capitalize">{{ $invoice->status }}</span>
                </div>
            </div>

            <!-- Cara Pembayaran -->
            <div class="mt-5">
                <h3 class="font-semibold text-sm mb-2">Cara Pembayaran dengan QRIS</h3>
                <ol class="list-decimal list-inside text-sm text-gray-600 space-y-1">
                    <li>Unduh kode QRIS kamu</li>
                    <li>Buka aplikasi pembayaran (LinkAja, Dana, OVO, GoPay, m-Banking)</li>
                    <li>Upload kode QRIS kamu pada aplikasi pembayaran</li>
                    <li>Setelah melakukan pembayaran kembali ke aplikasi dan tekan tombol konfirmasi</li>
                </ol>
            </div>

            <!-- Tombol -->
            <div class="mt-6 space-y-3">
                <a href="{{ asset('qr.jpg') }}" download class="w-full block bg-yellow-400 hover:bg-yellow-500 text-white font-medium py-3 rounded-xl text-center">Unduh QRIS</a>
                @if($invoice->status === 'unpaid' || ($invoice->tolak_info && $invoice->status !== 'paid'))
                    <!-- Tombol Konfirmasi Pembayaran Aktif -->
                    <button onclick="document.getElementById('modal-konfirmasi').classList.remove('hidden')" class="w-full border border-gray-300 hover:bg-gray-100 text-gray-700 font-medium py-3 rounded-xl">Konfirmasi Pembayaran</button>
                @elseif($invoice->status === 'menunggu konfirmasi' && $invoice->bukti_pembayaran)
                    <!-- Info Menunggu Konfirmasi Admin -->
                    <div class="w-full bg-blue-100 text-blue-700 font-medium py-3 rounded-xl text-center">Bukti pembayaran sudah diupload, menunggu konfirmasi admin.</div>
                @endif
            </div>
        @endif

        <!-- Modal Konfirmasi Pembayaran -->
        <div id="modal-konfirmasi" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 hidden">
            <div class="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 relative">
                <button onclick="document.getElementById('modal-konfirmasi').classList.add('hidden')" class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                <h3 class="text-lg font-semibold mb-2">Konfirmasi Pembayaran</h3>
                    <form method="POST" action="{{ route('invoice.confirm-payment', $invoice->id) }}" enctype="multipart/form-data" class="space-y-4">
                    @csrf
                    <div>
                        <label class="block text-sm font-medium mb-1">Nominal Dibayarkan</label>
                        <input type="number" name="paid_amount" min="1" value="{{ $invoice->amount }}" required class="block w-full text-sm border rounded px-3 py-2" />
                        <span class="text-xs text-gray-500">Nominal default sesuai invoice, bisa diubah jika pembayaran berbeda.</span>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Upload Bukti Pembayaran (opsional)</label>
                        <input type="file" name="bukti_pembayaran" accept="image/*,application/pdf" class="block w-full text-sm border rounded px-3 py-2" />
                        <span class="text-xs text-gray-500">Bisa berupa foto atau PDF, maksimal 2MB.</span>
                    </div>
                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded">Kirim Konfirmasi</button>
                </form>
            </div>
        </div>
        <!-- Info CS WhatsApp -->
        <div class="mt-8 text-center text-xs text-gray-500">
            <hr class="my-3">
            <span>Butuh bantuan? Hubungi CS via WhatsApp: <a href="https://wa.me/6285158025553" class="text-green-600 font-semibold" target="_blank">0851-5802-5553</a></span>
        </div>
    </div>
</body>
</html>
