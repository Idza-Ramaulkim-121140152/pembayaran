<?php

namespace App\Http\Controllers;

use App\Models\CashObligationEntry;
use App\Services\CashObligationCalendarService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CashObligationCalendarController extends Controller
{
    public function index(Request $request, CashObligationCalendarService $service)
    {
        if (!$service->isReady()) {
            return response()->json([
                'message' => 'Tabel kalender kewajiban kas belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['nullable', 'array'],
            'status.*' => ['string', Rule::in(['pending', 'completed', 'cancelled', 'overdue'])],
            'source' => ['nullable', 'array'],
            'source.*' => ['string', Rule::in(['manual_entry', 'mandatory_target', 'purchase_target'])],
            'priority' => ['nullable', 'array'],
            'priority.*' => ['string', Rule::in(CashObligationEntry::priorityOptions())],
            'category' => ['nullable', 'array'],
            'category.*' => ['string', Rule::in(CashObligationEntry::categoryOptions())],
        ]);

        $startDate = isset($validated['start_date'])
            ? Carbon::parse($validated['start_date'])->startOfDay()
            : Carbon::today()->startOfDay();
        $endDate = isset($validated['end_date'])
            ? Carbon::parse($validated['end_date'])->startOfDay()
            : Carbon::today()->addDays(30)->startOfDay();

        return response()->json([
            'data' => $service->buildCalendar($startDate, $endDate, $validated),
        ]);
    }

    public function storeManualEntry(Request $request, CashObligationCalendarService $service)
    {
        if (!$service->isReady()) {
            return response()->json([
                'message' => 'Tabel kalender kewajiban kas belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $payload = $this->validateManualEntryPayload($request);
        $entry = CashObligationEntry::query()->create([
            ...$payload,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
            'completed_at' => $payload['status'] === CashObligationEntry::STATUS_COMPLETED ? now() : null,
        ]);

        return response()->json([
            'message' => 'Kewajiban manual berhasil ditambahkan.',
            'data' => $service->presentManualEntry($entry),
        ], 201);
    }

    public function updateManualEntry(Request $request, CashObligationEntry $entry, CashObligationCalendarService $service)
    {
        if (!$service->isReady()) {
            return response()->json([
                'message' => 'Tabel kalender kewajiban kas belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $payload = $this->validateManualEntryPayload($request);
        $entry->update([
            ...$payload,
            'updated_by' => $request->user()?->id,
            'completed_at' => $payload['status'] === CashObligationEntry::STATUS_COMPLETED
                ? ($entry->completed_at ?? now())
                : null,
        ]);

        return response()->json([
            'message' => 'Kewajiban manual berhasil diperbarui.',
            'data' => $service->presentManualEntry($entry->fresh()),
        ]);
    }

    public function updateManualEntryStatus(Request $request, CashObligationEntry $entry, CashObligationCalendarService $service)
    {
        if (!$service->isReady()) {
            return response()->json([
                'message' => 'Tabel kalender kewajiban kas belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(CashObligationEntry::statusOptions())],
            'completed_at' => ['nullable', 'date'],
        ]);

        $entry->update([
            'status' => $validated['status'],
            'completed_at' => $validated['status'] === CashObligationEntry::STATUS_COMPLETED
                ? (isset($validated['completed_at']) ? Carbon::parse($validated['completed_at']) : now())
                : null,
            'updated_by' => $request->user()?->id,
        ]);

        return response()->json([
            'message' => 'Status kewajiban manual berhasil diperbarui.',
            'data' => $service->presentManualEntry($entry->fresh()),
        ]);
    }

    public function destroyManualEntry(CashObligationEntry $entry, CashObligationCalendarService $service)
    {
        if (!$service->isReady()) {
            return response()->json([
                'message' => 'Tabel kalender kewajiban kas belum tersedia. Jalankan migrasi terlebih dahulu.',
            ], 503);
        }

        $entry->delete();

        return response()->json([
            'message' => 'Kewajiban manual berhasil dihapus.',
        ]);
    }

    private function validateManualEntryPayload(Request $request): array
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'due_date' => ['required', 'date'],
            'category' => ['nullable', 'string', Rule::in(CashObligationEntry::categoryOptions())],
            'priority' => ['nullable', 'string', Rule::in(CashObligationEntry::priorityOptions())],
            'status' => ['nullable', 'string', Rule::in(CashObligationEntry::statusOptions())],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $validated['title'] = trim((string) $validated['title']);
        $validated['amount'] = (int) round((float) $validated['amount']);
        $validated['category'] = (string) ($validated['category'] ?? CashObligationEntry::CATEGORY_OTHER);
        $validated['priority'] = (string) ($validated['priority'] ?? CashObligationEntry::PRIORITY_MEDIUM);
        $validated['status'] = (string) ($validated['status'] ?? CashObligationEntry::STATUS_PENDING);
        $validated['notes'] = isset($validated['notes']) ? trim((string) $validated['notes']) : null;

        return $validated;
    }
}
