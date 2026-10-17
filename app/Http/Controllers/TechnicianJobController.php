<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\MasterWilayahDesa;
use App\Models\MasterWilayahDusun;
use App\Models\MasterWilayahKecamatan;
use App\Models\Odp;
use App\Models\TechnicianJob;
use App\Models\User;
use App\Services\TechnicianJobNotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class TechnicianJobController extends Controller
{
    public function __construct(
        private TechnicianJobNotificationService $notificationService
    ) {
    }

    /**
     * List and filter jobs with summary statistics.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $status = $request->query('status', 'all');
        $type = $request->query('type', 'all');
        $priority = $request->query('priority', 'all');
        $technicianId = $request->query('technician_id');
        $search = trim((string) $request->query('search', ''));
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');

        $query = TechnicianJob::with([
            'technicians:id,name,phone,role',
            'customer:id,name,phone,address,pppoe_username',
            'odp:id,nama,kode',
            'creator:id,name',
            'completer:id,name',
        ])->latest('id');

        // Scoping: If not admin/superadmin, technicians see only their assigned jobs
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            $query->whereHas('technicians', function ($q) use ($user) {
                $q->where('users.id', $user->id);
            });
        }

        if ($status !== 'all' && in_array($status, [TechnicianJob::STATUS_ACTIVE, TechnicianJob::STATUS_COMPLETED, TechnicianJob::STATUS_CANCELLED])) {
            $query->where('status', $status);
        }

        if ($type !== 'all' && in_array($type, [
            TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            TechnicianJob::TYPE_GANGGUAN_MASSAL,
            TechnicianJob::TYPE_PEMASANGAN_BARU,
            TechnicianJob::TYPE_LAINNYA,
        ])) {
            $query->where('type', $type);
        }

        if ($priority !== 'all' && in_array($priority, ['low', 'normal', 'high', 'urgent'])) {
            $query->where('priority', $priority);
        }

        if ($technicianId) {
            $query->whereHas('technicians', function ($q) use ($technicianId) {
                $q->where('users.id', $technicianId);
            });
        }

        if ($dateFrom) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }

        if ($dateTo) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('job_number', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($cq) use ($search) {
                        $cq->where('name', 'like', "%{$search}%")
                           ->orWhere('phone', 'like', "%{$search}%")
                           ->orWhere('address', 'like', "%{$search}%")
                           ->orWhere('pppoe_username', 'like', "%{$search}%");
                    })
                    ->orWhereHas('technicians', function ($tq) use ($search) {
                        $tq->where('users.name', 'like', "%{$search}%")
                           ->orWhere('users.phone', 'like', "%{$search}%");
                    });
            });
        }

        $perPage = (int) $request->query('per_page', 20);
        $paginated = $query->paginate($perPage);

        // Calculate summary counts
        $baseCountQuery = TechnicianJob::query();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            $baseCountQuery->whereHas('technicians', function ($q) use ($user) {
                $q->where('users.id', $user->id);
            });
        }

        $today = Carbon::today('Asia/Jakarta');

        $counts = [
            'total' => (clone $baseCountQuery)->count(),
            'active' => (clone $baseCountQuery)->where('status', TechnicianJob::STATUS_ACTIVE)->count(),
            'completed' => (clone $baseCountQuery)->where('status', TechnicianJob::STATUS_COMPLETED)->count(),
            'cancelled' => (clone $baseCountQuery)->where('status', TechnicianJob::STATUS_CANCELLED)->count(),
            'gangguan_today' => (clone $baseCountQuery)
                ->whereIn('type', [TechnicianJob::TYPE_GANGGUAN_PELANGGAN, TechnicianJob::TYPE_GANGGUAN_MASSAL])
                ->whereDate('created_at', $today)
                ->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $paginated->items(),
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
            'counts' => $counts,
        ]);
    }

    /**
     * Get available technicians list for assignment dropdown.
     */
    public function techniciansList()
    {
        $users = User::query()
            ->whereIn('role', [User::ROLE_TEKNISI, User::ROLE_ADMIN, User::ROLE_SUPERADMIN])
            ->orderBy('name')
            ->get(['id', 'name', 'phone', 'email', 'role']);

        return response()->json([
            'success' => true,
            'data' => $users,
        ]);
    }

    /**
     * Update technician phone number directly from the modal.
     */
    public function updateTechnicianPhone(Request $request, User $user)
    {
        $validated = $request->validate([
            'phone' => 'required|string|min:9|max:16',
        ]);

        $cleanedPhone = preg_replace('/\D/', '', $validated['phone']);
        if (str_starts_with($cleanedPhone, '0')) {
            $cleanedPhone = '62' . substr($cleanedPhone, 1);
        }

        $user->phone = $cleanedPhone;
        $user->save();

        return response()->json([
            'success' => true,
            'message' => "Nomor telepon untuk teknisi {$user->name} berhasil disimpan.",
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
                'role' => $user->role,
            ],
        ]);
    }

    /**
     * Create a new job ticket.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|string|in:gangguan_pelanggan,gangguan_massal,pemasangan_baru,lainnya',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'priority' => 'nullable|string|in:low,normal,high,urgent',
            'technician_ids' => 'required|array|min:1',
            'technician_ids.*' => 'exists:users,id',
            'customer_id' => 'nullable|exists:customers,id',
            'scope_type' => 'nullable|string|in:single,mass_customers,wilayah,odp',
            'wilayah_type' => 'nullable|string|in:desa,dusun,kecamatan',
            'wilayah_id' => 'nullable|integer',
            'odp_id' => 'nullable|exists:odps,id',
            'customer_ids' => 'nullable|array',
            'customer_ids.*' => 'exists:customers,id',
        ]);

        // Validation for single customer trouble
        if ($validated['type'] === TechnicianJob::TYPE_GANGGUAN_PELANGGAN && empty($validated['customer_id'])) {
            return response()->json([
                'success' => false,
                'message' => 'Pilih 1 pelanggan yang mengalami gangguan.',
            ], 422);
        }

        // Validate technician phone numbers: all selected technicians must have a phone number
        $technicians = User::whereIn('id', $validated['technician_ids'])->get();
        foreach ($technicians as $tech) {
            $phone = trim((string) ($tech->phone ?? ''));
            if (empty($phone) || strlen($phone) < 9) {
                return response()->json([
                    'success' => false,
                    'code' => 'TECHNICIAN_MISSING_PHONE',
                    'message' => "Teknisi \"{$tech->name}\" belum memiliki nomor telepon WhatsApp. Silakan isi nomor telepon terlebih dahulu.",
                    'technician' => [
                        'id' => $tech->id,
                        'name' => $tech->name,
                        'email' => $tech->email,
                    ],
                ], 422);
            }
        }

        $jobNumber = $this->generateJobNumber($validated['type']);

        $job = DB::transaction(function () use ($validated, $jobNumber, $request) {
            $scopeType = $validated['scope_type'] ?? null;
            if ($validated['type'] === TechnicianJob::TYPE_GANGGUAN_PELANGGAN || $validated['type'] === TechnicianJob::TYPE_PEMASANGAN_BARU) {
                $scopeType = 'single';
            }

            $job = TechnicianJob::create([
                'job_number' => $jobNumber,
                'type' => $validated['type'],
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'customer_id' => $validated['customer_id'] ?? null,
                'scope_type' => $scopeType,
                'wilayah_type' => $validated['wilayah_type'] ?? null,
                'wilayah_id' => $validated['wilayah_id'] ?? null,
                'odp_id' => $validated['odp_id'] ?? null,
                'status' => TechnicianJob::STATUS_ACTIVE,
                'priority' => $validated['priority'] ?? 'normal',
                'created_by' => $request->user()->id,
            ]);

            // Sync assigned technicians
            $job->technicians()->sync($validated['technician_ids']);

            // Associate mass outage affected customers if applicable
            $affectedCustomerIds = [];
            if ($validated['type'] === TechnicianJob::TYPE_GANGGUAN_MASSAL) {
                if ($scopeType === 'odp' && !empty($validated['odp_id'])) {
                    $odp = Odp::find($validated['odp_id']);
                    $affectedCustomerIds = Customer::where('odp_id', $validated['odp_id'])
                        ->orWhere('odp', $odp?->nama)
                        ->pluck('id')
                        ->toArray();
                } elseif ($scopeType === 'wilayah' && !empty($validated['wilayah_id']) && !empty($validated['wilayah_type'])) {
                    $column = match ($validated['wilayah_type']) {
                        'desa' => 'desa_id',
                        'dusun' => 'dusun_id',
                        'kecamatan' => 'kecamatan_id',
                        default => null,
                    };
                    if ($column) {
                        $affectedCustomerIds = Customer::where($column, $validated['wilayah_id'])->pluck('id')->toArray();
                    }
                } elseif (!empty($validated['customer_ids'])) {
                    $affectedCustomerIds = $validated['customer_ids'];
                }
            }

            if (!empty($affectedCustomerIds)) {
                $job->customers()->sync($affectedCustomerIds);
            }

            return $job;
        });

        // Trigger notification logic with 08:00 AM cutoff check
        $notifResult = $this->notificationService->handleJobCreatedNotification($job);

        $job->loadMissing([
            'technicians:id,name,phone,role',
            'customer:id,name,phone,address',
            'odp:id,nama,kode',
            'creator:id,name',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Pekerjaan berhasil dibuat dan ditugaskan ke teknisi.',
            'data' => $job,
            'notification' => $notifResult,
        ], 201);
    }

    /**
     * Quick create from Customer Verification / Installation assignment.
     */
    public function fromInstallation(Request $request)
    {
        $validated = $request->validate([
            'customer_id' => 'required|exists:customers,id',
            'technician_ids' => 'required|array|min:1',
            'technician_ids.*' => 'exists:users,id',
            'notes' => 'nullable|string',
            'priority' => 'nullable|string|in:low,normal,high,urgent',
        ]);

        $customer = Customer::findOrFail($validated['customer_id']);

        // Check technician phone
        $technicians = User::whereIn('id', $validated['technician_ids'])->get();
        foreach ($technicians as $tech) {
            $phone = trim((string) ($tech->phone ?? ''));
            if (empty($phone) || strlen($phone) < 9) {
                return response()->json([
                    'success' => false,
                    'code' => 'TECHNICIAN_MISSING_PHONE',
                    'message' => "Teknisi \"{$tech->name}\" belum memiliki nomor telepon WhatsApp.",
                    'technician' => [
                        'id' => $tech->id,
                        'name' => $tech->name,
                    ],
                ], 422);
            }
        }

        $jobNumber = $this->generateJobNumber(TechnicianJob::TYPE_PEMASANGAN_BARU);

        $job = DB::transaction(function () use ($customer, $validated, $jobNumber, $request) {
            $job = TechnicianJob::create([
                'job_number' => $jobNumber,
                'type' => TechnicianJob::TYPE_PEMASANGAN_BARU,
                'title' => 'Pemasangan Baru - ' . $customer->name,
                'description' => $validated['notes'] ?: "Pemasangan baru pelanggan {$customer->name} ({$customer->address})",
                'customer_id' => $customer->id,
                'scope_type' => 'single',
                'odp_id' => $customer->odp_id,
                'status' => TechnicianJob::STATUS_ACTIVE,
                'priority' => $validated['priority'] ?? 'normal',
                'created_by' => $request->user()->id,
            ]);

            $job->technicians()->sync($validated['technician_ids']);

            return $job;
        });

        $notifResult = $this->notificationService->handleJobCreatedNotification($job);

        return response()->json([
            'success' => true,
            'message' => 'Penugasan pemasangan berhasil dibuat di Monitoring Pekerjaan.',
            'data' => $job->load(['technicians', 'customer']),
            'notification' => $notifResult,
        ], 201);
    }

    /**
     * Resolve / Complete a job.
     * Admin/Super Admin: Can resolve with simple confirmation (no proof/notes required).
     * Assigned Technician: MUST attach completion proof photo and completion notes.
     */
    public function resolve(Request $request, TechnicianJob $job)
    {
        $user = $request->user();

        if ($job->status === TechnicianJob::STATUS_COMPLETED) {
            return response()->json([
                'success' => false,
                'message' => 'Pekerjaan ini sudah diselesaikan sebelumnya.',
            ], 400);
        }

        $isAdminOrSuperAdmin = $user->isAdmin() || $user->isSuperAdmin();
        $isAssignedTechnician = $job->technicians()->where('users.id', $user->id)->exists();

        if (!$isAdminOrSuperAdmin && !$isAssignedTechnician) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki hak akses untuk menyelesaikan pekerjaan ini.',
            ], 403);
        }

        $completionProofUrl = null;
        $completionNotes = null;

        if ($isAdminOrSuperAdmin) {
            // Admin can provide notes optionally, but it's not required
            $completionNotes = $request->input('completion_notes', 'Dikonfirmasi selesai oleh Admin/Super Admin.');
            if ($request->hasFile('completion_proof')) {
                $path = $request->file('completion_proof')->store('job-completions/' . $job->id, 'public');
                $completionProofUrl = url(Storage::url($path));
            }
        } else {
            // Technician MUST provide proof and notes!
            $request->validate([
                'completion_proof' => 'required|file|image|max:10240',
                'completion_notes' => 'required|string|min:5|max:1000',
            ], [
                'completion_proof.required' => 'Bukti foto pengerjaan wajib dilampirkan oleh teknisi.',
                'completion_notes.required' => 'Catatan hasil pengerjaan wajib diisi oleh teknisi.',
                'completion_notes.min' => 'Catatan hasil pengerjaan minimal 5 karakter.',
            ]);

            $path = $request->file('completion_proof')->store('job-completions/' . $job->id, 'public');
            $completionProofUrl = url(Storage::url($path));
            $completionNotes = $request->input('completion_notes');
        }

        $job->update([
            'status' => TechnicianJob::STATUS_COMPLETED,
            'completed_by' => $user->id,
            'completed_at' => now(),
            'completion_proof_url' => $completionProofUrl,
            'completion_notes' => $completionNotes,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Pekerjaan berhasil diselesaikan.',
            'data' => $job->load(['technicians', 'customer', 'completer:id,name']),
        ]);
    }

    /**
     * Cancel an active job (Admin/Super Admin only).
     */
    public function cancel(Request $request, TechnicianJob $job)
    {
        $user = $request->user();
        if (!$user->isAdmin() && !$user->isSuperAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya Admin atau Super Admin yang dapat membatalkan pekerjaan.',
            ], 403);
        }

        $job->update([
            'status' => TechnicianJob::STATUS_CANCELLED,
            'completion_notes' => $request->input('notes', 'Dibatalkan oleh ' . $user->name),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Pekerjaan berhasil dibatalkan.',
            'data' => $job,
        ]);
    }

    /**
     * Get ready-to-copy WhatsApp text for a job.
     */
    public function copyText(TechnicianJob $job)
    {
        $job->loadMissing(['technicians', 'customer', 'odp', 'creator', 'completer']);

        return response()->json([
            'success' => true,
            'text' => $job->formatted_copy_text,
        ]);
    }

    /**
     * Helper to generate unique ticket/job number.
     * Format: JOB-YYYYMMDD-0001
     */
    private function generateJobNumber(string $type): string
    {
        $prefixCode = match ($type) {
            TechnicianJob::TYPE_GANGGUAN_PELANGGAN => 'GP',
            TechnicianJob::TYPE_GANGGUAN_MASSAL => 'GM',
            TechnicianJob::TYPE_PEMASANGAN_BARU => 'PS',
            default => 'PK',
        };

        $datePrefix = date('Ymd');
        $prefix = "JOB-{$prefixCode}-{$datePrefix}-";

        $latest = TechnicianJob::where('job_number', 'like', "{$prefix}%")
            ->orderByDesc('id')
            ->first();

        $nextSeq = 1;
        if ($latest) {
            $lastNum = (int) substr($latest->job_number, strlen($prefix));
            $nextSeq = $lastNum + 1;
        }

        return $prefix . str_pad((string) $nextSeq, 4, '0', STR_PAD_LEFT);
    }
}
