<?php

namespace App\Http\Controllers;

use App\Models\InstallationChecklist;
use App\Models\InstallationLead;
use App\Models\InstallationWorkOrder;
use App\Services\AuditLogService;
use App\Services\FeatureService;
use App\Services\InventoryService;
use App\Services\InstallationWorkflowService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InstallationWorkflowController extends Controller
{
    public function __construct(
        private FeatureService $featureService,
        private InstallationWorkflowService $workflowService,
        private AuditLogService $auditLogService,
        private InventoryService $inventoryService,
    ) {
    }

    public function leads(Request $request)
    {
        $this->ensureEnabled();

        $query = InstallationLead::query()->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('address', 'like', "%{$search}%");
            });
        }

        return response()->json(['data' => $query->paginate((int) $request->input('per_page', 20))]);
    }

    public function storeLead(Request $request)
    {
        $this->ensureEnabled();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'lead_source' => 'nullable|string|max:100',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
        ]);

        $lead = InstallationLead::create($validated);

        $this->auditLogService->log('installation.lead_created', $lead, $lead->toArray(), auth()->id());

        return response()->json(['message' => 'Lead berhasil dibuat.', 'data' => $lead], 201);
    }

    public function workOrders(Request $request)
    {
        $this->ensureEnabled();

        $query = InstallationWorkOrder::query()
            ->with(['lead:id,name,phone', 'customer:id,name,phone', 'assignee:id,name', 'odp:id,nama'])
            ->orderByDesc('scheduled_at')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json(['data' => $query->paginate((int) $request->input('per_page', 20))]);
    }

    public function storeWorkOrder(Request $request)
    {
        $this->ensureEnabled();

        $validated = $request->validate([
            'lead_id' => 'nullable|integer|exists:installation_leads,id',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'assigned_to' => 'nullable|integer|exists:users,id',
            'odp_id' => 'nullable|integer|exists:odps,id',
            'scheduled_at' => 'nullable|date',
            'status' => 'nullable|in:new,scheduled,in_progress,waiting_activation,completed,cancelled',
            'meta' => 'nullable|array',
        ]);

        $workOrder = DB::transaction(function () use ($validated) {
            $workOrder = InstallationWorkOrder::create([
                'lead_id' => $validated['lead_id'] ?? null,
                'customer_id' => $validated['customer_id'] ?? null,
                'assigned_to' => $validated['assigned_to'] ?? null,
                'odp_id' => $validated['odp_id'] ?? null,
                'scheduled_at' => $validated['scheduled_at'] ?? null,
                'status' => $validated['status'] ?? 'new',
                'meta' => $validated['meta'] ?? null,
            ]);

            $this->workflowService->ensureDefaultChecklist($workOrder);
            $this->workflowService->logEvent($workOrder, 'created', 'Work order dibuat.', auth()->id());

            return $workOrder;
        });

        $this->auditLogService->log('installation.work_order_created', $workOrder, $workOrder->toArray(), auth()->id());

        return response()->json([
            'message' => 'Work order berhasil dibuat.',
            'data' => $workOrder->load('checklists'),
        ], 201);
    }

    public function showWorkOrder(InstallationWorkOrder $workOrder)
    {
        $this->ensureEnabled();

        $workOrder->load([
            'lead',
            'customer',
            'assignee:id,name',
            'odp:id,nama',
            'checklists',
            'events.creator:id,name',
            'documents',
        ]);

        return response()->json(['data' => $workOrder]);
    }

    public function updateChecklist(Request $request, InstallationChecklist $checklist)
    {
        $this->ensureEnabled();

        $validated = $request->validate([
            'is_completed' => 'required|boolean',
            'notes' => 'nullable|string|max:500',
        ]);

        $checklist->is_completed = (bool) $validated['is_completed'];
        $checklist->completed_at = $checklist->is_completed ? now() : null;
        $checklist->completed_by = $checklist->is_completed ? auth()->id() : null;
        $checklist->save();

        $this->workflowService->logEvent(
            $checklist->workOrder,
            'checklist_updated',
            sprintf('Checklist %s diubah menjadi %s.', $checklist->label, $checklist->is_completed ? 'selesai' : 'belum selesai'),
            auth()->id(),
            ['notes' => $validated['notes'] ?? null, 'checklist_id' => $checklist->id]
        );

        if (
            $checklist->step_key === 'pppoe_activated'
            && $checklist->is_completed
            && $this->workflowService->canBeCompleted($checklist->workOrder)
            && $checklist->workOrder->status !== 'completed'
        ) {
            $workOrder = $checklist->workOrder;
            $workOrder->status = 'completed';
            $workOrder->completed_at = now();
            $workOrder->save();

            $this->workflowService->logEvent(
                $workOrder,
                'auto_completed',
                'Work order otomatis selesai setelah aktivasi PPPoE berhasil.',
                auth()->id()
            );

            $this->auditLogService->log('installation.work_order_auto_completed', $workOrder, [
                'trigger_step' => $checklist->step_key,
            ], auth()->id());
        }

        return response()->json([
            'message' => 'Checklist berhasil diperbarui.',
            'data' => $checklist,
        ]);
    }

    public function completeWorkOrder(Request $request, InstallationWorkOrder $workOrder)
    {
        $this->ensureEnabled();

        $validated = $request->validate([
            'materials' => 'nullable|array',
            'materials.*.inventory_item_id' => 'required_with:materials|integer|exists:inventory_items,id',
            'materials.*.quantity' => 'required_with:materials|numeric|min:0.01',
            'materials.*.notes' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:500',
        ]);

        if (!$this->workflowService->canBeCompleted($workOrder)) {
            return response()->json([
                'message' => 'Checklist wajib belum lengkap. Work order tidak bisa ditutup.',
            ], 422);
        }

        DB::transaction(function () use ($workOrder, $validated) {
            $materials = $validated['materials'] ?? [];
            if (!empty($materials)) {
                $movements = $this->inventoryService->recordInstallationOutgoingForWorkOrder(
                    $workOrder,
                    $materials,
                    now()->toDateString(),
                    $validated['notes'] ?? null,
                    (int) auth()->id()
                );

                $this->workflowService->logEvent(
                    $workOrder,
                    'inventory_recorded',
                    'Material instalasi dicatat ke inventory.',
                    auth()->id(),
                    ['movement_ids' => collect($movements)->pluck('id')->values()->all()]
                );
            }

            $workOrder->status = 'completed';
            $workOrder->completed_at = now();
            $workOrder->save();
        });

        $this->workflowService->logEvent($workOrder, 'completed', 'Work order diselesaikan.', auth()->id());
        $this->auditLogService->log('installation.work_order_completed', $workOrder, [
            'materials_count' => count($validated['materials'] ?? []),
        ], auth()->id());

        return response()->json([
            'message' => 'Work order berhasil ditutup.',
            'data' => $workOrder,
        ]);
    }

    private function ensureEnabled(): void
    {
        if (!$this->featureService->enabled('installation_workflow_v1')) {
            abort(response()->json(['message' => 'Feature nonaktif.'], 404));
        }
    }
}
