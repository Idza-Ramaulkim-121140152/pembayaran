
@php
use App\Models\Pengeluaran;
use Carbon\Carbon;
$now = Carbon::now();
$bulan = request('bulan') ? Carbon::createFromFormat('Y-m', request('bulan')) : $now;
$start = $bulan->copy()->startOfMonth();
$end = $bulan->copy()->endOfMonth();
$kategori = Pengeluaran::whereBetween('tanggal', [$start, $end])
    ->selectRaw('kategori, SUM(jumlah) as total')
    ->groupBy('kategori')
    ->pluck('total', 'kategori');
$allKategori = ['Pembelian Alat', 'Pembayaran Bandwith', 'Pembayaran Pinjaman', 'Komsumsi', 'Lain-Lain'];
$pieData = [];
$pieLabels = [];
foreach ($allKategori as $kat) {
    $pieLabels[] = $kat;
    $pieData[] = (int)($kategori[$kat] ?? 0);
}
@endphp
<div class="mt-8">
    <h4 class="font-semibold mb-2">Pie Chart Pengeluaran per Kategori</h4>
    <form method="GET" class="mb-4 flex gap-2 items-center">
        <label for="bulan" class="text-sm">Pilih Bulan:</label>
        <input type="month" id="bulan" name="bulan" value="{{ $bulan->format('Y-m') }}" class="border rounded px-2 py-1 text-sm" onchange="this.form.submit()">
    </form>
    <div class="w-full max-w-md mx-auto">
        <canvas id="expensePieChart" height="220"></canvas>
    </div>
</div>
<script id="pieLabels" type="application/json">{!! json_encode($pieLabels) !!}</script>
<script id="pieData" type="application/json">{!! json_encode($pieData) !!}</script>
@section('scripts')
@parent
<script>
    document.addEventListener('DOMContentLoaded', function() {
        const ctxPie = document.getElementById('expensePieChart').getContext('2d');
        const pieLabels = JSON.parse(document.getElementById('pieLabels').textContent);
        const pieData = JSON.parse(document.getElementById('pieData').textContent);
        new Chart(ctxPie, {
            type: 'pie',
            data: {
                labels: pieLabels,
                datasets: [{
                    data: pieData,
                    backgroundColor: [
                        'rgba(59,130,246,0.7)', // Pembelian Alat
                        'rgba(168,85,247,0.7)', // Pembayaran Bandwith
                        'rgba(16,185,129,0.7)', // Pembayaran Pinjaman
                        'rgba(251,191,36,0.7)', // Komsumsi
                        'rgba(239,68,68,0.7)'   // Lain-Lain
                    ],
                    borderColor: [
                        'rgba(59,130,246,1)',
                        'rgba(168,85,247,1)',
                        'rgba(16,185,129,1)',
                        'rgba(251,191,36,1)',
                        'rgba(239,68,68,1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true, position: 'bottom' },
                    title: { display: false }
                }
            }
        });
    });
</script>
@endsection
