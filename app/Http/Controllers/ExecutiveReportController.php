<?php

namespace App\Http\Controllers;

use App\Models\SiteSetting;
use App\Services\CashObligationAlertService;
use App\Services\ExecutiveDailyReportService;
use App\Services\MonthlyFinancialReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExecutiveReportController extends Controller
{
    public function __construct(
        protected ExecutiveDailyReportService $dailyReportService,
        protected CashObligationAlertService $obligationAlertService,
        protected MonthlyFinancialReportService $monthlyReportService
    ) {}

    /**
     * Mendapatkan konfigurasi laporan eksekutif WhatsApp beserta pratinjau pesan terkini.
     */
    public function getConfig(): JsonResponse
    {
        $rawRecipients = SiteSetting::get(ExecutiveDailyReportService::SETTING_RECIPIENTS, '');
        $recipientsList = $this->dailyReportService->getRecipients();
        $phonesOnly = array_column($recipientsList, 'phone');

        $dailyData = $this->dailyReportService->generateReportData();
        $dailyPreview = $this->dailyReportService->buildMessage($dailyData);

        $monthlyData = $this->monthlyReportService->generateMonthlyReportData();
        $monthlyPreview = $this->monthlyReportService->buildMessage($monthlyData);

        return response()->json([
            'success' => true,
            'data' => [
                'recipients_raw' => $rawRecipients,
                'recipients' => $phonesOnly,
                'daily_enabled' => SiteSetting::get(ExecutiveDailyReportService::SETTING_ENABLED, '1') !== '0',
                'daily_time' => SiteSetting::get(ExecutiveDailyReportService::SETTING_TIME, '21:00'),
                'obligation_enabled' => SiteSetting::get(CashObligationAlertService::SETTING_ENABLED, '1') !== '0',
                'obligation_days_ahead' => (int) SiteSetting::get(CashObligationAlertService::SETTING_DAYS_AHEAD, 3),
                'monthly_pnl_enabled' => SiteSetting::get(MonthlyFinancialReportService::SETTING_ENABLED, '1') !== '0',
                'preview_daily' => $dailyPreview,
                'preview_monthly' => $monthlyPreview,
            ],
        ]);
    }

    /**
     * Memperbarui konfigurasi laporan eksekutif WhatsApp.
     */
    public function updateConfig(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'recipients' => 'nullable|string',
            'daily_enabled' => 'nullable|boolean',
            'daily_time' => 'nullable|string|max:10',
            'obligation_enabled' => 'nullable|boolean',
            'obligation_days_ahead' => 'nullable|integer|min:1|max:14',
            'monthly_pnl_enabled' => 'nullable|boolean',
        ]);

        if (array_key_exists('recipients', $validated)) {
            SiteSetting::set(ExecutiveDailyReportService::SETTING_RECIPIENTS, trim((string) $validated['recipients']));
        }

        if (array_key_exists('daily_enabled', $validated)) {
            SiteSetting::set(ExecutiveDailyReportService::SETTING_ENABLED, $validated['daily_enabled'] ? '1' : '0');
        }

        if (!empty($validated['daily_time'])) {
            SiteSetting::set(ExecutiveDailyReportService::SETTING_TIME, trim($validated['daily_time']));
        }

        if (array_key_exists('obligation_enabled', $validated)) {
            SiteSetting::set(CashObligationAlertService::SETTING_ENABLED, $validated['obligation_enabled'] ? '1' : '0');
        }

        if (!empty($validated['obligation_days_ahead'])) {
            SiteSetting::set(CashObligationAlertService::SETTING_DAYS_AHEAD, (string) $validated['obligation_days_ahead']);
        }

        if (array_key_exists('monthly_pnl_enabled', $validated)) {
            SiteSetting::set(MonthlyFinancialReportService::SETTING_ENABLED, $validated['monthly_pnl_enabled'] ? '1' : '0');
        }

        return response()->json([
            'success' => true,
            'message' => 'Konfigurasi Laporan Eksekutif WhatsApp berhasil disimpan.',
        ]);
    }

    /**
     * Mengirimkan laporan uji coba instan ke nomor WhatsApp yang diminta.
     */
    public function testSend(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => 'required|string|in:daily,obligation,monthly',
            'phone' => 'nullable|string|max:30',
        ]);

        $customRecipients = null;
        if (!empty($validated['phone'])) {
            $customRecipients = [['phone' => trim($validated['phone']), 'name' => 'Owner Uji Coba']];
        }

        switch ($validated['type']) {
            case 'daily':
                $result = $this->dailyReportService->sendReport($customRecipients);
                break;
            case 'obligation':
                $result = $this->obligationAlertService->checkAndSendAlerts($customRecipients);
                break;
            case 'monthly':
                $result = $this->monthlyReportService->sendReport($customRecipients);
                break;
            default:
                return response()->json(['success' => false, 'message' => 'Jenis laporan tidak valid.'], 400);
        }

        return response()->json($result, $result['success'] ? 200 : 400);
    }
}
