<?php

namespace App\Console\Commands;

use App\Http\Controllers\DashboardController;
use App\Models\Customer;
use App\Models\FinancialTransaction;
use App\Models\Invoice;
use App\Models\NetworkIncident;
use App\Models\Complaint;
use App\Models\PredictionRun;
use App\Models\PredictionRunItem;
use App\Services\DashboardPredictionPythonWorker;
use App\Services\DashboardPredictionSnapshotService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class GenerateDashboardPredictionSnapshot extends Command
{
    protected $signature = 'dashboard:prediction-snapshot {--scope=prediction_bundle} {--month=}';

    protected $description = 'Generate hourly dashboard prediction snapshot bundle';

    public function __construct(
        private DashboardPredictionSnapshotService $snapshotService,
        private DashboardPredictionPythonWorker $pythonWorker,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $scope = (string) $this->option('scope');
        $now = Carbon::now();
        $monthArg = (string) ($this->option('month') ?? '');
        $monthReference = preg_match('/^\d{4}-\d{2}$/', $monthArg) === 1
            ? Carbon::parse($monthArg . '-01')
            : Carbon::today();

        $ranges = [
            'kpi_start' => Carbon::today()->subDays(29)->startOfDay(),
            'kpi_end' => Carbon::today()->endOfDay(),
            'forecast_start' => Carbon::today()->startOfDay(),
            'forecast_end' => Carbon::today()->addDays(7)->endOfDay(),
            'projection_start' => $monthReference->copy()->startOfMonth()->startOfDay(),
            'projection_end' => $monthReference->copy()->endOfMonth()->endOfDay(),
        ];

        try {
            $controller = app(DashboardController::class);
            $baseBundle = $controller->buildPredictionBundleData($ranges);

            $pythonPayload = [
                'generated_at' => $now->toIso8601String(),
                'hourly_revenue_history' => $this->buildHourlyRevenueHistory(60),
                'invoice_signals' => $this->buildInvoiceSignals(),
                'customer_signals' => $this->buildCustomerSignals(),
                'monthly_revenue_sources' => $this->buildMonthlyRevenueSources(12),
                'existing_summary' => [
                    'kpi' => $baseBundle['management_kpis']['summary'] ?? [],
                    'forecast' => $baseBundle['revenue_forecast']['summary'] ?? [],
                    'projection' => $baseBundle['financial_projection']['summary'] ?? [],
                    'isp' => $baseBundle['isp_intelligence']['summary'] ?? [],
                ],
                'existing_sections' => [
                    'management_kpis' => $baseBundle['management_kpis'] ?? [],
                    'revenue_forecast' => $baseBundle['revenue_forecast'] ?? [],
                    'financial_projection' => $baseBundle['financial_projection'] ?? [],
                    'isp_intelligence' => $baseBundle['isp_intelligence'] ?? [],
                ],
            ];

            $pythonResult = $this->pythonWorker->snapshot($pythonPayload);
            $innovations = [];
            $modelMeta = [
                'model_version' => 'xgboost-hourly-v2.1',
                'worker_status' => $pythonResult['ok'] ? 'ok' : 'failed_fallback',
            ];
            $sectionKeys = ['management_kpis', 'revenue_forecast', 'financial_projection', 'isp_intelligence'];
            $sectionSources = [];
            $bundleWarnings = [];
            $resolvedSections = [];

            if ($pythonResult['ok']) {
                $workerData = (array) ($pythonResult['data'] ?? []);
                $innovations = [
                    'hourly_forecast_24h' => $workerData['hourly_forecast_24h'] ?? [],
                    'backtest_report' => $workerData['backtest_report'] ?? [],
                    'risk_alarm_24h' => $workerData['risk_alarm_24h'] ?? [],
                    'collection_probability' => $workerData['collection_probability'] ?? [],
                    'what_if_simulator' => $workerData['what_if_simulator'] ?? [],
                    'customer_growth_forecast_monthly' => $workerData['customer_growth_forecast_monthly'] ?? [],
                    'monthly_total_revenue_forecast' => $workerData['monthly_total_revenue_forecast'] ?? [],
                ];
                $modelMeta = array_merge($modelMeta, (array) ($workerData['model_meta'] ?? []));

                foreach ($sectionKeys as $sectionKey) {
                    [$resolvedSection, $sectionSource, $warning] = $this->resolveSectionPayload(
                        $workerData,
                        $baseBundle,
                        $sectionKey,
                        $now
                    );
                    $resolvedSections[$sectionKey] = $resolvedSection;
                    $sectionSources[$sectionKey] = $sectionSource;
                    if ($warning !== null) {
                        $bundleWarnings[] = [
                            'section' => $sectionKey,
                            'reason' => $warning,
                        ];
                    }
                }
            } else {
                $this->warn('Python worker gagal, memakai fallback lokal: ' . ($pythonResult['error'] ?? 'unknown_error'));
                $innovations = $this->buildFallbackInnovations($baseBundle);
                $modelMeta['worker_error'] = $pythonResult['error'] ?? 'unknown_error';
                foreach ($sectionKeys as $sectionKey) {
                    $resolvedSections[$sectionKey] = $this->normalizeSectionWithMeta(
                        (array) ($baseBundle[$sectionKey] ?? []),
                        'fallback',
                        $now,
                        'worker_failed'
                    );
                    $sectionSources[$sectionKey] = 'fallback';
                    $bundleWarnings[] = [
                        'section' => $sectionKey,
                        'reason' => 'worker_failed',
                    ];
                }
            }

            $bundle = $controller->buildPredictionBundleData($ranges, $innovations, [
                'snapshot_generated_at' => $now->toIso8601String(),
                'is_stale' => false,
                'model_version' => (string) ($modelMeta['model_version'] ?? 'xgboost-hourly-v2.1'),
                'data_granularity' => 'hourly',
                'section_sources' => $sectionSources,
                'model_bundle_version' => (string) ($modelMeta['model_bundle_version'] ?? 'prediction-bundle-v2.2'),
                'bundle_warnings' => $bundleWarnings,
            ]);

            foreach ($sectionKeys as $sectionKey) {
                if (isset($resolvedSections[$sectionKey])) {
                    $bundle[$sectionKey] = $resolvedSections[$sectionKey];
                }
            }

            $snapshot = $this->snapshotService->saveReady(
                $scope,
                $ranges['kpi_start'],
                $ranges['projection_end'],
                $bundle,
                $modelMeta,
                Carbon::now()->addHour()
            );

            $this->createPredictionRunBaseline($snapshot->id, $bundle, $modelMeta);

            $this->info('Snapshot prediksi berhasil dibuat. ID: ' . $snapshot->id);
            return self::SUCCESS;
        } catch (\Throwable $e) {
            if (Schema::hasTable('dashboard_prediction_snapshots')) {
                $this->snapshotService->saveFailed(
                    $scope,
                    $ranges['kpi_start'],
                    $ranges['projection_end'],
                    $e->getMessage(),
                    ['model_version' => 'xgboost-hourly-v2.1']
                );
            }
            $this->error('Gagal membuat snapshot prediksi: ' . $e->getMessage());
            return self::FAILURE;
        }
    }

    private function buildHourlyRevenueHistory(int $days = 60): array
    {
        $start = Carbon::now()->subDays(max($days, 2))->startOfHour();
        $end = Carbon::now()->startOfHour();

        $txRows = FinancialTransaction::query()
            ->selectRaw('DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00") as ts_hour, SUM(CASE WHEN type = "income" THEN amount ELSE 0 END) as income_total, SUM(CASE WHEN type = "expense" THEN amount ELSE 0 END) as expense_total, SUM(CASE WHEN type = "adjustment" THEN amount ELSE 0 END) as adjustment_total')
            ->whereBetween('created_at', [$start, $end->copy()->addHour()])
            ->groupBy('ts_hour')
            ->orderBy('ts_hour')
            ->get();

        $invoiceRows = Invoice::query()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$start, $end->copy()->addHour()])
            ->selectRaw('DATE_FORMAT(paid_at, "%Y-%m-%d %H:00:00") as ts_hour, SUM(amount) as paid_total')
            ->groupBy('ts_hour')
            ->orderBy('ts_hour')
            ->get();

        $complaintRows = Schema::hasTable('complaints')
            ? Complaint::query()
                ->whereBetween('created_at', [$start, $end->copy()->addHour()])
                ->selectRaw('DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00") as ts_hour, COUNT(*) as complaint_total')
                ->groupBy('ts_hour')
                ->orderBy('ts_hour')
                ->get()
            : collect();

        $incidentRows = Schema::hasTable('network_incidents')
            ? NetworkIncident::query()
                ->whereBetween('created_at', [$start, $end->copy()->addHour()])
                ->selectRaw('DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00") as ts_hour, COUNT(*) as incident_total')
                ->groupBy('ts_hour')
                ->orderBy('ts_hour')
                ->get()
            : collect();

        $txMap = [];
        foreach ($txRows as $row) {
            $txMap[(string) $row->ts_hour] = [
                'income' => (float) ($row->income_total ?? 0),
                'expense' => (float) ($row->expense_total ?? 0),
                'adjustment' => (float) ($row->adjustment_total ?? 0),
            ];
        }

        $invoiceMap = [];
        foreach ($invoiceRows as $row) {
            $invoiceMap[(string) $row->ts_hour] = (float) ($row->paid_total ?? 0);
        }

        $complaintMap = [];
        foreach ($complaintRows as $row) {
            $complaintMap[(string) $row->ts_hour] = (int) ($row->complaint_total ?? 0);
        }

        $incidentMap = [];
        foreach ($incidentRows as $row) {
            $incidentMap[(string) $row->ts_hour] = (int) ($row->incident_total ?? 0);
        }

        $payload = [];
        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            $hourKey = $cursor->format('Y-m-d H:00:00');
            $tx = $txMap[$hourKey] ?? ['income' => 0.0, 'expense' => 0.0, 'adjustment' => 0.0];
            $invoiceRevenue = (float) ($invoiceMap[$hourKey] ?? 0);
            $ledgerIncome = (float) ($tx['income'] ?? 0);

            $revenue = max($invoiceRevenue, $ledgerIncome);
            $payload[] = [
                'ts' => $hourKey,
                'revenue' => $revenue,
                'expense' => (float) ($tx['expense'] ?? 0),
                'adjustment' => (float) ($tx['adjustment'] ?? 0),
                'complaint_count' => (int) ($complaintMap[$hourKey] ?? 0),
                'incident_count' => (int) ($incidentMap[$hourKey] ?? 0),
            ];

            $cursor->addHour();
        }

        return $payload;
    }

    private function buildInvoiceSignals(): array
    {
        $today = Carbon::today();
        $horizon = Carbon::today()->addDays(30);

        $summary = Invoice::query()
            ->selectRaw('status, COUNT(*) as total_count, COALESCE(SUM(amount), 0) as total_amount')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $dueBuckets = Invoice::query()
            ->whereDate('due_date', '>=', $today->toDateString())
            ->whereDate('due_date', '<=', $horizon->toDateString())
            ->selectRaw('DATE(due_date) as due_day, COUNT(*) as total_count, COALESCE(SUM(amount), 0) as total_amount')
            ->groupBy(DB::raw('DATE(due_date)'))
            ->orderBy('due_day')
            ->get();

        return [
            'status_summary' => [
                'unpaid_count' => (int) ($summary['unpaid']->total_count ?? 0),
                'waiting_count' => (int) ($summary['menunggu konfirmasi']->total_count ?? 0),
                'paid_count' => (int) ($summary['paid']->total_count ?? 0),
                'overdue_count' => (int) ($summary['overdue']->total_count ?? 0),
                'unpaid_amount' => (float) ($summary['unpaid']->total_amount ?? 0),
                'waiting_amount' => (float) ($summary['menunggu konfirmasi']->total_amount ?? 0),
                'overdue_amount' => (float) ($summary['overdue']->total_amount ?? 0),
            ],
            'due_buckets' => $dueBuckets->map(fn ($row) => [
                'date' => (string) $row->due_day,
                'count' => (int) ($row->total_count ?? 0),
                'amount' => (float) ($row->total_amount ?? 0),
            ])->values()->all(),
        ];
    }

    private function buildCustomerSignals(): array
    {
        $today = Carbon::today();

        $rows = Customer::query()
            ->leftJoin('invoices as i', function ($join) {
                $join->on('i.customer_id', '=', 'customers.id')
                    ->whereIn('i.status', ['unpaid', 'overdue', 'menunggu konfirmasi']);
            })
            ->selectRaw('customers.id, customers.name, customers.due_date, customers.is_active, COUNT(i.id) as open_invoice_count, COALESCE(SUM(i.amount), 0) as open_invoice_amount')
            ->groupBy('customers.id', 'customers.name', 'customers.due_date', 'customers.is_active')
            ->orderByDesc('open_invoice_amount')
            ->limit(500)
            ->get();

        return $rows->map(function ($row) use ($today) {
            $dueDate = $row->due_date ? Carbon::parse($row->due_date) : null;
            $daysOverdue = $dueDate && $dueDate->lt($today) ? $dueDate->diffInDays($today) : 0;

            return [
                'customer_id' => (int) $row->id,
                'name' => (string) ($row->name ?? ''),
                'is_active' => (bool) ($row->is_active ?? false),
                'days_overdue' => (int) $daysOverdue,
                'open_invoice_count' => (int) ($row->open_invoice_count ?? 0),
                'open_invoice_amount' => (float) ($row->open_invoice_amount ?? 0),
            ];
        })->values()->all();
    }

    private function buildMonthlyRevenueSources(int $months = 12): array
    {
        $startMonth = Carbon::today()->startOfMonth()->subMonths(max($months - 1, 1));
        $startDate = $startMonth->toDateString();

        $invoiceRows = Invoice::query()
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->whereDate('paid_at', '>=', $startDate)
            ->selectRaw('DATE_FORMAT(paid_at, "%Y-%m") as ym, COALESCE(SUM(amount), 0) as total')
            ->groupBy('ym')
            ->orderBy('ym')
            ->get()
            ->keyBy('ym');

        $installationRows = FinancialTransaction::query()
            ->where('type', 'income')
            ->whereDate('transaction_date', '>=', $startDate)
            ->where(function ($query) {
                $query->where('source', 'installation')
                    ->orWhere('category', 'installation')
                    ->orWhere('description', 'like', '%instal%');
            })
            ->selectRaw('DATE_FORMAT(transaction_date, "%Y-%m") as ym, COALESCE(SUM(amount), 0) as total')
            ->groupBy('ym')
            ->orderBy('ym')
            ->get()
            ->keyBy('ym');

        $otherIncomeRows = FinancialTransaction::query()
            ->where('type', 'income')
            ->whereDate('transaction_date', '>=', $startDate)
            ->where(function ($query) {
                $query->where('source', '!=', 'installation')
                    ->orWhereNull('source');
            })
            ->selectRaw('DATE_FORMAT(transaction_date, "%Y-%m") as ym, COALESCE(SUM(amount), 0) as total')
            ->groupBy('ym')
            ->orderBy('ym')
            ->get()
            ->keyBy('ym');

        $expenseRows = FinancialTransaction::query()
            ->where('type', 'expense')
            ->whereDate('transaction_date', '>=', $startDate)
            ->selectRaw('DATE_FORMAT(transaction_date, "%Y-%m") as ym, COALESCE(SUM(amount), 0) as total')
            ->groupBy('ym')
            ->orderBy('ym')
            ->get()
            ->keyBy('ym');

        $result = [];
        $cursor = $startMonth->copy();
        $end = Carbon::today()->startOfMonth();

        while ($cursor->lte($end)) {
            $ym = $cursor->format('Y-m');
            $billing = (float) ($invoiceRows[$ym]->total ?? 0);
            $installation = (float) ($installationRows[$ym]->total ?? 0);
            $other = (float) ($otherIncomeRows[$ym]->total ?? 0);
            $expense = (float) ($expenseRows[$ym]->total ?? 0);

            $gross = $billing + $installation + $other;
            $net = $gross - $expense;

            $result[] = [
                'month' => $ym,
                'billing_recurring' => $billing,
                'installation' => $installation,
                'other_financial_income' => $other,
                'gross_total' => $gross,
                'expense_total' => $expense,
                'net_total' => $net,
            ];

            $cursor->addMonth();
        }

        return $result;
    }

    private function buildFallbackInnovations(array $baseBundle): array
    {
        $kpiSummary = (array) ($baseBundle['management_kpis']['summary'] ?? []);
        $projectionSummary = (array) ($baseBundle['financial_projection']['summary'] ?? []);
        $ispSummary = (array) ($baseBundle['isp_intelligence']['summary'] ?? []);
        $forecastSummary = (array) ($baseBundle['revenue_forecast']['summary'] ?? []);

        $riskScore = 0;
        $riskScore += ((float) ($kpiSummary['overdue_rate'] ?? 0)) * 0.4;
        $riskScore += max(0, 100 - (float) ($kpiSummary['collection_rate'] ?? 0)) * 0.3;
        $riskScore += ((float) ($ispSummary['network_instability_ratio'] ?? 0)) * 0.3;

        $riskLevel = $riskScore >= 70 ? 'critical' : ($riskScore >= 40 ? 'warning' : 'normal');

        return [
            'hourly_forecast_24h' => [],
            'backtest_report' => [
                'window_7d' => null,
                'window_30d' => null,
                'last_calculated_at' => null,
            ],
            'risk_alarm_24h' => [
                'risk_level' => $riskLevel,
                'risk_score' => round($riskScore, 2),
                'top_drivers' => [
                    'overdue_rate' => (float) ($kpiSummary['overdue_rate'] ?? 0),
                    'collection_rate' => (float) ($kpiSummary['collection_rate'] ?? 0),
                    'network_instability_ratio' => (float) ($ispSummary['network_instability_ratio'] ?? 0),
                ],
            ],
            'collection_probability' => [],
            'what_if_simulator' => [
                'baseline_month_net' => (float) ($projectionSummary['net_projection'] ?? 0),
                'scenarios' => [
                    [
                        'key' => 'collection_plus_10pct',
                        'label' => 'Collection +10%',
                        'estimated_delta_net' => round(((float) ($forecastSummary['predicted_total_revenue'] ?? 0)) * 0.10, 2),
                    ],
                    [
                        'key' => 'expense_minus_10pct',
                        'label' => 'Expense -10%',
                        'estimated_delta_net' => round(((float) ($projectionSummary['projected_total_expense'] ?? 0)) * 0.10, 2),
                    ],
                ],
            ],
            'customer_growth_forecast_monthly' => [
                'months' => [],
            ],
            'monthly_total_revenue_forecast' => [
                'months' => [],
            ],
        ];
    }

    private function resolveSectionPayload(array $workerData, array $baseBundle, string $sectionKey, Carbon $generatedAt): array
    {
        $candidate = $workerData[$sectionKey] ?? null;
        if ($this->isValidPredictionSection($sectionKey, $candidate)) {
            return [
                $this->normalizeSectionWithMeta((array) $candidate, 'model', $generatedAt),
                'model',
                null,
            ];
        }

        return [
            $this->normalizeSectionWithMeta(
                (array) ($baseBundle[$sectionKey] ?? []),
                'fallback',
                $generatedAt,
                $candidate === null ? 'missing_model_section' : 'invalid_model_section'
            ),
            'fallback',
            $candidate === null ? 'missing_model_section' : 'invalid_model_section',
        ];
    }

    private function isValidPredictionSection(string $sectionKey, mixed $section): bool
    {
        if (!is_array($section)) {
            return false;
        }

        return match ($sectionKey) {
            'management_kpis' => isset($section['summary']) && is_array($section['summary']),
            'revenue_forecast' => isset($section['summary']) && is_array($section['summary']) && array_key_exists('daily_forecast', $section) && is_array($section['daily_forecast']),
            'financial_projection' => isset($section['summary']) && is_array($section['summary']) && array_key_exists('daily_projection', $section) && is_array($section['daily_projection']),
            'isp_intelligence' => isset($section['summary']) && is_array($section['summary']) && array_key_exists('risk_matrix', $section) && is_array($section['risk_matrix']),
            default => !empty($section),
        };
    }

    private function normalizeSectionWithMeta(array $section, string $source, Carbon $generatedAt, ?string $warning = null): array
    {
        $meta = isset($section['meta']) && is_array($section['meta']) ? $section['meta'] : [];
        $quality = isset($meta['quality']) && is_array($meta['quality']) ? $meta['quality'] : [];

        if ($warning !== null && !isset($quality['warning'])) {
            $quality['warning'] = $warning;
        }

        $section['meta'] = array_merge($meta, [
            'source' => $source,
            'generated_at' => $meta['generated_at'] ?? $generatedAt->toIso8601String(),
            'quality' => $quality,
        ]);

        return $section;
    }

    private function createPredictionRunBaseline(int $snapshotId, array $bundle, array $modelMeta): void
    {
        if (($modelMeta['worker_status'] ?? null) !== 'ok') {
            return;
        }

        $sectionSources = (array) data_get($bundle, 'meta.section_sources', []);
        if (($sectionSources['revenue_forecast'] ?? null) !== 'model') {
            return;
        }

        $runDate = Carbon::today('Asia/Jakarta')->toDateString();
        $dailyForecast = collect((array) data_get($bundle, 'revenue_forecast.daily_forecast', []));
        if ($dailyForecast->count() === 0) {
            return;
        }

        $run = PredictionRun::query()->firstOrCreate(
            [
                'run_date' => $runDate,
                'horizon_days' => 7,
            ],
            [
                'status' => 'ready',
                'model_version' => (string) ($modelMeta['model_version'] ?? ''),
                'model_trained_at' => !empty($modelMeta['trained_at']) ? Carbon::parse($modelMeta['trained_at']) : null,
                'snapshot_id' => $snapshotId,
            ]
        );

        if ($run->wasRecentlyCreated) {
            $targets = $dailyForecast
                ->filter(function ($item) use ($runDate) {
                    $date = (string) ($item['date'] ?? '');
                    return $date > $runDate;
                })
                ->take(7)
                ->values();

            foreach ($targets as $row) {
                $targetDate = (string) ($row['date'] ?? '');
                if ($targetDate === '') {
                    continue;
                }

                PredictionRunItem::query()->updateOrCreate(
                    [
                        'prediction_run_id' => $run->id,
                        'target_date' => $targetDate,
                        'domain' => 'revenue_daily',
                    ],
                    [
                        'predicted_value' => (float) ($row['predicted_revenue'] ?? 0),
                    ]
                );
            }

            \Log::info('dashboard.prediction.run_created', [
                'prediction_run_id' => $run->id,
                'run_date' => $runDate,
                'snapshot_id' => $snapshotId,
                'model_version' => $run->model_version,
            ]);
        }
    }
}
