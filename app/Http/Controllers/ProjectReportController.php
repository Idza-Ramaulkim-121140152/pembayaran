<?php

namespace App\Http\Controllers;

use App\Models\ProjectReport;
use App\Services\ProjectReportService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ProjectReportController extends Controller
{
    public function index(ProjectReportService $service)
    {
        return response()->json([
            'success' => true,
            'data' => $service->index(),
        ]);
    }

    public function options(ProjectReportService $service)
    {
        return response()->json([
            'success' => true,
            'data' => $service->options(),
        ]);
    }

    public function show(ProjectReport $projectReport, ProjectReportService $service)
    {
        return response()->json([
            'success' => true,
            'data' => $service->detail($projectReport),
        ]);
    }

    public function store(Request $request, ProjectReportService $service)
    {
        $validated = $this->validatePayload($request, $service);
        $projectReport = $service->store($validated);

        return response()->json([
            'success' => true,
            'message' => 'Project report berhasil dibuat.',
            'data' => $service->detail($projectReport),
        ], 201);
    }

    public function update(Request $request, ProjectReport $projectReport, ProjectReportService $service)
    {
        $validated = $this->validatePayload($request, $service);
        $projectReport = $service->update($projectReport, $validated);

        return response()->json([
            'success' => true,
            'message' => 'Project report berhasil diperbarui.',
            'data' => $service->detail($projectReport),
        ]);
    }

    private function validatePayload(Request $request, ProjectReportService $service): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'is_active' => ['nullable', 'boolean'],
            'wilayah_mappings' => ['nullable', 'array'],
            'wilayah_mappings.*.level' => ['required_with:wilayah_mappings', 'in:kecamatan,desa,dusun'],
            'wilayah_mappings.*.id' => ['required_with:wilayah_mappings', 'integer', 'min:1'],
            'customer_ids' => ['nullable', 'array'],
            'customer_ids.*' => ['integer', 'exists:customers,id'],
            'manual_expenses' => ['nullable', 'array'],
            'manual_expenses.*.name' => ['required_with:manual_expenses', 'string', 'max:255'],
            'manual_expenses.*.category' => ['nullable', 'string', 'max:255'],
            'manual_expenses.*.quantity' => ['required_with:manual_expenses', 'numeric', 'min:0'],
            'manual_expenses.*.unit' => ['nullable', 'string', 'max:50'],
            'manual_expenses.*.unit_price' => ['required_with:manual_expenses', 'numeric', 'min:0'],
            'manual_expenses.*.notes' => ['nullable', 'string'],
        ]);

        $wilayahErrors = $service->validateWilayahMappings($validated['wilayah_mappings'] ?? []);
        if ($wilayahErrors !== []) {
            throw ValidationException::withMessages($wilayahErrors);
        }

        return $validated;
    }
}
