<?php

namespace App\Http\Controllers;

use App\Models\Borrower;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class BorrowerController extends Controller
{
    private function ensureReady(): void
    {
        abort_unless(Schema::hasTable('borrowers'), 503, 'Fitur peminjam belum siap. Jalankan migrasi terlebih dahulu.');
    }

    public function index(Request $request)
    {
        $this->ensureReady();

        $query = Borrower::query()
            ->with('mappedUser:id,name,email,role')
            ->withSum(['loans as total_loan_amount' => function ($loanQuery) {
                $loanQuery->whereIn('status', ['outstanding', 'rejected_by_receiver']);
            }], 'amount')
            ->withSum(['loans as total_settled_amount' => function ($loanQuery) {
                $loanQuery->whereIn('status', ['outstanding', 'rejected_by_receiver']);
            }], 'settled_amount')
            ->orderBy('name');

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where('name', 'like', "%{$search}%");
        }

        $rows = $query->get()->map(function (Borrower $borrower) {
            $outstanding = max(0, (int) ($borrower->total_loan_amount ?? 0) - (int) ($borrower->total_settled_amount ?? 0));

            return [
                ...$borrower->toArray(),
                'mapped_user' => $borrower->mappedUser,
                'total_outstanding' => $outstanding,
            ];
        });

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request)
    {
        $this->ensureReady();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'mapped_user_id' => [
                'nullable',
                'integer',
                Rule::exists('users', 'id'),
                Rule::unique('borrowers', 'mapped_user_id'),
            ],
            'is_active' => 'nullable|boolean',
        ]);

        $borrower = Borrower::query()->create([
            'name' => $validated['name'],
            'phone' => $validated['phone'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'mapped_user_id' => $validated['mapped_user_id'] ?? null,
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ]);

        return response()->json([
            'message' => 'Peminjam berhasil ditambahkan.',
            'data' => $borrower->load('mappedUser:id,name,email,role'),
        ], 201);
    }

    public function update(Request $request, Borrower $borrower)
    {
        $this->ensureReady();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:50',
            'notes' => 'nullable|string',
            'mapped_user_id' => [
                'nullable',
                'integer',
                Rule::exists('users', 'id'),
                Rule::unique('borrowers', 'mapped_user_id')->ignore($borrower->id),
            ],
            'is_active' => 'nullable|boolean',
        ]);

        $borrower->update([
            'name' => $validated['name'],
            'phone' => $validated['phone'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'mapped_user_id' => $validated['mapped_user_id'] ?? null,
            'is_active' => (bool) ($validated['is_active'] ?? true),
        ]);

        return response()->json([
            'message' => 'Peminjam berhasil diperbarui.',
            'data' => $borrower->fresh()->load('mappedUser:id,name,email,role'),
        ]);
    }

    public function destroy(Borrower $borrower)
    {
        $this->ensureReady();
        $borrower->delete();

        return response()->json(['message' => 'Peminjam berhasil dihapus.']);
    }
}
