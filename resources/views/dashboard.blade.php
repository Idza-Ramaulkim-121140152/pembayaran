@section('title', 'Dashboard')
<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Dashboard') }}
        </h2>
    </x-slot>

    <div class="py-6 sm:py-10">
        <div class="max-w-4xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8">
            <div class="bg-white overflow-hidden shadow-sm rounded-lg">
                <div class="p-4 sm:p-6 text-gray-900 flex flex-col gap-4">
                    <h3 class="text-lg font-bold mb-2 sm:mb-4">Ringkasan Pendapatan</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="flex flex-col bg-blue-50 rounded p-3">
                            <span class="font-semibold text-sm sm:text-base">Pendapatan Bulan Ini</span>
                            <span class="text-lg sm:text-xl font-bold text-blue-700">Rp {{ number_format($thisMonthIncome, 0, ',', '.') }}</span>
                        </div>
                        <div class="flex flex-col bg-green-50 rounded p-3">
                            <span class="font-semibold text-sm sm:text-base">Pendapatan Bulan Kemarin</span>
                            <span class="text-lg sm:text-xl font-bold text-green-700">Rp {{ number_format($lastMonthIncome, 0, ',', '.') }}</span>
                        </div>
                        <div class="flex flex-col bg-yellow-50 rounded p-3">
                            <span class="font-semibold text-sm sm:text-base">Pelanggan Sudah Bayar Bulan Ini</span>
                            <span class="text-lg sm:text-xl font-bold text-yellow-700">{{ $paidCustomers }}</span>
                        </div>
                        <div class="flex flex-col bg-red-50 rounded p-3">
                            <span class="font-semibold text-sm sm:text-base">Pelanggan Telat Bayar</span>
                            <span class="text-lg sm:text-xl font-bold text-red-700">{{ $lateCustomers }}</span>
                        </div>
                    </div>
                    <div class="mt-6 sm:mt-8">
                        <h4 class="font-semibold mb-2">Grafik Pendapatan 12 Bulan Terakhir</h4>
                        <div class="w-full overflow-x-auto mb-8">
                            <canvas id="incomeChart" height="100" class="min-w-[350px] sm:min-w-0"></canvas>
                        </div>
                        <script id="incomeChartLabels" type="application/json">{!! json_encode($monthLabels) !!}</script>
                        <script id="incomeChartData" type="application/json">{!! json_encode($monthlyIncome) !!}</script>
                        <h4 class="font-semibold mb-2 mt-8">Pemasangan Baru 12 Bulan Terakhir</h4>
                        <div class="w-full overflow-x-auto">
                            <canvas id="installChart" height="100" class="min-w-[350px] sm:min-w-0"></canvas>
                        </div>
                        <script id="installChartLabels" type="application/json">{!! json_encode($installLabels) !!}</script>
                        <script id="installChartData" type="application/json">{!! json_encode($monthlyInstalls) !!}</script>

                        @include('components.dashboard-expense-chart')
                    </div>
                </div>
            </div>
        </div>
    </div>

    @section('scripts')
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Chart Pendapatan
            const ctx = document.getElementById('incomeChart').getContext('2d');
            const labels = JSON.parse(document.getElementById('incomeChartLabels').textContent);
            const data = JSON.parse(document.getElementById('incomeChartData').textContent);
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Pendapatan',
                        data: data,
                        borderColor: 'rgba(59, 130, 246, 1)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        title: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return 'Rp ' + value.toLocaleString('id-ID');
                                }
                            }
                        }
                    }
                }
            });

            // Chart Pemasangan Bulanan
            const ctx2 = document.getElementById('installChart').getContext('2d');
            const labels2 = JSON.parse(document.getElementById('installChartLabels').textContent);
            const data2 = JSON.parse(document.getElementById('installChartData').textContent);
            new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: labels2,
                    datasets: [{
                        label: 'Pemasangan Baru',
                        data: data2,
                        backgroundColor: 'rgba(16, 185, 129, 0.5)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        title: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            precision: 0
                        }
                    }
                }
            });
        });
    </script>
    @endsection
</x-app-layout>
