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

        $autoCompletedOrder = null;

        DB::transaction(function () use ($checklist, $validated, &$autoCompletedOrder) {
            $checklist->is_completed = (bool) $validated['is_completed'];
            $checklist->completed_at = $checklist->is_completed ? now() : null;
            $checklist->completed_by = $checklist->is_completed ? auth()->id() : null;
            $checklist->save();

            $workOrder = InstallationWorkOrder::query()
                ->lockForUpdate()
                ->findOrFail($checklist->installation_work_order_id);

            $this->workflowService->logEvent(
                $workOrder,
                'checklist_updated',
                sprintf('Checklist %s diubah menjadi %s.', $checklist->label, $checklist->is_completed ? 'selesai' : 'belum selesai'),
                auth()->id(),
                ['notes' => $validated['notes'] ?? null, 'checklist_id' => $checklist->id]
            );

            if (
                $checklist->step_key === 'pppoe_activated'
                && $checklist->is_completed
                && $workOrder->status !== 'completed'
                && $this->workflowService->canBeCompleted($workOrder)
            ) {
                $workOrder->status = 'completed';
                $workOrder->completed_at = now();
                $workOrder->save();

                $this->workflowService->logEvent(
                    $workOrder,
                    'auto_completed',
                    'Work order otomatis selesai setelah aktivasi PPPoE berhasil.',
                    auth()->id()
                );

                $autoCompletedOrder = $workOrder;
            }
        });

        if ($autoCompletedOrder) {
            $this->auditLogService->log('installation.work_order_auto_completed', $autoCompletedOrder, [
                'trigger_step' => $checklist->step_key,
            ], auth()->id());
        }

        return response()->json([
            'message' => 'Checklist berhasil diperbarui.',
            'data' => $checklist->fresh(),
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

        $completedOrder = DB::transaction(function () use ($workOrder, $validated) {
            $lockedOrder = InstallationWorkOrder::query()
                ->lockForUpdate()
                ->findOrFail($workOrder->id);

            if ($lockedOrder->status === 'completed') {
                return null;
            }

            if (!$this->workflowService->canBeCompleted($lockedOrder)) {
                throw ValidationException::withMessages([
                    'work_order' => ['Checklist wajib belum lengkap. Work order tidak bisa ditutup.'],
                ]);
            }

            $materials = $validated['materials'] ?? [];
            if (!empty($materials)) {
                $movements = $this->inventoryService->recordInstallationOutgoingForWorkOrder(
                    $lockedOrder,
                    $materials,
                    now()->toDateString(),
                    $validated['notes'] ?? null,
                    (int) auth()->id()
                );

                $this->workflowService->logEvent(
                    $lockedOrder,
                    'inventory_recorded',
                    'Material instalasi dicatat ke inventory.',
                    auth()->id(),
                    ['movement_ids' => collect($movements)->pluck('id')->values()->all()]
                );
            }

            $lockedOrder->status = 'completed';
            $lockedOrder->completed_at = now();
            $lockedOrder->save();

            return $lockedOrder;
        });

        if (!$completedOrder) {
            return response()->json([
                'message' => 'Work order ini sudah selesai sebelumnya.',
                'data' => $workOrder->fresh(),
            ], 422);
        }

        $this->workflowService->logEvent($completedOrder, 'completed', 'Work order diselesaikan.', auth()->id());
        $this->auditLogService->log('installation.work_order_completed', $completedOrder, [
            'materials_count' => count($validated['materials'] ?? []),
        ], auth()->id());

        return response()->json([
            'message' => 'Work order berhasil ditutup.',
            'data' => $completedOrder,
        ]);
    }

    private function ensureEnabled(): void
    {
        if (!$this->featureService->enabled('installation_workflow_v1')) {
            abort(response()->json(['message' => 'Feature nonaktif.'], 404));
        }
    }
}
