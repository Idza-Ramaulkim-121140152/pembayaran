<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Status Pembayaran - Rumah Kita Net</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
    <div class="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        <!-- Glow Effect -->
        @if($isSuccess)
            <div class="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-24 -right-24 w-60 h-60 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
        @else
            <div class="absolute -top-24 -left-24 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div class="absolute -bottom-24 -right-24 w-60 h-60 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>
        @endif

        <!-- Header / Logo -->
        <div class="text-center space-y-2 relative z-10">
            <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-bold text-slate-300">
                <span class="w-2 h-2 rounded-full {{ $isSuccess ? 'bg-emerald-400' : ($isCancel ? 'bg-rose-400' : 'bg-amber-400') }} animate-pulse"></span>
                iPaymu Payment Gateway
            </div>
            <h1 class="text-lg font-black tracking-tight text-white">RUMAH KITA NET</h1>
        </div>

        <!-- Status Icon & Title -->
        <div class="text-center space-y-3 relative z-10">
            @if($isSuccess)
                <div class="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <div class="space-y-1">
                    <h2 class="text-2xl font-black text-white">Pembayaran Berhasil!</h2>
                    <p class="text-xs text-slate-400">Terima kasih, transaksi uji coba pembayaran Anda telah terkonfirmasi.</p>
                </div>
            @elseif($isCancel)
                <div class="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </div>
                <div class="space-y-1">
                    <h2 class="text-2xl font-black text-white">Pembayaran Dibatalkan</h2>
                    <p class="text-xs text-slate-400">Sesi pembayaran telah dibatalkan oleh pengguna.</p>
                </div>
            @else
                <div class="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <div class="space-y-1">
                    <h2 class="text-2xl font-black text-white">Menunggu Pembayaran</h2>
                    <p class="text-xs text-slate-400">Sistem sedang menunggu penyelesaian pembayaran dari channel pembayaran Anda.</p>
                </div>
            @endif
        </div>

        <!-- Transaction Details Box -->
        <div class="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 sm:p-5 space-y-3 relative z-10 font-mono text-xs">
            <div class="flex justify-between items-center pb-2.5 border-b border-slate-800/80">
                <span class="text-slate-400 font-sans">Status</span>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase {{ $isSuccess ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : ($isCancel ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30') }}">
                    {{ $status }}
                </span>
            </div>

            @if($trxId)
            <div class="flex justify-between items-center pb-2.5 border-b border-slate-800/80">
                <span class="text-slate-400 font-sans">Transaction ID</span>
                <span class="font-bold text-white">{{ $trxId }}</span>
            </div>
            @endif

            @if($paymentMethod)
            <div class="flex justify-between items-center pb-2.5 border-b border-slate-800/80">
                <span class="text-slate-400 font-sans">Metode Pembayaran</span>
                <span class="font-bold text-emerald-400 uppercase">{{ $paymentMethod }}</span>
            </div>
            @endif

            @if($sid)
            <div class="flex justify-between items-center pb-2.5 border-b border-slate-800/80">
                <span class="text-slate-400 font-sans">Session ID</span>
                <span class="text-[10px] text-slate-300 truncate max-w-[180px]">{{ $sid }}</span>
            </div>
            @endif

            <div class="flex justify-between items-center">
                <span class="text-slate-400 font-sans">Waktu Respon</span>
                <span class="text-slate-300 font-sans">{{ now()->format('d M Y, H:i:s') }} WIB</span>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="space-y-2.5 pt-2 relative z-10">
            <a href="/settings/ipaymu-integration" class="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                <span>Kembali ke Halaman Uji Coba iPaymu</span>
            </a>

            <a href="/" class="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition flex items-center justify-center">
                Halaman Utama Website
            </a>
        </div>
    </div>
</body>
</html>
