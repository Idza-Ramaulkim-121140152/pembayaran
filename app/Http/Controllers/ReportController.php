<?php

namespace App\Http\Controllers;

use App\Services\CustomerIncomeReportService;
use App\Services\InactiveCustomerReportService;
use App\Services\InstallationReportService;
use App\Services\ReportSummaryService;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function summary(Request $request, ReportSummaryService $service)
    {
        $validated = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
        ]);

        return response()->json([
            'success' => true,
            'data' => $service->summary($validated['month'] ?? null),
        ]);
    }

    public function customerIncome(Request $request, CustomerIncomeReportService $service)
    {
        foreach (['include_estimated', 'has_cable_only'] as $booleanField) {
            if (!$request->has($booleanField)) {
                continue;
            }

            $rawValue = $request->query($booleanField);

            if (!is_string($rawValue)) {
                continue;
            }

            $normalized = match (strtolower($rawValue)) {
                'true', '1', 'yes', 'on' => true,
                'false', '0', 'no', 'off' => false,
                default => $rawValue,
            };

            $request->merge([
                $booleanField => $normalized,
            ]);
        }

        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'profit_status' => ['nullable', 'in:all,untung,rugi,impas'],
            'include_estimated' => ['nullable', 'boolean'],
            'has_cable_only' => ['nullable', 'boolean'],
        ]);

        return response()->json([
            'success' => true,
            'data' => $service->build($validated),
        ]);
    }

    public function installations(Request $request, InstallationReportService $service)
    {
        if ($request->has('include_estimated') && is_string($request->query('include_estimated'))) {
            $request->merge([
                'include_estimated' => match (strtolower((string) $request->query('include_estimated'))) {
                    'true', '1', 'yes', 'on' => true,
                    'false', '0', 'no', 'off' => false,
                    default => $request->query('include_estimated'),
                },
            ]);
        }

        $validated = $request->validate([
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'search' => ['nullable', 'string', 'max:255'],
            'profit_status' => ['nullable', 'in:all,untung,rugi,impas'],
            'wilayah_level' => ['nullable', 'in:all,kecamatan,desa,dusun'],
            'wilayah_id' => ['nullable', 'integer'],
            'include_estimated' => ['nullable', 'boolean'],
        ]);

        return response()->json([
            'success' => true,
            'data' => $service->build($validated),
        ]);
    }

    public function inactiveCustomers(Request $request, InactiveCustomerReportService $service)
    {
        $validated = $request->validate([
            'as_of_date' => ['nullable', 'date'],
            'search' => ['nullable', 'string', 'max:255'],
            'isolation_status' => ['nullable', 'in:all,isolir,belum_isolir'],
            'invoice_status' => ['nullable', 'string', 'max:100'],
            'aging_bucket' => ['nullable', 'in:all,1_3,4_7,8_14,15_30,30_plus'],
            'sort_by' => ['nullable', 'in:days_overdue_desc,overdue_amount_desc,due_date_asc,priority_desc'],
        ]);

        return response()->json([
            'success' => true,
            'data' => $service->build($validated),
        ]);
    }
}
