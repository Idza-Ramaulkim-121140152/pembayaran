<?php

namespace App\Http\Controllers;

use App\Models\Complaint;
use App\Models\ComplaintCauseCategory;
use App\Services\AuditLogService;
use App\Services\ComplaintSlaService;
use App\Services\FeatureService;
use App\Services\TicketingService;
use Illuminate\Http\Request;

class ComplaintController extends Controller
{
    public function __construct(
        private TicketingService $ticketingService,
        private FeatureService $featureService,
        private AuditLogService $auditLogService,
        private ComplaintSlaService $complaintSlaService,
    ) {
    }

    public function index(Request $request)
    {
        $query = Complaint::with(['customer', 'handler', 'assignee', 'rootCause'])
            ->orderByDesc('created_at');

        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        if ($request->filled('category') && $request->category !== 'all') {
            $query->where('category', $request->category);
        }

        if ($request->filled('priority') && $request->priority !== 'all') {
            $query->where('priority', $request->priority);
        }

        if ($request->filled('assigned_to') && $request->assigned_to !== 'all') {
            $query->where('assigned_to', (int) $request->assigned_to);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('subject', 'like', "%{$search}%")
                    ->orWhere('message', 'like', "%{$search}%")
                    ->orWhere('ticket_number', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($q2) use ($search) {
                        $q2->where('name', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->boolean('sla_due_soon')) {
            $query->whereNotNull('sla_resolution_due_at')
                ->where('sla_resolution_due_at', '<=', now()->addHours(4))
                ->whereNotIn('status', ['resolved', 'closed']);
        }

        $complaints = $query->paginate(20);

        return response()->json($complaints);
    }

    public function show(Complaint $complaint)
    {
        $complaint->load([
            'customer',
            'handler',
            'assignee',
            'rootCause',
            'events.creator',
        ]);

        return response()->json($complaint);
    }

    public function update(Request $request, Complaint $complaint)
    {
        $validated = $request->validate([
            'status' => 'sometimes|in:pending,in_progress,resolved,closed',
            'priority' => 'sometimes|in:low,medium,high',
            'admin_response' => 'sometimes|nullable|string',
            'assigned_to' => 'sometimes|nullable|integer|exists:users,id',
            'root_cause_id' => 'sometimes|nullable|integer|exists:complaint_cause_categories,id',
            'internal_note' => 'sometimes|nullable|string',
            'customer_reply' => 'sometimes|nullable|string',
        ]);

        $oldStatus = $complaint->status;
        $oldPriority = $complaint->priority;
        $oldAssignee = $complaint->assigned_to;
        $oldRootCause = $complaint->root_cause_id;

        if ($this->featureService->enabled('ticketing_v2')) {
            if (!$complaint->ticket_number) {
                $complaint->ticket_number = $this->ticketingService->generateTicketNumber($complaint);
            }

            if (!$complaint->opened_at) {
                $complaint->opened_at = $complaint->created_at ?? now();
            }

            if (!$complaint->sla_first_response_due_at || !$complaint->sla_resolution_due_at) {
                $this->ticketingService->applySla($complaint);
            }
        }

        if (!$complaint->handled_by && isset($validated['status']) && $validated['status'] !== 'pending') {
            $validated['handled_by'] = auth()->id();
        }

        if (isset($validated['assigned_to']) && !$validated['assigned_to']) {
            $validated['assigned_to'] = null;
        }

        if (isset($validated['status']) && in_array($validated['status'], ['in_progress', 'resolved', 'closed'], true) && !$complaint->first_response_at) {
            $validated['first_response_at'] = now();
        }

        if (isset($validated['status']) && $validated['status'] === 'resolved') {
            $validated['resolved_at'] = now();
        }

        if (isset($validated['status']) && $validated['status'] === 'closed') {
            $validated['closed_at'] = now();
        }

        $validated['last_activity_at'] = now();

        $complaint->update($validated);

        if ($this->featureService->enabled('ticketing_v2')) {
            if ($oldStatus !== $complaint->status) {
                $this->ticketingService->logEvent(
                    $complaint,
                    'status_changed',
                    sprintf('Status berubah dari %s ke %s', $oldStatus, $complaint->status),
                    true,
                    auth()->id(),
                    ['old_status' => $oldStatus, 'new_status' => $complaint->status]
                );
            }

            if ($oldPriority !== $complaint->priority) {
                $this->ticketingService->logEvent(
                    $complaint,
                    'status_changed',
                    sprintf('Prioritas berubah dari %s ke %s', $oldPriority, $complaint->priority),
                    true,
                    auth()->id(),
                    ['old_priority' => $oldPriority, 'new_priority' => $complaint->priority]
                );
            }

            if ($oldAssignee !== $complaint->assigned_to) {
                $this->ticketingService->logEvent(
                    $complaint,
                    'assignment_changed',
                    'Penugasan teknisi diperbarui.',
                    true,
                    auth()->id(),
                    ['old_assigned_to' => $oldAssignee, 'new_assigned_to' => $complaint->assigned_to]
                );
            }

            if ($oldRootCause !== $complaint->root_cause_id) {
                $this->ticketingService->logEvent(
                    $complaint,
                    'root_cause_changed',
                    'Root cause diperbarui.',
                    true,
                    auth()->id(),
                    ['old_root_cause_id' => $oldRootCause, 'new_root_cause_id' => $complaint->root_cause_id]
                );
            }

            if (!empty($validated['internal_note'])) {
                $this->ticketingService->logEvent($complaint, 'comment', $validated['internal_note'], true, auth()->id());
            }

            if (!empty($validated['customer_reply'])) {
                $this->ticketingService->logEvent($complaint, 'reply', $validated['customer_reply'], false, auth()->id());
            }
        }

        $this->auditLogService->log('ticket.updated', $complaint, [
            'old_status' => $oldStatus,
            'new_status' => $complaint->status,
        ], auth()->id());

        return response()->json([
            'message' => 'Aduan berhasil diupdate',
            'complaint' => $complaint->fresh(['customer', 'handler', 'assignee', 'rootCause'])
        ]);
    }

    public function destroy(Complaint $complaint)
    {
        $complaint->delete();

        return response()->json(['message' => 'Aduan berhasil dihapus']);
    }

    public function stats()
    {
        return response()->json([
            'total' => Complaint::count(),
            'by_status' => [
                'pending' => Complaint::where('status', 'pending')->count(),
                'in_progress' => Complaint::where('status', 'in_progress')->count(),
                'resolved' => Complaint::where('status', 'resolved')->count(),
                'closed' => Complaint::where('status', 'closed')->count(),
            ],
            'by_category' => [
                'gangguan' => Complaint::where('category', 'gangguan')->count(),
                'pembayaran' => Complaint::where('category', 'pembayaran')->count(),
                'layanan' => Complaint::where('category', 'layanan')->count(),
                'lainnya' => Complaint::where('category', 'lainnya')->count(),
            ],
            'by_priority' => [
                'high' => Complaint::where('priority', 'high')->where('status', '!=', 'closed')->count(),
                'medium' => Complaint::where('priority', 'medium')->where('status', '!=', 'closed')->count(),
                'low' => Complaint::where('priority', 'low')->where('status', '!=', 'closed')->count(),
            ],
        ]);
    }

    public function report(Request $request)
    {
        $validated = $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
        ]);

        $start = $validated['start_date'] ?? now()->subMonth()->toDateString();
        $end = $validated['end_date'] ?? now()->toDateString();

        $query = Complaint::query()->whereDate('created_at', '>=', $start)->whereDate('created_at', '<=', $end);

        $firstResponseAvgMinutes = (float) Complaint::query()
            ->whereNotNull('first_response_at')
            ->whereDate('created_at', '>=', $start)
            ->whereDate('created_at', '<=', $end)
            ->selectRaw('AVG(TIMESTAMPDIFF(MINUTE, opened_at, first_response_at)) as avg_minutes')
            ->value('avg_minutes');

        $resolutionAvgMinutes = (float) Complaint::query()
            ->whereNotNull('closed_at')
            ->whereDate('created_at', '>=', $start)
            ->whereDate('created_at', '<=', $end)
            ->selectRaw('AVG(TIMESTAMPDIFF(MINUTE, opened_at, closed_at)) as avg_minutes')
            ->value('avg_minutes');

        $total = (clone $query)->count();

        $breached = Complaint::query()
            ->whereDate('created_at', '>=', $start)
            ->whereDate('created_at', '<=', $end)
            ->where(function ($q) {
                $q->where(function ($q2) {
                    $q2->whereNotNull('first_response_at')
                        ->whereColumn('first_response_at', '>', 'sla_first_response_due_at');
                })->orWhere(function ($q2) {
                    $q2->whereNotNull('closed_at')
                        ->whereColumn('closed_at', '>', 'sla_resolution_due_at');
                });
            })
            ->count();

        return response()->json([
            'data' => [
                'period' => ['start_date' => $start, 'end_date' => $end],
                'avg_first_response_minutes' => round($firstResponseAvgMinutes, 2),
                'avg_resolution_minutes' => round($resolutionAvgMinutes, 2),
                'breach_rate_percent' => $total > 0 ? round(($breached / $total) * 100, 2) : 0,
                'ticket_volume' => [
                    'total' => $total,
                    'by_category' => (clone $query)
                        ->selectRaw('category, COUNT(*) as total')
                        ->groupBy('category')
                        ->pluck('total', 'category'),
                    'by_odp' => Complaint::query()
                        ->leftJoin('customers', 'customers.id', '=', 'complaints.customer_id')
                        ->leftJoin('odps', 'odps.id', '=', 'customers.odp_id')
                        ->whereDate('complaints.created_at', '>=', $start)
                        ->whereDate('complaints.created_at', '<=', $end)
                        ->selectRaw("COALESCE(odps.nama, customers.odp, 'Tidak diketahui') as odp_name, COUNT(*) as total")
                        ->groupBy('odp_name')
                        ->pluck('total', 'odp_name'),
                ],
            ],
        ]);
    }

    public function causeCategories()
    {
        return response()->json([
            'data' => ComplaintCauseCategory::query()->orderBy('name')->get(),
        ]);
    }

    public function slaLive()
    {
        if (!$this->featureService->enabled('sla_board_v1')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        return response()->json([
            'data' => $this->complaintSlaService->liveBoard(),
        ]);
    }

    public function reply(Request $request, Complaint $complaint)
    {
        if (!$this->featureService->enabled('sla_board_v1')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        $validated = $request->validate([
            'message' => 'required|string|max:2000',
        ]);

        if (!$complaint->first_response_at) {
            $complaint->first_response_at = now();
        }

        $complaint->admin_response = $validated['message'];
        $complaint->last_activity_at = now();
        if ($complaint->status === 'pending') {
            $complaint->status = 'in_progress';
        }
        $complaint->save();

        $this->ticketingService->logEvent($complaint, 'reply', $validated['message'], false, auth()->id());
        $this->auditLogService->log('ticket.public_reply', $complaint, [], auth()->id());

        return response()->json([
            'message' => 'Balasan publik berhasil dikirim.',
            'complaint' => $complaint->fresh(['customer', 'assignee', 'events.creator']),
        ]);
    }

    public function escalate(Request $request, Complaint $complaint)
    {
        if (!$this->featureService->enabled('sla_board_v1')) {
            return response()->json(['message' => 'Feature nonaktif.'], 404);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:1000',
            'assigned_to' => 'nullable|integer|exists:users,id',
        ]);

        $complaint->priority = 'high';
        if (!empty($validated['assigned_to'])) {
            $complaint->assigned_to = (int) $validated['assigned_to'];
        }
        if ($complaint->status === 'pending') {
            $complaint->status = 'in_progress';
        }
        $complaint->last_activity_at = now();
        $complaint->save();

        $this->ticketingService->logEvent($complaint, 'comment', 'Eskalasi: ' . $validated['reason'], true, auth()->id(), [
            'action' => 'escalated',
            'assigned_to' => $validated['assigned_to'] ?? null,
        ]);
        $this->auditLogService->log('ticket.escalated', $complaint, ['reason' => $validated['reason']], auth()->id());

        return response()->json([
            'message' => 'Tiket berhasil dieskalasi.',
            'complaint' => $complaint->fresh(['customer', 'assignee', 'events.creator']),
        ]);
    }
}
