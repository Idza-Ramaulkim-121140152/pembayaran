@php
    $normalizePaymentProofPath = function ($rawPath): ?string {
        $path = trim((string) $rawPath);
        if ($path === '') {
            return null;
        }

        if (in_array(strtolower($path), ['0', '1', 'false', 'null'], true)) {
            return null;
        }

        $path = str_replace('\\', '/', $path);
        $path = ltrim($path, '/');

        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, strlen('storage/'));
        }

        if (str_starts_with($path, 'public/')) {
            $path = substr($path, strlen('public/'));
        }

        $path = ltrim($path, '/');

        if ($path === '' || $path === '.' || $path === '..') {
            return null;
        }

        return $path;
    };

    $hasPaymentProof = $normalizePaymentProofPath($invoice->bukti_pembayaran ?? null) !== null;
@endphp
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
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

        @if(session('success'))
            <div class="mb-4 p-3 rounded bg-green-100 text-green-700 text-sm text-center">
                {{ session('success') }}
            </div>
        @endif

        @if(isset($invoice->tolak_info) && $invoice->tolak_info)
            <div class="mb-4 p-3 rounded bg-orange-100 text-orange-700 text-sm text-center">
                {{ $invoice->tolak_info }}
            </div>
        @endif

        <div class="flex flex-col items-center mb-4">
            <img src="{{ asset('logo_baru.png') }}" alt="Logo" class="h-14 w-auto mb-2">
        </div>

        @if($invoice->status !== 'paid')
            <div class="flex flex-col items-center">
                <div class="border rounded-xl p-3">
                    <img src="{{ asset('qr.jpg') }}" alt="QRIS" class="w-48 h-48">
                </div>
            </div>

            <div class="text-center mt-4">
                <h2 class="text-lg font-semibold">Selesaikan Pembayaran</h2>
                <p class="text-sm text-gray-500">
                    Scan atau simpan QRIS untuk melanjutkan pembayaran kamu sebelum jatuh tempo
                </p>
                <div class="flex items-center justify-center mt-2 text-orange-500 font-medium">
                    <span class="material-icons mr-1">⏰</span> {{ \Carbon\Carbon::parse($invoice->due_date)->diffForHumans(null, false, false, 2) }}
                </div>
            </div>

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
                    <span id="invoice-status-text" class="capitalize">{{ $invoice->status }}</span>
                </div>
            </div>

            <div class="mt-5">
                <h3 class="font-semibold text-sm mb-2">Cara Pembayaran dengan QRIS</h3>
                <ol class="list-decimal list-inside text-sm text-gray-600 space-y-1">
                    <li>Unduh kode QRIS kamu</li>
                    <li>Buka aplikasi pembayaran (LinkAja, Dana, OVO, GoPay, m-Banking)</li>
                    <li>Upload kode QRIS kamu pada aplikasi pembayaran</li>
                    <li>Setelah melakukan pembayaran kembali ke aplikasi dan tekan tombol konfirmasi</li>
                </ol>
            </div>

            <div class="mt-6 space-y-3">
                <a href="{{ asset('qr.jpg') }}" download class="w-full block bg-yellow-400 hover:bg-yellow-500 text-white font-medium py-3 rounded-xl text-center">Unduh QRIS</a>
                @if($invoice->status === 'unpaid' || ($invoice->tolak_info && $invoice->status !== 'paid'))
                    <button type="button" onclick="document.getElementById('modal-konfirmasi').classList.remove('hidden')" class="w-full border border-gray-300 hover:bg-gray-100 text-gray-700 font-medium py-3 rounded-xl">Konfirmasi Pembayaran</button>
                @elseif($invoice->status === 'menunggu konfirmasi')
                    <div
                        id="waiting-proof-status"
                        class="w-full font-medium py-3 rounded-xl text-center {{ $hasPaymentProof ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700' }}"
                    >
                        {{ $hasPaymentProof ? 'Bukti pembayaran sudah diupload, menunggu konfirmasi admin.' : 'Konfirmasi terkirim, tetapi bukti pembayaran tidak tersedia. Jika diminta admin, silakan upload ulang bukti yang valid.' }}
                    </div>
                @endif
            </div>
        @endif

        <div id="modal-konfirmasi" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 hidden">
            <div class="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 relative">
                <button type="button" onclick="document.getElementById('modal-konfirmasi').classList.add('hidden')" class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                <h3 class="text-lg font-semibold mb-2">Konfirmasi Pembayaran</h3>

                <div id="confirm-feedback" class="hidden mb-3 p-3 rounded text-sm"></div>

                <form id="public-confirmation-form" method="POST" action="{{ route('invoice.confirm-payment', $invoice->id) }}" enctype="multipart/form-data" class="space-y-4">
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
                    <button id="submit-konfirmasi-btn" type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded">Kirim Konfirmasi</button>
                </form>
            </div>
        </div>

        <div class="mt-8 text-center text-xs text-gray-500">
            <hr class="my-3">
            <span>Butuh bantuan? Hubungi CS via WhatsApp: <a href="https://wa.me/6285158025553" class="text-green-600 font-semibold" target="_blank">0851-5802-5553</a></span>
        </div>
    </div>

    <script>
        (() => {
            const form = document.getElementById('public-confirmation-form');
            const modal = document.getElementById('modal-konfirmasi');
            const submitButton = document.getElementById('submit-konfirmasi-btn');
            const feedbackBox = document.getElementById('confirm-feedback');
            const statusText = document.getElementById('invoice-status-text');
            const waitingProofStatus = document.getElementById('waiting-proof-status');

            if (!form || !modal || !submitButton || !feedbackBox) {
                return;
            }

            const setFeedback = (type, message) => {
                const palette = type === 'success'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700';

                feedbackBox.textContent = message;
                feedbackBox.className = `mb-3 p-3 rounded text-sm ${palette}`;
                feedbackBox.classList.remove('hidden');
            };

            const clearFeedback = () => {
                feedbackBox.textContent = '';
                feedbackBox.className = 'hidden mb-3 p-3 rounded text-sm';
            };

            const setWaitingStatus = (hasProof) => {
                if (!waitingProofStatus) {
                    return;
                }

                if (hasProof) {
                    waitingProofStatus.className = 'w-full font-medium py-3 rounded-xl text-center bg-blue-100 text-blue-700';
                    waitingProofStatus.textContent = 'Bukti pembayaran sudah diupload, menunggu konfirmasi admin.';
                    return;
                }

                waitingProofStatus.className = 'w-full font-medium py-3 rounded-xl text-center bg-amber-100 text-amber-700';
                waitingProofStatus.textContent = 'Konfirmasi terkirim, tetapi bukti pembayaran tidak tersedia. Jika diminta admin, silakan upload ulang bukti yang valid.';
            };

            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                clearFeedback();

                const formData = new FormData(form);

                submitButton.disabled = true;
                submitButton.classList.add('opacity-60', 'cursor-not-allowed');

                try {
                    const response = await fetch(form.action, {
                        method: 'POST',
                        body: formData,
                        credentials: 'same-origin',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'Accept': 'application/json',
                        },
                    });

                    const contentType = (response.headers.get('content-type') || '').toLowerCase();
                    const isJson = contentType.includes('application/json');
                    const payload = isJson ? await response.json() : null;

                    if (!response.ok) {
                        if (response.status === 422 && payload?.errors) {
                            const firstError = Object.values(payload.errors).flat().find(Boolean);
                            throw new Error(firstError || 'Data konfirmasi pembayaran tidak valid.');
                        }

                        if (response.status === 419) {
                            throw new Error('Sesi formulir sudah kedaluwarsa. Silakan muat ulang halaman lalu coba lagi.');
                        }

                        if (response.status === 403) {
                            throw new Error(payload?.message || 'Akses ditolak untuk mengirim konfirmasi pembayaran.');
                        }

                        throw new Error(payload?.message || 'Gagal mengirim konfirmasi pembayaran.');
                    }

                    const hasPaymentProof = payload?.data?.has_payment_proof === true;
                    const latestStatus = (payload?.data?.status || '').toString().trim();

                    if (statusText && latestStatus) {
                        statusText.textContent = latestStatus;
                    }

                    setWaitingStatus(hasPaymentProof);

                    setFeedback(
                        'success',
                        hasPaymentProof
                            ? 'Konfirmasi berhasil dikirim dengan bukti pembayaran. Menunggu verifikasi admin.'
                            : 'Konfirmasi berhasil dikirim tanpa bukti pembayaran. Jika diminta admin, silakan upload ulang bukti yang valid.'
                    );

                    modal.classList.add('hidden');

                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } catch (error) {
                    setFeedback('error', error?.message || 'Gagal mengirim konfirmasi pembayaran.');
                } finally {
                    submitButton.disabled = false;
                    submitButton.classList.remove('opacity-60', 'cursor-not-allowed');
                }
            });
        })();
    </script>
</body>
</html>
