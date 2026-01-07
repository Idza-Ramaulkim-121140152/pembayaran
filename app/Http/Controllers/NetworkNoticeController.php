<?php

namespace App\Http\Controllers;

use App\Models\NetworkNotice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class NetworkNoticeController extends Controller
{
    /**
     * Get all notices for admin
     */
    public function index(Request $request)
    {
        $query = NetworkNotice::with('creator')
            ->orderBy('created_at', 'desc');

        // Filter by type
        if ($request->type) {
            $query->where('type', $request->type);
        }

        // Filter by status
        if ($request->status === 'active') {
            $query->where('is_active', true);
        } elseif ($request->status === 'inactive') {
            $query->where('is_active', false);
        }

        $notices = $query->paginate(15);

        return response()->json([
            'success' => true,
            'data' => $notices,
        ]);
    }

    /**
     * Store a new notice
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'type' => 'required|in:gangguan,maintenance',
            'severity' => 'required|in:low,medium,high,critical',
            'is_mass' => 'boolean',
            'affected_area' => 'nullable|string|max:255',
            'affected_odp' => 'nullable|string',
            'start_time' => 'nullable|date',
            'end_time' => 'nullable|date|after_or_equal:start_time',
            'is_active' => 'boolean',
        ]);

        $validated['created_by'] = Auth::id();
        $validated['is_active'] = $validated['is_active'] ?? true;
        $validated['is_mass'] = $validated['is_mass'] ?? false;

        $notice = NetworkNotice::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Informasi berhasil ditambahkan',
            'data' => $notice->load('creator'),
        ]);
    }

    /**
     * Get a single notice
     */
    public function show(NetworkNotice $networkNotice)
    {
        return response()->json([
            'success' => true,
            'data' => $networkNotice->load('creator'),
        ]);
    }

    /**
     * Update a notice
     */
    public function update(Request $request, NetworkNotice $networkNotice)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'type' => 'required|in:gangguan,maintenance',
            'severity' => 'required|in:low,medium,high,critical',
            'is_mass' => 'boolean',
            'affected_area' => 'nullable|string|max:255',
            'affected_odp' => 'nullable|string',
            'start_time' => 'nullable|date',
            'end_time' => 'nullable|date|after_or_equal:start_time',
            'is_active' => 'boolean',
        ]);

        $networkNotice->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Informasi berhasil diperbarui',
            'data' => $networkNotice->load('creator'),
        ]);
    }

    /**
     * Delete a notice
     */
    public function destroy(NetworkNotice $networkNotice)
    {
        $networkNotice->delete();

        return response()->json([
            'success' => true,
            'message' => 'Informasi berhasil dihapus',
        ]);
    }

    /**
     * Toggle notice active status
     */
    public function toggleActive(NetworkNotice $networkNotice)
    {
        $networkNotice->update([
            'is_active' => !$networkNotice->is_active,
        ]);

        return response()->json([
            'success' => true,
            'message' => $networkNotice->is_active ? 'Informasi diaktifkan' : 'Informasi dinonaktifkan',
            'data' => $networkNotice,
        ]);
    }

    /**
     * PUBLIC API: Get active notices for landing page
     * Returns all active notices (ongoing + upcoming scheduled)
     */
    public function publicNotices()
    {
        $now = now();
        
        $notices = NetworkNotice::active()
            ->where(function ($query) use ($now) {
                // Sedang berlangsung (ongoing)
                $query->where(function ($q) use ($now) {
                    $q->where(function ($q2) use ($now) {
                        $q2->whereNull('start_time')
                           ->orWhere('start_time', '<=', $now);
                    })
                    ->where(function ($q2) use ($now) {
                        $q2->whereNull('end_time')
                           ->orWhere('end_time', '>=', $now);
                    });
                })
                // ATAU jadwal akan datang (dalam 7 hari ke depan)
                ->orWhere(function ($q) use ($now) {
                    $q->where('start_time', '>', $now)
                      ->where('start_time', '<=', $now->copy()->addDays(7));
                });
            })
            ->orderBy('start_time', 'asc')
            ->orderBy('severity', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $notices,
        ]);
    }

    /**
     * PUBLIC API: Get active notices for customer portal
     * Returns all active notices (including non-mass disruptions)
     */
    public function customerNotices(Request $request)
    {
        $customerOdp = $request->odp; // Optional: filter by customer's ODP

        $query = NetworkNotice::active()
            ->ongoing()
            ->orderBy('severity', 'desc')
            ->orderBy('created_at', 'desc');

        $notices = $query->get();

        // Filter notices relevant to customer's ODP if provided
        if ($customerOdp) {
            $notices = $notices->filter(function ($notice) use ($customerOdp) {
                // Always show mass disruptions and maintenance
                if ($notice->is_mass || $notice->type === 'maintenance') {
                    return true;
                }

                // Check if customer's ODP is affected
                if ($notice->affected_odp) {
                    $affectedOdps = $notice->affected_odp_array;
                    return in_array($customerOdp, $affectedOdps);
                }

                // Show all if no specific ODP mentioned
                return true;
            })->values();
        }

        return response()->json([
            'success' => true,
            'data' => $notices,
        ]);
    }

    /**
     * Get statistics for dashboard
     */
    public function stats()
    {
        $activeGangguan = NetworkNotice::active()->ongoing()->gangguan()->count();
        $activeMaintenance = NetworkNotice::active()->ongoing()->maintenance()->count();
        $massGangguan = NetworkNotice::active()->ongoing()->gangguan()->mass()->count();
        $total = NetworkNotice::count();

        return response()->json([
            'success' => true,
            'data' => [
                'active_gangguan' => $activeGangguan,
                'active_maintenance' => $activeMaintenance,
                'mass_gangguan' => $massGangguan,
                'total' => $total,
            ],
        ]);
    }
}
