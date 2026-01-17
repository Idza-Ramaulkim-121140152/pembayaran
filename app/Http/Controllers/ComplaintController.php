<?php

namespace App\Http\Controllers;

use App\Models\Complaint;
use Illuminate\Http\Request;

class ComplaintController extends Controller
{
    /**
     * Get all complaints for admin
     */
    public function index(Request $request)
    {
        $query = Complaint::with(['customer', 'handler']);

        // Filter by status
        if ($request->has('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        // Filter by category
        if ($request->has('category') && $request->category !== 'all') {
            $query->where('category', $request->category);
        }

        // Filter by priority
        if ($request->has('priority') && $request->priority !== 'all') {
            $query->where('priority', $request->priority);
        }

        // Search
        if ($request->has('search') && $request->search) {
            $search = $request->search;
            // Sanitize search input to prevent SQL injection
            $search = str_replace(['%', '_'], ['\\%', '\\_'], $search);
            $query->where(function($q) use ($search) {
                $q->where('subject', 'like', "%{$search}%")
                  ->orWhere('message', 'like', "%{$search}%")
                  ->orWhereHas('customer', function($q2) use ($search) {
                      $q2->where('name', 'like', "%{$search}%");
                  });
            });
        }

        $complaints = $query->orderBy('created_at', 'desc')->paginate(20);

        return response()->json($complaints);
    }

    /**
     * Get single complaint
     */
    public function show(Complaint $complaint)
    {
        $complaint->load(['customer', 'handler']);
        return response()->json($complaint);
    }

    /**
     * Update complaint status/response
     */
    public function update(Request $request, Complaint $complaint)
    {
        $validated = $request->validate([
            'status' => 'sometimes|in:pending,in_progress,resolved,closed',
            'priority' => 'sometimes|in:low,medium,high',
            'admin_response' => 'sometimes|nullable|string',
        ]);

        // Set handler if not set
        if (!$complaint->handled_by && isset($validated['status']) && $validated['status'] !== 'pending') {
            $validated['handled_by'] = auth()->id();
        }

        // Set resolved_at if status is resolved
        if (isset($validated['status']) && $validated['status'] === 'resolved') {
            $validated['resolved_at'] = now();
        }

        $complaint->update($validated);

        return response()->json([
            'message' => 'Aduan berhasil diupdate',
            'complaint' => $complaint->fresh(['customer', 'handler'])
        ]);
    }

    /**
     * Delete complaint
     */
    public function destroy(Complaint $complaint)
    {
        $complaint->delete();
        return response()->json(['message' => 'Aduan berhasil dihapus']);
    }

    /**
     * Get complaint statistics
     */
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
}
