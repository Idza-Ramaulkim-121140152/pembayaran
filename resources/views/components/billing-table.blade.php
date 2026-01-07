@props(['customers', 'invoicesThisMonth' => []])
<div class="w-full overflow-x-auto">
<table class="min-w-full divide-y divide-gray-200 mb-4 text-xs sm:text-sm">
    <thead class="bg-gray-50">
        <tr>
            <th class="px-4 py-2">No</th>
            <th class="px-4 py-2">
                <a href="?sort={{ request('sort')=='name_asc' ? 'name_desc' : 'name_asc' }}{{ request('search') ? '&search='.urlencode(request('search')) : '' }}" class="hover:underline flex items-center gap-1">
                    Nama
                    @if(request('sort')=='name_asc')
                        <span>&uarr;</span>
                    @elseif(request('sort')=='name_desc')
                        <span>&darr;</span>
                    @endif
                </a>
            </th>
            <th class="px-4 py-2">
                <a href="?sort={{ request('sort')=='pppoe_asc' ? 'pppoe_desc' : 'pppoe_asc' }}{{ request('search') ? '&search='.urlencode(request('search')) : '' }}" class="hover:underline flex items-center gap-1">
                    PPPoE
                    @if(request('sort')=='pppoe_asc')
                        <span>&uarr;</span>
                    @elseif(request('sort')=='pppoe_desc')
                        <span>&darr;</span>
                    @endif
                </a>
            </th>
            <th class="px-4 py-2">
                <a href="?sort={{ request('sort')=='wa_asc' ? 'wa_desc' : 'wa_asc' }}{{ request('search') ? '&search='.urlencode(request('search')) : '' }}" class="hover:underline flex items-center gap-1">
                    No WA
                    @if(request('sort')=='wa_asc')
                        <span>&uarr;</span>
                    @elseif(request('sort')=='wa_desc')
                        <span>&darr;</span>
                    @endif
                </a>
            </th>
            <th class="px-4 py-2">
                <a href="?sort={{ request('sort')=='due_asc' ? 'due_desc' : 'due_asc' }}{{ request('search') ? '&search='.urlencode(request('search')) : '' }}" class="hover:underline flex items-center gap-1">
                    Jatuh Tempo
                    @if(request('sort')=='due_asc')
                        <span>&uarr;</span>
                    @elseif(request('sort')=='due_desc')
                        <span>&darr;</span>
                    @endif
                </a>
            </th>
            <th class="px-4 py-2">Status</th>
            <th class="px-4 py-2">Action</th>
        </tr>
    </thead>
    <tbody class="bg-white divide-y divide-gray-200">
        @forelse($customers as $i => $customer)
            @php $invoice = $invoicesThisMonth[$customer->id] ?? null; @endphp
            @if($invoice && $invoice->status === 'paid')
                @continue
            @endif
            <tr>
                <td class="px-4 py-2">{{ $i+1 }}</td>
                <td class="px-4 py-2">{{ $customer->name }}</td>
                <td class="px-4 py-2">{{ $customer->pppoe_username }}</td>
                <td class="px-4 py-2">{{ $customer->phone }}</td>
                <td class="px-4 py-2">{{ $customer->due_date ? \Carbon\Carbon::parse($customer->due_date)->format('d-m-Y') : '-' }}</td>
                <td class="px-4 py-2">
                    @if($invoice)
                        <span class="inline-block px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-xs">Belum Bayar</span>
                    @else
                        <span class="inline-block px-2 py-1 rounded bg-red-100 text-red-800 text-xs">Belum Ada Tagihan</span>
                    @endif
                </td>
                <td class="px-4 py-2">
                    @if(!$invoice)
                        <div>
                            <button type="button"
                                class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded create-invoice-btn"
                                data-customer-id="{{ $customer->id }}"
                                data-customer-name="{{ htmlspecialchars($customer->name, ENT_QUOTES) }}"
                                data-pppoe="{{ $customer->pppoe_username }}"
                                data-package="{{ $customer->package_type ?? $customer->custom_package ?? '' }}"
                                data-phone="{{ preg_replace('/[^0-9]/','',$customer->phone) }}"
                            >
                                Buat Tagihan
                            </button>
                        </div>
                    @else
                        <div class="flex flex-col gap-1">
                            <button type="button" onclick="document.getElementById('modal-copy-{{ $invoice->id }}').classList.remove('hidden')" class="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-3 rounded">
                                Kirim Link Penagihan
                            </button>
                            <!-- Modal Copy Link -->
                            <div id="modal-copy-{{ $invoice->id }}" class="fixed z-50 inset-0 flex justify-center items-center bg-black bg-opacity-40 px-2 hidden">
                                <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-sm">
                                    <h3 class="text-lg font-bold mb-2">Kirim Link Penagihan</h3>
                                    <div class="mb-2 flex items-center gap-2">
                                        <input id="input-link-{{ $invoice->id }}" type="text" readonly value="{{ url('/invoice/'.$invoice->invoice_link) }}" class="w-full border rounded px-2 py-1 text-sm">
                                        <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('input-link-{{ $invoice->id }}').value);document.getElementById('copy-alert-{{ $invoice->id }}').classList.remove('hidden');setTimeout(function(){document.getElementById('copy-alert-{{ $invoice->id }}').classList.add('hidden')},1500);" class="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs">Copy Link</button>
                                    </div>
                                    <div class="mb-2 flex gap-2">
                                        <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('template-penagihan-{{ $invoice->id }}').value);document.getElementById('copy-template-alert-{{ $invoice->id }}').classList.remove('hidden');setTimeout(function(){document.getElementById('copy-template-alert-{{ $invoice->id }}').classList.add('hidden')},1500);" class="bg-blue-600 hover:bg-blue-800 text-white px-2 py-1 rounded text-xs">Copy Template Penagihan</button>
                                        <a href="https://wa.me/{{ preg_replace('/[^0-9]/', '', $customer->phone) }}?text={{ urlencode(
     'Yth. Bapak/Ibu '.strtoupper($customer->name)."\n".
     'Username PPPoE: '.$customer->pppoe_username."\n\n".
     'Terima kasih telah menjadi bagian dari pelanggan prioritas kami.'."\n".
     'Layanan internet anda aktif sampai '.($customer->due_date ? \Carbon\Carbon::parse($customer->due_date)->format('d-m-Y') : '-') . ".\n" .
     '> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:' . "\n" .
     url('/invoice/'.$invoice->invoice_link) . "\n\n" .
     'Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis.' . "\n\n" .
     'Layanan Call Center 085158025553' . "\n\n" .
     'Salam Hangat,' . "\n" .
     'Tim Layanan Pelanggan Rumah Kita Net'
 ) }}" target="_blank" class="bg-green-600 hover:bg-green-800 text-white px-2 py-1 rounded text-xs">Kirim Tagihan</a>
                                    </div>
                                    <textarea id="template-penagihan-{{ $invoice->id }}" class="w-full border rounded px-2 py-1 text-xs mb-1" rows="10" readonly style="display:none;">Yth. Bapak/Ibu {{ strtoupper($customer->name) }}
Username PPPoE: {{ $customer->pppoe_username }}

Terima kasih telah menjadi bagian dari pelanggan prioritas kami.
Layanan internet anda aktif sampai {{ $customer->due_date ? \Carbon\Carbon::parse($customer->due_date)->format('d-m-Y') : '-' }}.

> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:
{{ url('/invoice/'.$invoice->invoice_link) }}

Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis.

Layanan Call Center 085158025553

Salam Hangat,
Tim Layanan Pelanggan Rumah Kita Net
    </textarea>
                                    <div id="copy-template-alert-{{ $invoice->id }}" class="text-green-600 text-xs mb-2 hidden">Template berhasil disalin!</div>
                                    <div class="flex justify-end">
                                        <button type="button" onclick="document.getElementById('modal-copy-{{ $invoice->id }}').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Tutup</button>
                                    </div>
                                </div>
                            </div>
                            @if($invoice->status === 'menunggu konfirmasi' && $invoice->bukti_pembayaran)
                                <a href="{{ asset('storage/'.$invoice->bukti_pembayaran) }}" target="_blank" class="text-blue-600 underline text-xs mb-1">Lihat Bukti Pembayaran</a>
                            @endif
                            <button type="button" onclick="document.getElementById('modal-{{ $invoice->id }}').classList.remove('hidden')" class="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded">
                                Konfirmasi Pembayaran
                            </button>
                            <!-- Modal -->
                            <div id="modal-{{ $invoice->id }}" class="fixed z-50 inset-0 flex justify-center items-center bg-black bg-opacity-40 px-2 hidden">
                                <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-sm">
                                    <h3 class="text-lg font-bold mb-2">Konfirmasi Pembayaran</h3>
                                    @if($invoice->status === 'menunggu konfirmasi' && $invoice->bukti_pembayaran)
                                        <div class="mb-3">
                                            <label class="block text-xs font-medium mb-1">Bukti Pembayaran:</label>
                                            <a href="{{ asset('storage/'.$invoice->bukti_pembayaran) }}" target="_blank" class="text-blue-600 underline text-xs">Lihat File</a>
                                        </div>
                                    @endif
                                    <form method="POST" action="{{ route('billing.confirm-payment', $invoice->id) }}" class="space-y-4">
                                        @csrf
                                        <div>
                                            <label class="block font-medium mb-1">Nominal Dibayarkan</label>
                                            <input type="number" name="paid_amount" min="1" value="{{ $invoice->amount }}" required class="border rounded px-2 py-2 w-full text-xs sm:text-sm" />
                                            <div class="text-xs text-gray-500 mt-1">Nominal default sesuai invoice, bisa diubah jika pembayaran berbeda.</div>
                                        </div>
                                        <div class="flex justify-end gap-2">
                                            <button type="button" onclick="document.getElementById('modal-{{ $invoice->id }}').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Batal</button>
                                            <button type="submit" class="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-700">Konfirmasi</button>
                                        </div>
                                    </form>
                                    @if($invoice->status === 'menunggu konfirmasi' && $invoice->bukti_pembayaran)
                                    <button type="button" onclick="document.getElementById('modal-tolak-{{ $invoice->id }}').classList.remove('hidden')" class="w-full bg-red-500 hover:bg-red-700 text-white rounded px-4 py-2 mt-1">Tolak Pembayaran</button>
                                    <!-- Modal Tolak Pembayaran -->
                                    <div id="modal-tolak-{{ $invoice->id }}" class="fixed z-50 inset-0 flex justify-center items-center bg-black bg-opacity-40 px-2 hidden">
                                        <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-sm relative">
                                            <button type="button" onclick="document.getElementById('modal-tolak-{{ $invoice->id }}').classList.add('hidden')" class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                                            <h3 class="text-lg font-bold mb-2 text-red-600">Tolak Bukti Pembayaran</h3>
                                            <p class="mb-4 text-sm text-gray-700">Yakin ingin menolak bukti pembayaran ini? Pelanggan akan diminta upload ulang bukti pembayaran yang valid.</p>
                                            <form method="POST" action="{{ route('billing.tolak-pembayaran', $invoice->id) }}">
                                                @csrf
                                                <div class="flex justify-end gap-2">
                                                    <button type="button" onclick="document.getElementById('modal-tolak-{{ $invoice->id }}').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Batal</button>
                                                    <button type="submit" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700">Tolak</button>
                                                </div>
                                            </form>
                                        </div>
                                    </div>
                                    @endif
                                </div>
                            </div>
                            <a href="{{ url('/invoice/'.$invoice->invoice_link) }}" target="_blank" class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded text-center">
                                Lihat Invoice
                            </a>
                        </div>
                    @endif
                </td>
            </tr>
        @empty
            <tr>
                <td colspan="6" class="text-center py-2">Tidak ada data</td>
            </tr>
        @endforelse
    </tbody>
    </tbody>
</table>
</div>

<!-- Create Invoice Modal (single shared) -->
<div id="create-invoice-modal" class="fixed z-50 inset-0 flex justify-center items-center bg-black bg-opacity-40 px-2 hidden">
    <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-md">
        <h3 class="text-lg font-bold mb-2">Buat Tagihan</h3>
        <div id="create-invoice-info" class="mb-3 text-sm text-gray-700">
            <!-- populated by JS -->
        </div>
        <form id="create-invoice-form" class="space-y-4">
            @csrf
            <input type="hidden" name="_token" value="{{ csrf_token() }}" />
            <input type="hidden" id="ci-customer-id" name="customer_id" />
            <div>
                <label class="block font-medium mb-1">Nominal (Rp)</label>
                <input id="ci-amount" type="number" name="amount" min="1" required class="border rounded px-2 py-2 w-full text-xs sm:text-sm" />
            </div>
            <div class="flex justify-end gap-2">
                <button type="button" id="ci-cancel" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Batal</button>
                <button type="submit" id="ci-confirm" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-800">Konfirmasi</button>
            </div>
        </form>
    </div>
</div>

<!-- Result Modal -->
<div id="invoice-result-modal" class="fixed z-50 inset-0 flex justify-center items-center bg-black bg-opacity-40 px-2 hidden">
    <div class="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-md">
        <h3 class="text-lg font-bold mb-2">Tagihan Dibuat</h3>
        <div class="mb-3 text-sm text-gray-700">
            <div>Link: <input id="result-link" type="text" readonly class="w-full border rounded px-2 py-1 text-sm" /></div>
        </div>
        <div class="mb-2 flex gap-2">
            <button id="result-copy-link" class="bg-blue-500 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">Copy Link</button>
            <button id="result-copy-template" class="bg-indigo-600 hover:bg-indigo-800 text-white px-3 py-1 rounded text-xs">Copy Template</button>
            <a id="result-wa" href="#" target="_blank" class="ml-auto bg-green-600 hover:bg-green-800 text-white px-3 py-1 rounded text-xs">Kirim via WhatsApp</a>
        </div>
        <textarea id="result-template" class="w-full border rounded px-2 py-1 text-xs mb-2" rows="8" readonly></textarea>
        <div class="flex justify-end">
            <button id="result-close" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Tutup</button>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function(){
    // Open create modal
    document.querySelectorAll('.create-invoice-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
            const id = this.dataset.customerId;
            const name = this.dataset.customerName;
            const pppoe = this.dataset.pppoe;
            const pkg = this.dataset.package;
            const phone = this.dataset.phone;
            document.getElementById('ci-customer-id').value = id;
            document.getElementById('ci-amount').value = '';
            document.getElementById('create-invoice-info').innerHTML = `<div class="mb-2"><strong>${name}</strong></div><div class="text-xs text-gray-600">PPPoE: ${pppoe || '-'}<br/>Paket: ${pkg || '-'}</div>`;
            // store phone for later use
            document.getElementById('create-invoice-modal').dataset.phone = phone;
            document.getElementById('create-invoice-modal').classList.remove('hidden');
        });
    });

    // Cancel
    document.getElementById('ci-cancel').addEventListener('click', function(){
        document.getElementById('create-invoice-modal').classList.add('hidden');
    });

    // Submit via AJAX
    document.getElementById('create-invoice-form').addEventListener('submit', async function(e){
        e.preventDefault();
        const customerId = document.getElementById('ci-customer-id').value;
        const amount = document.getElementById('ci-amount').value;
        const token = document.querySelector('input[name="_token"]').value;
        const url = `/penagihan/${customerId}/buat-tagihan`;
        try{
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ amount: amount })
            });
            const data = await res.json();
            if (!res.ok) throw data;
            // show result modal
            document.getElementById('create-invoice-modal').classList.add('hidden');
            document.getElementById('invoice-result-modal').classList.remove('hidden');
            document.getElementById('result-link').value = data.data.invoice_link;
            document.getElementById('result-template').value = data.data.template;
            // set wa link
            const phone = document.getElementById('create-invoice-modal').dataset.phone || '';
            const waText = encodeURIComponent(data.data.template + '\n' + data.data.invoice_link);
            document.getElementById('result-wa').href = `https://wa.me/${phone}?text=${waText}`;
        }catch(err){
            alert((err && err.error) ? err.error : 'Gagal membuat tagihan');
            console.error(err);
        }
    });

    // result actions
    document.getElementById('result-copy-link').addEventListener('click', function(){
        navigator.clipboard.writeText(document.getElementById('result-link').value);
        this.innerText = 'Copied';
        setTimeout(()=> this.innerText = 'Copy Link', 1500);
    });
    document.getElementById('result-copy-template').addEventListener('click', function(){
        navigator.clipboard.writeText(document.getElementById('result-template').value);
        this.innerText = 'Copied';
        setTimeout(()=> this.innerText = 'Copy Template', 1500);
    });
    document.getElementById('result-close').addEventListener('click', function(){
        document.getElementById('invoice-result-modal').classList.add('hidden');
    });
});
</script>

<!-- Tabel pelanggan yang sudah bayar -->
@php $paidCustomers = $customers->filter(function($c) use ($invoicesThisMonth) {
    $inv = $invoicesThisMonth[$c->id] ?? null;
    return $inv && $inv->status === 'paid';
}); @endphp
@if($paidCustomers->count())
<div class="mt-8">
    <h4 class="font-bold mb-2">Pelanggan Sudah Bayar</h4>
    <div class="w-full overflow-x-auto">
    <table class="min-w-full divide-y divide-gray-200 mb-4 text-xs sm:text-sm">
        <thead class="bg-gray-50">
            <tr>
                <th class="px-4 py-2">No</th>
                <th class="px-4 py-2">Nama</th>
                <th class="px-4 py-2">No WA</th>
                <th class="px-4 py-2">Jatuh Tempo</th>
                <th class="px-4 py-2">Status</th>
                <th class="px-4 py-2">Action</th>
            </tr>
        </thead>
    <tbody class="bg-white divide-y divide-gray-200">
            @foreach($paidCustomers as $i => $customer)
                @php $invoice = $invoicesThisMonth[$customer->id] ?? null; @endphp
                <tr>
                    <td class="px-4 py-2">{{ $i+1 }}</td>
                    <td class="px-4 py-2">{{ $customer->name }}</td>
                    <td class="px-4 py-2">{{ $customer->phone }}</td>
                    <td class="px-4 py-2">{{ $customer->due_date ? \Carbon\Carbon::parse($customer->due_date)->format('d-m-Y') : '-' }}</td>
                    <td class="px-4 py-2">
                        <span class="inline-block px-2 py-1 rounded bg-green-100 text-green-800 text-xs">Sudah Bayar</span>
                    </td>
                    <td class="px-4 py-2">
                        <a href="{{ url('/invoice/'.$invoice->invoice_link) }}" target="_blank" class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded text-center mb-1 block">
                            Lihat Invoice
                        </a>
                        @if($invoice->bukti_pembayaran)
                            <a href="{{ asset('storage/'.$invoice->bukti_pembayaran) }}" target="_blank" class="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-center block mt-1">Bukti Konfirmasi</a>
                        @endif
                    </td>
                </tr>
            @endforeach
        </tbody>
    </table>
    </div>
</div>
@endif
