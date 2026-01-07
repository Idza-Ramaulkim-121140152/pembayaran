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
    <!-- Header -->
    <div class="flex justify-end">
      <button class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
    </div>

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
        Scan atau simpan QRIS untuk melanjutkan pembayaran kamu dalam waktu
      </p>
      <div class="flex items-center justify-center mt-2 text-orange-500 font-medium">
        <span class="material-icons mr-1">⏰</span> 04 Menit : 41 Detik
      </div>
    </div>

    <!-- Detail Pembayaran -->
    <div class="bg-gray-100 rounded-xl p-4 mt-5">
      <div class="flex justify-between text-sm text-gray-500">
        <span>Detail Pembayaran</span>
      </div>
      <div class="flex justify-between mt-2">
        <span class="font-medium">Metode</span>
        <span class="font-medium">QRIS</span>
      </div>
      <div class="flex justify-between mt-2">
        <span class="font-medium">Total Transaksi</span>
        <span class="font-bold text-indigo-700">Rp26.210</span>
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
      <button class="w-full bg-yellow-400 hover:bg-yellow-500 text-white font-medium py-3 rounded-xl">
        Unduh QRIS
      </button>
      <button class="w-full border border-gray-300 hover:bg-gray-100 text-gray-700 font-medium py-3 rounded-xl">
        Cek Status Pembayaran
      </button>
    </div>
    <!-- Info CS WhatsApp -->
    <div class="mt-8 text-center text-xs text-gray-500">
      <hr class="my-3">
      <span>Butuh bantuan? Hubungi CS via WhatsApp: <a href="https://wa.me/6285158025553" class="text-green-600 font-semibold" target="_blank">0851-5802-5553</a></span>
    </div>
  </div>
</body>
</html>
