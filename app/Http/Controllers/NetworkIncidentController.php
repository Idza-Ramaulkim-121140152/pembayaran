<?php

namespace App\Http\Controllers;

use App\Models\NetworkIncident;
use App\Services\AuditLogService;
use App\Services\FeatureService;
use App\Services\IncidentPublisherService;
use App\Services\OdpIncidentEngineService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NetworkIncidentController extends Controller
{
    public function __construct(
        private FeatureService $featureService,
        private IncidentPublisherService $publisherService,
        private AuditLogService $auditLogService,
        private OdpIncidentEngineService $engineService,
    ) {
    }

    public function index(Request $request)
    {
        $this->ensureEnabled();

        $query = NetworkIncident::query()
            ->with(['odps:id,nama', 'creator:id,name'])
            ->orderByDesc('started_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('severity')) {
            $query->where('severity', $request->severity);
        }

        return response()->json([
            'data' => $query->paginate((int) $request->input('per_page', 20)),
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureEnabled();

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'severity' => 'required|in:low,medium,high,critical',
            'odp_ids' => 'required|array|min:1',
            'odp_ids.*' => 'integer|exists:odps,id',
            'message' => 'nullable|string',
            'affected_area' => 'nullable|string|max:255',
        ]);

        $incident = DB::transaction(function () use ($validated) {
            $incident = NetworkIncident::create([
                'title' => $validated['title'],
                'severity' => $validated['severity'],
                'status' => 'open',
                'started_at' => now(),
                'detected_by' => 'manual',
                'meta' => [
                    'message' => $validated['message'] ?? $validated['title'],
                    'affected_area' => $validated['affected_area'] ?? null,
                ],
                'created_by' => auth()->id(),
            ]);

            $incident->odps()->sync($validated['odp_ids']);

            return $incident;
        });

        $this->publisherService->publish($incident, auth()->id());
        $this->auditLogService->log('incident.manual_opened', $incident, ['odp_ids' => $validated['odp_ids']], auth()->id());

        return response()->json([
            'message' => 'Incident berhasil dibuat.',
            'data' => $incident->load('odps:id,nama'),
        ], 201);
    }

    public function resolve(Request $request, NetworkIncident $incident)
    {
        $this->ensureEnabled();

        if ($incident->status === 'resolved') {
            return response()->json(['message' => 'Incident sudah resolved.'], 422);
        }

        $validated = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $incident->status = 'resolved';
        $incident->resolved_at = now();
        $incident->meta = array_merge($incident->meta ?? [], [
            'resolve_reason' => $validated['reason'] ?? null,
        ]);
        $incident->save();

        $this->publisherService->publish($incident, auth()->id());
        $this->auditLogService->log('incident.manual_resolved', $incident, [
            'reason' => $validated['reason'] ?? null,
        ], auth()->id());

        return response()->json([
            'message' => 'Incident berhasil ditutup.',
            'data' => $incident->fresh('odps:id,nama'),
        ]);
    }

    public function runEngine()
    {
        $this->ensureEnabled();

        $summary = $this->engineService->run(auth()->id());

        return response()->json([
            'message' => 'Incident engine dijalankan.',
            'data' => $summary,
        ]);
    }

    private function ensureEnabled(): void
    {
        if (!$this->featureService->enabled('incident_engine_v1')) {
            abort(response()->json(['message' => 'Feature nonaktif.'], 404));
        }
    }
}
