<?php

namespace App\Http\Controllers;

use App\Models\Borrower;
use App\Models\BorrowerLoan;
use App\Models\EmployeeAttendance;
use App\Models\PayrollMember;
use App\Models\User;
use App\Services\AuditLogService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class MasterPegawaiController extends Controller
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /**
     * List all employees consolidating User, PayrollMember, Borrower, and Attendance.
     */
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $roleFilter = $request->input('role');
        $syncFilter = $request->input('sync_status');

        // 1. Fetch relevant users (employees, technicians, admins, superadmins, finance, or users with payroll/borrower mapping)
        $usersQuery = User::query()
            ->with([
                'payrollMember',
                'borrowerProfile.loans',
            ])
            ->where(function ($q) {
                $q->where('is_employee', true)
                    ->orWhereIn('role', [
                        User::ROLE_TEKNISI,
                        User::ROLE_ADMIN,
                        User::ROLE_SUPERADMIN,
                        User::ROLE_FINANCE,
                    ])
                    ->orWhereNotNull('payroll_member_id')
                    ->orWhereHas('borrowerProfile');
            });

        $users = $usersQuery->orderBy('name')->get();

        $userIds = $users->pluck('id')->filter()->values()->all();
        $linkedPayrollMemberIds = $users->pluck('payroll_member_id')->filter()->values()->all();
        $linkedBorrowerUserIds = $users->pluck('id')->filter()->values()->all();

        // 2. Fetch today's attendances for all users
        $today = Carbon::today()->toDateString();
        $todayAttendances = EmployeeAttendance::query()
            ->whereIn('user_id', $userIds)
            ->whereDate('date', $today)
            ->get()
            ->keyBy('user_id');

        // 3. Fetch monthly attendance summary (current month)
        $startOfMonth = Carbon::now()->startOfMonth()->toDateString();
        $endOfMonth = Carbon::now()->endOfMonth()->toDateString();
        $monthlyAttendances = EmployeeAttendance::query()
            ->whereIn('user_id', $userIds)
            ->whereBetween('date', [$startOfMonth, $endOfMonth])
            ->selectRaw('user_id, count(*) as total_days, sum(case when clock_in_status = "late" then 1 else 0 end) as late_days, sum(case when status = "present" or clock_in_at is not null then 1 else 0 end) as present_days, coalesce(sum(work_duration_minutes), 0) as total_work_minutes')
            ->groupBy('user_id')
            ->get()
            ->keyBy('user_id');

        // 4. Fetch unlinked PayrollMembers
        $unlinkedPayrollMembers = PayrollMember::query()
            ->when(!empty($linkedPayrollMemberIds), function ($q) use ($linkedPayrollMemberIds) {
                $q->whereNotIn('id', $linkedPayrollMemberIds);
            })
            ->orderBy('nama')
            ->get();

        // 5. Fetch unlinked Borrowers
        $unlinkedBorrowers = Borrower::query()
            ->with('loans')
            ->where(function ($q) use ($linkedBorrowerUserIds) {
                $q->whereNull('mapped_user_id')
                    ->orWhereNotIn('mapped_user_id', $linkedBorrowerUserIds);
            })
            ->orderBy('name')
            ->get();

        $employees = collect();

        // Assemble Users into unified employee objects
        foreach ($users as $user) {
            $payroll = $user->payrollMember;
            $borrower = $user->borrowerProfile;
            $todayAtt = $todayAttendances->get($user->id);
            $monthAtt = $monthlyAttendances->get($user->id);

            $outstanding = 0;
            $totalLoans = 0;
            $activeLoansCount = 0;
            if ($borrower) {
                $activeLoans = $borrower->loans->whereIn('status', [
                    BorrowerLoan::STATUS_OUTSTANDING,
                    BorrowerLoan::STATUS_REJECTED_BY_RECEIVER,
                ]);
                $totalLoans = (int) $activeLoans->sum('amount');
                $settled = (int) $activeLoans->sum('settled_amount');
                $outstanding = max(0, $totalLoans - $settled);
                $activeLoansCount = $activeLoans->count();
            }

            $unpaidPayroll = 0;
            if ($payroll) {
                $unpaidPayroll = (float) ($payroll->unpaid_total ?? 0);
            }

            // Sync status evaluation
            $syncStatus = 'synced';
            $syncIssues = [];

            if (!$payroll) {
                $syncIssues[] = 'Belum memiliki data payroll';
                $syncStatus = 'partial';
            }
            if (!$borrower) {
                $syncIssues[] = 'Belum terhubung ke profil peminjam';
                if ($syncStatus === 'synced') {
                    $syncStatus = 'partial';
                }
            }
            if ($payroll && empty($user->phone) && !empty($payroll->telepon)) {
                $syncIssues[] = 'Nomor telepon akun belum terisi (ada di payroll)';
                $syncStatus = 'needs_sync';
            }

            $employees->push([
                'id' => 'u_' . $user->id,
                'uid' => $user->id,
                'user_id' => $user->id,
                'payroll_member_id' => $payroll?->id,
                'borrower_id' => $borrower?->id,
                'nama' => $user->name,
                'phone' => $user->phone ?: ($payroll?->telepon ?: ($borrower?->phone ?: '-')),
                'email' => $user->email,
                'role' => $user->role,
                'is_employee' => (bool) $user->is_employee,
                'is_active' => $payroll ? (bool) $payroll->is_active : true,
                'sync_status' => $syncStatus,
                'sync_issues' => $syncIssues,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'phone' => $user->phone,
                    'role' => $user->role,
                    'is_employee' => (bool) $user->is_employee,
                    'can_confirm_payments' => (bool) $user->can_confirm_payments,
                    'can_edit_mutations' => (bool) $user->can_edit_mutations,
                    'can_choose_payment_mutation' => (bool) $user->can_choose_payment_mutation,
                    'can_choose_payment_receiver' => (bool) $user->can_choose_payment_receiver,
                    'created_at' => $user->created_at?->toIso8601String(),
                ],
                'payroll' => $payroll ? [
                    'id' => $payroll->id,
                    'nama' => $payroll->nama,
                    'telepon' => $payroll->telepon,
                    'tipe_gaji' => $payroll->tipe_gaji,
                    'gaji_pokok' => (float) ($payroll->gaji_pokok ?? 0),
                    'tunjangan' => (float) ($payroll->tunjangan ?? 0),
                    'total_gaji_bulanan' => (float) ($payroll->gaji_pokok ?? 0) + (float) ($payroll->tunjangan ?? 0),
                    'tanggal_gajian' => $payroll->tanggal_gajian,
                    'nama_bank' => $payroll->nama_bank,
                    'nomor_rekening' => $payroll->nomor_rekening,
                    'is_active' => (bool) $payroll->is_active,
                    'unpaid_total' => $unpaidPayroll,
                ] : null,
                'borrower' => $borrower ? [
                    'id' => $borrower->id,
                    'name' => $borrower->name,
                    'phone' => $borrower->phone,
                    'notes' => $borrower->notes,
                    'is_active' => (bool) $borrower->is_active,
                    'total_loans' => $totalLoans,
                    'total_outstanding' => $outstanding,
                    'active_loans_count' => $activeLoansCount,
                ] : null,
                'attendance_today' => $todayAtt ? [
                    'id' => $todayAtt->id,
                    'clock_in_at' => $todayAtt->clock_in_at?->format('H:i'),
                    'clock_in_status' => $todayAtt->clock_in_status,
                    'clock_in_late_minutes' => $todayAtt->clock_in_late_minutes,
                    'clock_out_at' => $todayAtt->clock_out_at?->format('H:i'),
                    'work_duration_formatted' => $todayAtt->work_duration_formatted,
                    'status' => $todayAtt->status,
                ] : null,
                'attendance_month' => [
                    'present_days' => (int) ($monthAtt?->present_days ?? 0),
                    'late_days' => (int) ($monthAtt?->late_days ?? 0),
                    'total_work_minutes' => (int) ($monthAtt?->total_work_minutes ?? 0),
                ],
            ]);
        }

        // Assemble unlinked PayrollMembers
        foreach ($unlinkedPayrollMembers as $pm) {
            $employees->push([
                'id' => 'p_' . $pm->id,
                'uid' => null,
                'user_id' => null,
                'payroll_member_id' => $pm->id,
                'borrower_id' => null,
                'nama' => $pm->nama,
                'phone' => $pm->telepon ?: '-',
                'email' => null,
                'role' => null,
                'is_employee' => true,
                'is_active' => (bool) $pm->is_active,
                'sync_status' => 'missing_account',
                'sync_issues' => ['Belum memiliki akun login sistem'],
                'user' => null,
                'payroll' => [
                    'id' => $pm->id,
                    'nama' => $pm->nama,
                    'telepon' => $pm->telepon,
                    'tipe_gaji' => $pm->tipe_gaji,
                    'gaji_pokok' => (float) ($pm->gaji_pokok ?? 0),
                    'tunjangan' => (float) ($pm->tunjangan ?? 0),
                    'total_gaji_bulanan' => (float) ($pm->gaji_pokok ?? 0) + (float) ($pm->tunjangan ?? 0),
                    'tanggal_gajian' => $pm->tanggal_gajian,
                    'nama_bank' => $pm->nama_bank,
                    'nomor_rekening' => $pm->nomor_rekening,
                    'is_active' => (bool) $pm->is_active,
                    'unpaid_total' => (float) ($pm->unpaid_total ?? 0),
                ],
                'borrower' => null,
                'attendance_today' => null,
                'attendance_month' => [
                    'present_days' => 0,
                    'late_days' => 0,
                    'total_work_minutes' => 0,
                ],
            ]);
        }

        // Assemble unlinked Borrowers
        foreach ($unlinkedBorrowers as $b) {
            $activeLoans = $b->loans->whereIn('status', [
                BorrowerLoan::STATUS_OUTSTANDING,
                BorrowerLoan::STATUS_REJECTED_BY_RECEIVER,
            ]);
            $totalLoans = (int) $activeLoans->sum('amount');
            $settled = (int) $activeLoans->sum('settled_amount');
            $outstanding = max(0, $totalLoans - $settled);

            $employees->push([
                'id' => 'b_' . $b->id,
                'uid' => null,
                'user_id' => null,
                'payroll_member_id' => null,
                'borrower_id' => $b->id,
                'nama' => $b->name,
                'phone' => $b->phone ?: '-',
                'email' => null,
                'role' => null,
                'is_employee' => false,
                'is_active' => (bool) $b->is_active,
                'sync_status' => 'missing_account',
                'sync_issues' => ['Data peminjam belum terhubung ke akun login'],
                'user' => null,
                'payroll' => null,
                'borrower' => [
                    'id' => $b->id,
                    'name' => $b->name,
                    'phone' => $b->phone,
                    'notes' => $b->notes,
                    'is_active' => (bool) $b->is_active,
                    'total_loans' => $totalLoans,
                    'total_outstanding' => $outstanding,
                    'active_loans_count' => $activeLoans->count(),
                ],
                'attendance_today' => null,
                'attendance_month' => [
                    'present_days' => 0,
                    'late_days' => 0,
                    'total_work_minutes' => 0,
                ],
            ]);
        }

        // Apply Search Filtering
        if ($search !== '') {
            $searchLower = strtolower($search);
            $employees = $employees->filter(function ($emp) use ($searchLower) {
                return str_contains(strtolower($emp['nama']), $searchLower)
                    || str_contains(strtolower($emp['phone']), $searchLower)
                    || ($emp['email'] && str_contains(strtolower($emp['email']), $searchLower))
                    || ($emp['role'] && str_contains(strtolower($emp['role']), $searchLower));
            });
        }

        // Apply Role Filtering
        if ($roleFilter && $roleFilter !== 'all') {
            $employees = $employees->filter(function ($emp) use ($roleFilter) {
                return $emp['role'] === $roleFilter;
            });
        }

        // Apply Sync Status Filtering
        if ($syncFilter && $syncFilter !== 'all') {
            if ($syncFilter === 'synced') {
                $employees = $employees->filter(fn($e) => $e['sync_status'] === 'synced');
            } elseif ($syncFilter === 'unsynced') {
                $employees = $employees->filter(fn($e) => $e['sync_status'] !== 'synced');
            } elseif ($syncFilter === 'has_account') {
                $employees = $employees->filter(fn($e) => !empty($e['user_id']));
            } elseif ($syncFilter === 'has_payroll') {
                $employees = $employees->filter(fn($e) => !empty($e['payroll_member_id']));
            } elseif ($syncFilter === 'has_loans') {
                $employees = $employees->filter(fn($e) => ($e['borrower']['total_outstanding'] ?? 0) > 0);
            }
        }

        $allCollection = $employees->values();

        // Calculate KPI summaries
        $metrics = [
            'total_employees' => $allCollection->count(),
            'total_with_account' => $allCollection->whereNotNull('user_id')->count(),
            'total_with_payroll' => $allCollection->whereNotNull('payroll_member_id')->count(),
            'total_with_loans' => $allCollection->filter(fn($e) => ($e['borrower']['total_outstanding'] ?? 0) > 0)->count(),
            'total_present_today' => $allCollection->filter(fn($e) => !empty($e['attendance_today']))->count(),
            'total_unsynced' => $allCollection->filter(fn($e) => $e['sync_status'] !== 'synced')->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => $allCollection,
            'metrics' => $metrics,
        ]);
    }

    /**
     * Show detailed employee 360-view including attendance, payroll projects, and loans.
     */
    public function show(string $id): JsonResponse
    {
        $resolved = $this->resolveEmployeeEntities($id);
        $user = $resolved['user'];
        $payroll = $resolved['payroll'];
        $borrower = $resolved['borrower'];

        if (!$user && !$payroll && !$borrower) {
            return response()->json(['message' => 'Data pegawai tidak ditemukan.'], 404);
        }

        // 1. Loans history
        $loans = [];
        if ($borrower) {
            $loans = BorrowerLoan::query()
                ->where('borrower_id', $borrower->id)
                ->with(['payments', 'confirmedBy:id,name'])
                ->orderByDesc('occurred_at')
                ->take(30)
                ->get();
        }

        // 2. Payroll projects & payments history
        $projects = [];
        $payrollPayments = [];
        if ($payroll) {
            $projects = $payroll->projects()
                ->with(['details.inventoryItem'])
                ->orderByDesc('tanggal')
                ->take(15)
                ->get();

            $payrollPayments = $payroll->payments()
                ->orderByDesc('tanggal')
                ->take(15)
                ->get();
        }

        // 3. Attendance history
        $attendances = [];
        if ($user) {
            $attendances = EmployeeAttendance::query()
                ->where('user_id', $user->id)
                ->orderByDesc('date')
                ->take(30)
                ->get();
        }

        return response()->json([
            'success' => true,
            'data' => [
                'user' => $user,
                'payroll' => $payroll ? [
                    ...$payroll->toArray(),
                    'total_gaji_bulanan' => (float) ($payroll->gaji_pokok ?? 0) + (float) ($payroll->tunjangan ?? 0),
                    'unpaid_total' => $payroll->unpaid_total,
                ] : null,
                'borrower' => $borrower ? [
                    ...$borrower->toArray(),
                    'loans' => $loans,
                ] : null,
                'projects' => $projects,
                'payroll_payments' => $payrollPayments,
                'attendances' => $attendances,
            ],
        ]);
    }

    /**
     * Unified creation of employee across User, PayrollMember, and Borrower.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:30',
            // User account fields
            'create_account' => 'nullable|boolean',
            'email' => 'required_if:create_account,true|nullable|email|unique:users,email',
            'password' => 'required_if:create_account,true|nullable|string|min:6',
            'role' => ['required_if:create_account,true', 'nullable', Rule::in(User::ROLES)],
            'can_confirm_payments' => 'nullable|boolean',
            'can_edit_mutations' => 'nullable|boolean',
            'can_choose_payment_mutation' => 'nullable|boolean',
            'can_choose_payment_receiver' => 'nullable|boolean',
            // Payroll fields
            'create_payroll' => 'nullable|boolean',
            'tipe_gaji' => 'nullable|in:bulanan,proyek,campuran',
            'gaji_pokok' => 'nullable|numeric|min:0',
            'tunjangan' => 'nullable|numeric|min:0',
            'tanggal_gajian' => 'nullable|integer|min:1|max:31',
            'nama_bank' => 'nullable|string|max:100',
            'nomor_rekening' => 'nullable|string|max:100',
            // Borrower profile fields
            'create_borrower' => 'nullable|boolean',
            'borrower_notes' => 'nullable|string|max:500',
        ]);

        $createAccount = (bool) ($validated['create_account'] ?? false);
        $createPayroll = (bool) ($validated['create_payroll'] ?? true);
        $createBorrower = (bool) ($validated['create_borrower'] ?? true);

        // Security check for role superadmin
        if ($createAccount && ($validated['role'] ?? '') === User::ROLE_SUPERADMIN && !auth()->user()?->isSuperAdmin()) {
            return response()->json(['error' => 'Hanya superadmin yang dapat membuat akun ber-role superadmin.'], 403);
        }

        DB::beginTransaction();
        try {
            // 1. Create Payroll Member
            $payrollMember = null;
            if ($createPayroll) {
                $payrollMember = PayrollMember::create([
                    'nama' => $validated['name'],
                    'telepon' => $validated['phone'] ?? null,
                    'tipe_gaji' => $validated['tipe_gaji'] ?? 'bulanan',
                    'gaji_pokok' => $validated['gaji_pokok'] ?? 0,
                    'tunjangan' => $validated['tunjangan'] ?? 0,
                    'tanggal_gajian' => $validated['tanggal_gajian'] ?? 1,
                    'nama_bank' => $validated['nama_bank'] ?? null,
                    'nomor_rekening' => $validated['nomor_rekening'] ?? null,
                    'is_active' => true,
                ]);
            }

            // 2. Create User account
            $user = null;
            if ($createAccount) {
                $user = User::create([
                    'name' => $validated['name'],
                    'email' => $validated['email'],
                    'phone' => $validated['phone'] ?? null,
                    'password' => Hash::make($validated['password']),
                    'role' => $validated['role'] ?? User::ROLE_TEKNISI,
                    'is_employee' => true,
                    'payroll_member_id' => $payrollMember?->id,
                    'can_confirm_payments' => (bool) ($validated['can_confirm_payments'] ?? false),
                    'can_edit_mutations' => (bool) ($validated['can_edit_mutations'] ?? false),
                    'can_choose_payment_mutation' => (bool) ($validated['can_choose_payment_mutation'] ?? false),
                    'can_choose_payment_receiver' => (bool) ($validated['can_choose_payment_receiver'] ?? false),
                ]);
            }

            // 3. Create Borrower profile
            $borrower = null;
            if ($createBorrower) {
                $borrower = Borrower::create([
                    'name' => $validated['name'],
                    'phone' => $validated['phone'] ?? null,
                    'mapped_user_id' => $user?->id,
                    'notes' => $validated['borrower_notes'] ?? 'Dibuat otomatis dari Master Pegawai',
                    'is_active' => true,
                ]);
            }

            DB::commit();

            $this->auditLogService->log('master_pegawai.created', $user ?? $payrollMember ?? $borrower, [
                'name' => $validated['name'],
                'phone' => $validated['phone'] ?? null,
                'has_user' => (bool) $user,
                'has_payroll' => (bool) $payrollMember,
                'has_borrower' => (bool) $borrower,
            ], auth()->id());

            return response()->json([
                'success' => true,
                'message' => 'Pegawai berhasil ditambahkan dan disinkronkan ke seluruh sistem.',
                'data' => [
                    'user_id' => $user?->id,
                    'payroll_member_id' => $payrollMember?->id,
                    'borrower_id' => $borrower?->id,
                ],
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Gagal menambahkan pegawai', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Gagal menambahkan pegawai: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Unified update of employee attributes in sync across all models.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $entities = $this->resolveEmployeeEntities($id);
        $user = $entities['user'];
        $payroll = $entities['payroll'];
        $borrower = $entities['borrower'];

        if (!$user && !$payroll && !$borrower) {
            return response()->json(['message' => 'Data pegawai tidak ditemukan.'], 404);
        }

        $userId = $user?->id;

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:30',
            // User account fields
            'email' => ['nullable', 'email', $userId ? Rule::unique('users')->ignore($userId) : 'unique:users,email'],
            'password' => 'nullable|string|min:6',
            'role' => ['nullable', Rule::in(User::ROLES)],
            'can_confirm_payments' => 'nullable|boolean',
            'can_edit_mutations' => 'nullable|boolean',
            'can_choose_payment_mutation' => 'nullable|boolean',
            'can_choose_payment_receiver' => 'nullable|boolean',
            // Payroll fields
            'tipe_gaji' => 'nullable|in:bulanan,proyek,campuran',
            'gaji_pokok' => 'nullable|numeric|min:0',
            'tunjangan' => 'nullable|numeric|min:0',
            'tanggal_gajian' => 'nullable|integer|min:1|max:31',
            'nama_bank' => 'nullable|string|max:100',
            'nomor_rekening' => 'nullable|string|max:100',
            'is_active' => 'nullable|boolean',
            // Borrower profile notes
            'borrower_notes' => 'nullable|string|max:500',
            // Create user account if not existing yet
            'create_account_now' => 'nullable|boolean',
        ]);

        // Security check for role superadmin
        if ($request->has('role') && $request->role === User::ROLE_SUPERADMIN && !auth()->user()?->isSuperAdmin()) {
            return response()->json(['error' => 'Hanya superadmin yang dapat mengubah role menjadi superadmin.'], 403);
        }

        DB::beginTransaction();
        try {
            $name = $validated['name'];
            $phone = $validated['phone'] ?? null;

            // 1. Update or create User
            if ($user) {
                $userUpdates = ['name' => $name, 'phone' => $phone];
                if (!empty($validated['email'])) {
                    $userUpdates['email'] = $validated['email'];
                }
                if (!empty($validated['password'])) {
                    $userUpdates['password'] = Hash::make($validated['password']);
                }
                if (!empty($validated['role']) && (auth()->user()?->isSuperAdmin() || $user->id !== auth()->id())) {
                    $userUpdates['role'] = $validated['role'];
                }
                if ($request->has('can_confirm_payments')) {
                    $userUpdates['can_confirm_payments'] = (bool) $validated['can_confirm_payments'];
                }
                if ($request->has('can_edit_mutations')) {
                    $userUpdates['can_edit_mutations'] = (bool) $validated['can_edit_mutations'];
                }
                if ($request->has('can_choose_payment_mutation')) {
                    $userUpdates['can_choose_payment_mutation'] = (bool) $validated['can_choose_payment_mutation'];
                }
                if ($request->has('can_choose_payment_receiver')) {
                    $userUpdates['can_choose_payment_receiver'] = (bool) $validated['can_choose_payment_receiver'];
                }
                $user->update($userUpdates);
            } elseif (!empty($validated['create_account_now']) && !empty($validated['email']) && !empty($validated['password'])) {
                $user = User::create([
                    'name' => $name,
                    'email' => $validated['email'],
                    'phone' => $phone,
                    'password' => Hash::make($validated['password']),
                    'role' => $validated['role'] ?? User::ROLE_TEKNISI,
                    'is_employee' => true,
                    'payroll_member_id' => $payroll?->id,
                    'can_confirm_payments' => (bool) ($validated['can_confirm_payments'] ?? false),
                    'can_edit_mutations' => (bool) ($validated['can_edit_mutations'] ?? false),
                    'can_choose_payment_mutation' => (bool) ($validated['can_choose_payment_mutation'] ?? false),
                    'can_choose_payment_receiver' => (bool) ($validated['can_choose_payment_receiver'] ?? false),
                ]);

                if ($borrower && !$borrower->mapped_user_id) {
                    $borrower->update(['mapped_user_id' => $user->id]);
                }
            }

            // 2. Update or create PayrollMember
            if ($payroll) {
                $payrollUpdates = [
                    'nama' => $name,
                    'telepon' => $phone,
                ];
                if ($request->has('tipe_gaji')) {
                    $payrollUpdates['tipe_gaji'] = $validated['tipe_gaji'] ?? 'bulanan';
                }
                if ($request->has('gaji_pokok')) {
                    $payrollUpdates['gaji_pokok'] = $validated['gaji_pokok'] ?? 0;
                }
                if ($request->has('tunjangan')) {
                    $payrollUpdates['tunjangan'] = $validated['tunjangan'] ?? 0;
                }
                if ($request->has('tanggal_gajian')) {
                    $payrollUpdates['tanggal_gajian'] = $validated['tanggal_gajian'] ?? 1;
                }
                if ($request->has('nama_bank')) {
                    $payrollUpdates['nama_bank'] = $validated['nama_bank'];
                }
                if ($request->has('nomor_rekening')) {
                    $payrollUpdates['nomor_rekening'] = $validated['nomor_rekening'];
                }
                if ($request->has('is_active')) {
                    $payrollUpdates['is_active'] = (bool) $validated['is_active'];
                }
                $payroll->update($payrollUpdates);
            } elseif ($user && ($request->has('gaji_pokok') || $request->has('nama_bank') || $request->has('tipe_gaji'))) {
                $payroll = PayrollMember::create([
                    'nama' => $name,
                    'telepon' => $phone,
                    'tipe_gaji' => $validated['tipe_gaji'] ?? 'bulanan',
                    'gaji_pokok' => $validated['gaji_pokok'] ?? 0,
                    'tunjangan' => $validated['tunjangan'] ?? 0,
                    'tanggal_gajian' => $validated['tanggal_gajian'] ?? 1,
                    'nama_bank' => $validated['nama_bank'] ?? null,
                    'nomor_rekening' => $validated['nomor_rekening'] ?? null,
                    'is_active' => true,
                ]);
                $user->update(['payroll_member_id' => $payroll->id]);
            }

            // 3. Update or create Borrower
            if ($borrower) {
                $borrowerUpdates = [
                    'name' => $name,
                    'phone' => $phone,
                ];
                if ($user && $borrower->mapped_user_id !== $user->id) {
                    $borrowerUpdates['mapped_user_id'] = $user->id;
                }
                if ($request->has('borrower_notes')) {
                    $borrowerUpdates['notes'] = $validated['borrower_notes'];
                }
                if ($request->has('is_active')) {
                    $borrowerUpdates['is_active'] = (bool) $validated['is_active'];
                }
                $borrower->update($borrowerUpdates);
            } elseif ($user) {
                $borrower = Borrower::create([
                    'name' => $name,
                    'phone' => $phone,
                    'mapped_user_id' => $user->id,
                    'notes' => $validated['borrower_notes'] ?? 'Dibuat otomatis dari Master Pegawai',
                    'is_active' => true,
                ]);
            }

            DB::commit();

            $this->auditLogService->log('master_pegawai.updated', $user ?? $payroll ?? $borrower, [
                'name' => $name,
                'phone' => $phone,
            ], auth()->id());

            return response()->json([
                'success' => true,
                'message' => 'Identitas pegawai berhasil diperbarui dan disinkronkan.',
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Gagal memperbarui pegawai', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Gagal memperbarui pegawai: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Auto-sync reconciliation across Users, PayrollMembers, and Borrowers.
     * Matches records by normalized phone number or sanitized exact name.
     */
    public function autoSync(Request $request): JsonResponse
    {
        $linkedPayroll = 0;
        $linkedBorrowers = 0;
        $syncedPhones = 0;

        DB::beginTransaction();
        try {
            // 1. Get unlinked users
            $users = User::query()
                ->where(function ($q) {
                    $q->where('is_employee', true)
                        ->orWhereIn('role', [
                            User::ROLE_TEKNISI,
                            User::ROLE_ADMIN,
                            User::ROLE_SUPERADMIN,
                            User::ROLE_FINANCE,
                        ]);
                })
                ->get();

            $allPayrollMembers = PayrollMember::all();
            $allBorrowers = Borrower::all();

            foreach ($users as $user) {
                $userPhoneNorm = $this->normalizePhone($user->phone);
                $userNameNorm = strtolower(trim($user->name));

                // A. Sync with PayrollMember if unlinked
                if (!$user->payroll_member_id) {
                    $matchedPayroll = $allPayrollMembers->first(function ($pm) use ($userPhoneNorm, $userNameNorm) {
                        $pmPhoneNorm = $this->normalizePhone($pm->telepon);
                        $pmNameNorm = strtolower(trim($pm->nama));

                        if ($userPhoneNorm && $pmPhoneNorm && $userPhoneNorm === $pmPhoneNorm) {
                            return true;
                        }
                        return $userNameNorm && $pmNameNorm && $userNameNorm === $pmNameNorm;
                    });

                    if ($matchedPayroll) {
                        $user->payroll_member_id = $matchedPayroll->id;
                        $linkedPayroll++;

                        // Sync missing phone numbers
                        if (empty($user->phone) && !empty($matchedPayroll->telepon)) {
                            $user->phone = $matchedPayroll->telepon;
                            $syncedPhones++;
                        } elseif (!empty($user->phone) && empty($matchedPayroll->telepon)) {
                            $matchedPayroll->telepon = $user->phone;
                            $matchedPayroll->save();
                            $syncedPhones++;
                        }
                    }
                } else {
                    // Already linked, ensure phone numbers are synced
                    $pm = $allPayrollMembers->firstWhere('id', $user->payroll_member_id);
                    if ($pm) {
                        if (empty($user->phone) && !empty($pm->telepon)) {
                            $user->phone = $pm->telepon;
                            $syncedPhones++;
                        } elseif (!empty($user->phone) && empty($pm->telepon)) {
                            $pm->telepon = $user->phone;
                            $pm->save();
                            $syncedPhones++;
                        }
                    }
                }

                // B. Sync with Borrower if unlinked
                $existingBorrower = $allBorrowers->firstWhere('mapped_user_id', $user->id);
                if (!$existingBorrower) {
                    $matchedBorrower = $allBorrowers->first(function ($b) use ($userPhoneNorm, $userNameNorm) {
                        if ($b->mapped_user_id) {
                            return false;
                        }
                        $bPhoneNorm = $this->normalizePhone($b->phone);
                        $bNameNorm = strtolower(trim($b->name));

                        if ($userPhoneNorm && $bPhoneNorm && $userPhoneNorm === $bPhoneNorm) {
                            return true;
                        }
                        return $userNameNorm && $bNameNorm && $userNameNorm === $bNameNorm;
                    });

                    if ($matchedBorrower) {
                        $matchedBorrower->mapped_user_id = $user->id;
                        if (empty($matchedBorrower->phone) && !empty($user->phone)) {
                            $matchedBorrower->phone = $user->phone;
                            $syncedPhones++;
                        } elseif (!empty($matchedBorrower->phone) && empty($user->phone)) {
                            $user->phone = $matchedBorrower->phone;
                            $syncedPhones++;
                        }
                        $matchedBorrower->save();
                        $linkedBorrowers++;
                    }
                }

                $user->save();
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => "Sinkronisasi berhasil: {$linkedPayroll} data payroll terhubung, {$linkedBorrowers} data peminjam terhubung, {$syncedPhones} kontak telepon disinkronkan.",
                'data' => [
                    'linked_payroll' => $linkedPayroll,
                    'linked_borrowers' => $linkedBorrowers,
                    'synced_phones' => $syncedPhones,
                ],
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Gagal menjalankan auto-sync pegawai', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Gagal auto-sync: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Explicit manual linking of User, PayrollMember, and Borrower.
     */
    public function link(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'payroll_member_id' => 'nullable|integer|exists:payroll_members,id',
            'borrower_id' => 'nullable|integer|exists:borrowers,id',
            'sync_attributes' => 'nullable|boolean',
        ]);

        $user = User::findOrFail($validated['user_id']);
        $syncAttrs = (bool) ($validated['sync_attributes'] ?? true);

        DB::beginTransaction();
        try {
            // Link Payroll Member
            if (!empty($validated['payroll_member_id'])) {
                $user->payroll_member_id = $validated['payroll_member_id'];
                $payroll = PayrollMember::find($validated['payroll_member_id']);
                if ($payroll && $syncAttrs) {
                    if (empty($user->phone) && !empty($payroll->telepon)) {
                        $user->phone = $payroll->telepon;
                    } elseif (!empty($user->phone) && empty($payroll->telepon)) {
                        $payroll->telepon = $user->phone;
                        $payroll->save();
                    }
                }
            }

            // Link Borrower
            if (!empty($validated['borrower_id'])) {
                $borrower = Borrower::findOrFail($validated['borrower_id']);
                $borrower->mapped_user_id = $user->id;
                if ($syncAttrs) {
                    if (empty($user->phone) && !empty($borrower->phone)) {
                        $user->phone = $borrower->phone;
                    } elseif (!empty($user->phone) && empty($borrower->phone)) {
                        $borrower->phone = $user->phone;
                    }
                }
                $borrower->save();
            }

            $user->save();
            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Data pegawai berhasil dihubungkan secara manual.',
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Gagal menghubungkan data: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Safely deactivate or remove employee.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $entities = $this->resolveEmployeeEntities($id);
        $user = $entities['user'];
        $payroll = $entities['payroll'];
        $borrower = $entities['borrower'];

        if (!$user && !$payroll && !$borrower) {
            return response()->json(['message' => 'Data pegawai tidak ditemukan.'], 404);
        }

        // Cannot delete oneself
        if ($user && $user->id === auth()->id()) {
            return response()->json(['error' => 'Anda tidak dapat menghapus akun Anda sendiri.'], 403);
        }

        // Check if there are active loans
        $hasActiveLoans = false;
        if ($borrower) {
            $hasActiveLoans = $borrower->loans()
                ->whereIn('status', [BorrowerLoan::STATUS_OUTSTANDING, BorrowerLoan::STATUS_REJECTED_BY_RECEIVER])
                ->exists();
        }

        // Check if there are payroll projects
        $hasPayrollProjects = false;
        if ($payroll) {
            $hasPayrollProjects = $payroll->projects()->exists();
        }

        // If financial records exist, deactivate safely to prevent broken bookkeeping
        if ($hasActiveLoans || $hasPayrollProjects) {
            if ($payroll) {
                $payroll->update(['is_active' => false]);
            }
            if ($borrower) {
                $borrower->update(['is_active' => false]);
            }
            if ($user) {
                $user->update(['is_employee' => false]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Pegawai berhasil dinonaktifkan. Data historis payroll dan pinjaman tetap dipertahankan demi integritas keuangan.',
            ]);
        }

        // If completely clean without financial records, can safely delete
        DB::beginTransaction();
        try {
            if ($borrower) {
                $borrower->delete();
            }
            if ($payroll) {
                $payroll->delete();
            }
            if ($user) {
                // If user only had employee role, can deactivate or delete based on request
                $user->update(['is_employee' => false, 'payroll_member_id' => null]);
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Data pegawai berhasil dibersihkan dari sistem.',
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            return response()->json(['message' => 'Gagal menghapus pegawai: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Resolve related entities from composite ID or numeric ID.
     */
    private function resolveEmployeeEntities(string $id): array
    {
        $user = null;
        $payroll = null;
        $borrower = null;

        if (str_starts_with($id, 'u_')) {
            $userId = (int) substr($id, 2);
            $user = User::with(['payrollMember', 'borrowerProfile'])->find($userId);
            $payroll = $user?->payrollMember;
            $borrower = $user?->borrowerProfile;
        } elseif (str_starts_with($id, 'p_')) {
            $payrollId = (int) substr($id, 2);
            $payroll = PayrollMember::find($payrollId);
            $user = User::where('payroll_member_id', $payrollId)->first();
            $borrower = $user?->borrowerProfile;
        } elseif (str_starts_with($id, 'b_')) {
            $borrowerId = (int) substr($id, 2);
            $borrower = Borrower::find($borrowerId);
            $user = $borrower?->mappedUser;
            $payroll = $user?->payrollMember;
        } elseif (is_numeric($id)) {
            $user = User::with(['payrollMember', 'borrowerProfile'])->find((int) $id);
            if ($user) {
                $payroll = $user->payrollMember;
                $borrower = $user->borrowerProfile;
            } else {
                $payroll = PayrollMember::find((int) $id);
                $user = User::where('payroll_member_id', (int) $id)->first();
                $borrower = $user?->borrowerProfile;
            }
        }

        return [
            'user' => $user,
            'payroll' => $payroll,
            'borrower' => $borrower,
        ];
    }

    /**
     * Normalize Indonesian phone numbers for accurate matching.
     */
    private function normalizePhone(?string $phone): string
    {
        if (!$phone) {
            return '';
        }

        $digits = preg_replace('/\D+/', '', $phone);
        if (str_starts_with($digits, '62')) {
            $digits = '0' . substr($digits, 2);
        }

        return $digits;
    }
}
