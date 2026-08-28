<?php

namespace App\Services;

use App\Models\CashObligationEntry;
use App\Models\FinancialPlanningTarget;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class CashObligationCalendarService
{
    public function isReady(): bool
    {
        return Schema::hasTable('cash_obligation_entries');
    }

    public function defaultFilters(): array
    {
        return [
            'source_types' => [
                ['value' => 'manual_entry', 'label' => 'Manual'],
                ['value' => 'mandatory_target', 'label' => 'Pengeluaran Wajib'],
                ['value' => 'purchase_target', 'label' => 'Target Pembelian'],
            ],
            'statuses' => [
                ['value' => 'pending', 'label' => 'Pending'],
                ['value' => 'completed', 'label' => 'Selesai'],
                ['value' => 'cancelled', 'label' => 'Dibatalkan'],
                ['value' => 'overdue', 'label' => 'Overdue'],
            ],
            'priorities' => collect(CashObligationEntry::priorityOptions())
                ->map(fn (string $value) => ['value' => $value, 'label' => $this->priorityLabel($value)])
                ->values()
                ->all(),
            'categories' => collect(CashObligationEntry::categoryOptions())
                ->map(fn (string $value) => ['value' => $value, 'label' => $this->categoryLabel($value)])
                ->values()
                ->all(),
        ];
    }

    public function buildCalendar(Carbon $startDate, Carbon $endDate, array $filters = []): array
    {
        $items = collect()
            ->concat($this->buildManualEntries($startDate, $endDate))
            ->concat($this->buildMandatoryTargets($startDate, $endDate))
            ->concat($this->buildPurchaseTargets($startDate, $endDate))
            ->sortBy([
                ['due_date', 'asc'],
                ['priority_rank', 'asc'],
                ['title', 'asc'],
            ])
            ->values();

        $filtered = $this->applyFilters($items, $filters)->values();

        return [
            'range' => [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'days' => $startDate->diffInDays($endDate) + 1,
            ],
            'summary' => $this->buildSummary($filtered),
            'items' => $filtered->map(fn (array $item) => $this->stripInternalFields($item))->values()->all(),
            'grouped_by_date' => $filtered
                ->groupBy('due_date')
                ->map(fn (Collection $rows, string $dueDate) => [
                    'date' => $dueDate,
                    'label' => Carbon::parse($dueDate)->translatedFormat('l, d F Y'),
                    'total_amount' => (int) round($rows->sum('amount')),
                    'items' => $rows->map(fn (array $item) => $this->stripInternalFields($item))->values()->all(),
                ])
                ->values()
                ->all(),
            'meta' => [
                'filters' => $this->defaultFilters(),
            ],
        ];
    }

    private function buildManualEntries(Carbon $startDate, Carbon $endDate): Collection
    {
        if (!$this->isReady()) {
            return collect();
        }

        return CashObligationEntry::query()
            ->whereBetween('due_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->orderBy('due_date')
            ->get()
            ->map(fn (CashObligationEntry $entry) => $this->serializeManualEntry($entry));
    }

    private function buildMandatoryTargets(Carbon $startDate, Carbon $endDate): Collection
    {
        if (!Schema::hasTable('financial_planning_targets')) {
            return collect();
        }

        $targets = FinancialPlanningTarget::query()
            ->where('type', FinancialPlanningTarget::TYPE_MANDATORY_EXPENSE)
            ->where('is_active', true)
            ->orderBy('priority')
            ->orderBy('name')
            ->get();

        $events = [];

        foreach ($targets as $target) {
            foreach ($this->expandMandatoryEvents($target, $startDate, $endDate) as $event) {
                $dueDate = (string) ($event['due_date'] ?? '');
                $confirmation = $this->mandatoryConfirmation($target, $dueDate);
                $status = $confirmation ? CashObligationEntry::STATUS_COMPLETED : CashObligationEntry::STATUS_PENDING;
                $events[] = $this->baseCalendarItem([
                    'id' => 'mandatory-target-' . $target->id . '-' . $dueDate,
                    'source_type' => 'mandatory_target',
                    'source_id' => (int) $target->id,
                    'title' => (string) $target->name,
                    'amount' => (int) round((float) ($event['amount'] ?? 0)),
                    'due_date' => $dueDate,
                    'status' => $status,
                    'priority' => $this->normalizePriorityFromTarget((int) ($target->priority ?? 100)),
                    'category' => CashObligationEntry::CATEGORY_OPERATIONAL,
                    'notes' => $confirmation['notes'] ?? $target->description,
                    'is_system_generated' => true,
                    'is_editable' => false,
                    'available_actions' => $confirmation ? ['revoke_confirmation'] : ['confirm_execution'],
                    'source_label' => 'Pengeluaran Wajib',
                    'source_url' => '/settings/financial-targets',
                    'extra' => [
                        'target_id' => (int) $target->id,
                        'description' => $target->description,
                        'period_start' => $event['period_start'] ?? null,
                        'period_end' => $event['period_end'] ?? null,
                        'is_confirmed' => $confirmation !== null,
                        'confirmed_at' => $confirmation['confirmed_at'] ?? null,
                        'actual_date' => $confirmation['actual_date'] ?? null,
                    ],
                ]);
            }
        }

        return collect($events);
    }

    private function buildPurchaseTargets(Carbon $startDate, Carbon $endDate): Collection
    {
        if (!Schema::hasTable('financial_planning_targets')) {
            return collect();
        }

        return FinancialPlanningTarget::query()
            ->where('type', FinancialPlanningTarget::TYPE_PURCHASE_TARGET)
            ->where('is_active', true)
            ->whereNotNull('target_date')
            ->whereBetween('target_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->orderBy('target_date')
            ->orderBy('priority')
            ->get()
            ->map(function (FinancialPlanningTarget $target) {
                return $this->baseCalendarItem([
                    'id' => 'purchase-target-' . $target->id . '-' . $target->target_date?->toDateString(),
                    'source_type' => 'purchase_target',
                    'source_id' => (int) $target->id,
                    'title' => (string) $target->name,
                    'amount' => (int) round((float) $target->amount),
                    'due_date' => $target->target_date?->toDateString(),
                    'status' => CashObligationEntry::STATUS_PENDING,
                    'priority' => $this->normalizePriorityFromTarget((int) ($target->priority ?? 100)),
                    'category' => CashObligationEntry::CATEGORY_PURCHASE,
                    'notes' => $target->description,
                    'is_system_generated' => true,
                    'is_editable' => false,
                    'available_actions' => ['open_prediction'],
                    'source_label' => 'Target Pembelian',
                    'source_url' => '/dashboard/prediksi',
                    'extra' => [
                        'target_id' => (int) $target->id,
                    ],
                ]);
            });
    }

    private function serializeManualEntry(CashObligationEntry $entry): array
    {
        return $this->baseCalendarItem([
            'id' => 'manual-entry-' . $entry->id,
            'source_type' => 'manual_entry',
            'source_id' => (int) $entry->id,
            'title' => (string) $entry->title,
            'amount' => (int) $entry->amount,
            'due_date' => $entry->due_date?->toDateString(),
            'status' => (string) $entry->status,
            'priority' => (string) $entry->priority,
            'category' => (string) $entry->category,
            'notes' => $entry->notes,
            'is_system_generated' => false,
            'is_editable' => true,
            'available_actions' => $this->manualEntryActions($entry),
            'source_label' => 'Manual',
            'source_url' => null,
            'extra' => [
                'completed_at' => optional($entry->completed_at)?->toIso8601String(),
            ],
        ]);
    }

    public function presentManualEntry(CashObligationEntry $entry): array
    {
        return $this->stripInternalFields($this->serializeManualEntry($entry));
    }

    private function manualEntryActions(CashObligationEntry $entry): array
    {
        $actions = ['edit', 'delete'];

        if ($entry->status === CashObligationEntry::STATUS_PENDING) {
            $actions[] = 'mark_completed';
            $actions[] = 'cancel';
        } elseif ($entry->status === CashObligationEntry::STATUS_COMPLETED) {
            $actions[] = 'reopen';
        } elseif ($entry->status === CashObligationEntry::STATUS_CANCELLED) {
            $actions[] = 'reopen';
        }

        return $actions;
    }

    private function baseCalendarItem(array $data): array
    {
        $today = Carbon::today()->toDateString();
        $status = (string) ($data['status'] ?? CashObligationEntry::STATUS_PENDING);
        $dueDate = (string) ($data['due_date'] ?? '');
        $displayStatus = $status === CashObligationEntry::STATUS_PENDING && $dueDate !== '' && $dueDate < $today
            ? 'overdue'
            : $status;
        $priority = (string) ($data['priority'] ?? CashObligationEntry::PRIORITY_MEDIUM);

        return [
            'id' => $data['id'],
            'source_type' => $data['source_type'],
            'source_id' => $data['source_id'],
            'title' => $data['title'],
            'amount' => (int) round((float) ($data['amount'] ?? 0)),
            'due_date' => $dueDate,
            'status' => $status,
            'display_status' => $displayStatus,
            'priority' => $priority,
            'category' => (string) ($data['category'] ?? CashObligationEntry::CATEGORY_OTHER),
            'notes' => $data['notes'] ?? null,
            'is_system_generated' => (bool) ($data['is_system_generated'] ?? false),
            'is_editable' => (bool) ($data['is_editable'] ?? false),
            'available_actions' => array_values($data['available_actions'] ?? []),
            'source_label' => (string) ($data['source_label'] ?? ''),
            'source_url' => $data['source_url'] ?? null,
            'priority_rank' => $this->priorityRank($priority),
            'extra' => $data['extra'] ?? [],
        ];
    }

    private function stripInternalFields(array $item): array
    {
        unset($item['priority_rank']);
        return $item;
    }

    private function buildSummary(Collection $items): array
    {
        $today = Carbon::today()->toDateString();
        $next7End = Carbon::today()->addDays(6)->toDateString();
        $monthStart = Carbon::today()->startOfMonth()->toDateString();
        $monthEnd = Carbon::today()->endOfMonth()->toDateString();

        $pendingRows = $items->where('status', CashObligationEntry::STATUS_PENDING);
        $completedRows = $items->where('status', CashObligationEntry::STATUS_COMPLETED);
        $cancelledRows = $items->where('status', CashObligationEntry::STATUS_CANCELLED);
        $overdueRows = $items->where('display_status', 'overdue');

        return [
            'total_pending_amount' => (int) round($pendingRows->sum('amount')),
            'completed_amount' => (int) round($completedRows->sum('amount')),
            'cancelled_amount' => (int) round($cancelledRows->sum('amount')),
            'due_today_amount' => (int) round($items->where('due_date', $today)->sum('amount')),
            'next_7_days_amount' => (int) round($items->filter(fn (array $item) => ($item['due_date'] ?? '') >= $today && ($item['due_date'] ?? '') <= $next7End)->sum('amount')),
            'overdue_amount' => (int) round($overdueRows->sum('amount')),
            'current_month_amount' => (int) round($items->filter(fn (array $item) => ($item['due_date'] ?? '') >= $monthStart && ($item['due_date'] ?? '') <= $monthEnd)->sum('amount')),
            'counts' => [
                'pending' => $pendingRows->count(),
                'completed' => $completedRows->count(),
                'cancelled' => $cancelledRows->count(),
                'overdue' => $overdueRows->count(),
                'total' => $items->count(),
            ],
        ];
    }

    private function applyFilters(Collection $items, array $filters): Collection
    {
        $source = collect((array) ($filters['source'] ?? []))->filter()->values();
        $status = collect((array) ($filters['status'] ?? []))->filter()->values();
        $priority = collect((array) ($filters['priority'] ?? []))->filter()->values();
        $category = collect((array) ($filters['category'] ?? []))->filter()->values();

        return $items->filter(function (array $item) use ($source, $status, $priority, $category) {
            if ($source->isNotEmpty() && !$source->contains($item['source_type'])) {
                return false;
            }

            if ($status->isNotEmpty() && !$status->contains($item['display_status']) && !$status->contains($item['status'])) {
                return false;
            }

            if ($priority->isNotEmpty() && !$priority->contains($item['priority'])) {
                return false;
            }

            if ($category->isNotEmpty() && !$category->contains($item['category'])) {
                return false;
            }

            return true;
        });
    }

    private function expandMandatoryEvents(FinancialPlanningTarget $target, Carbon $startDate, Carbon $endDate): array
    {
        $events = [];

        if ($target->is_recurring_monthly && $target->recurrence_forever) {
            $meta = is_array($target->meta) ? $target->meta : [];
            $monthlyDay = (int) ($meta['monthly_day'] ?? 0);

            if ($monthlyDay < 1 || $monthlyDay > 31) {
                return [];
            }

            $startMonth = !empty($meta['start_month'])
                ? Carbon::parse((string) $meta['start_month'])->startOfMonth()
                : ($target->created_at ? Carbon::parse($target->created_at)->startOfMonth() : $startDate->copy()->startOfMonth());

            $monthCursor = $startDate->copy()->startOfMonth();
            if ($monthCursor->lt($startMonth)) {
                $monthCursor = $startMonth->copy();
            }

            $monthLimit = $endDate->copy()->startOfMonth();

            while ($monthCursor->lte($monthLimit)) {
                $dueDate = $monthCursor->copy()->day(min($monthlyDay, $monthCursor->daysInMonth));
                $previousMonth = $dueDate->copy()->subMonthNoOverflow();
                $previousDueDate = $previousMonth->copy()->day(min($monthlyDay, $previousMonth->daysInMonth));
                $periodStart = $previousDueDate->copy()->addDay();

                if ($dueDate->between($startDate->copy()->startOfDay(), $endDate->copy()->endOfDay())) {
                    $events[] = [
                        'period_start' => $periodStart->toDateString(),
                        'period_end' => $dueDate->toDateString(),
                        'due_date' => $dueDate->toDateString(),
                        'amount' => (float) $target->amount,
                    ];
                }

                $monthCursor->addMonthNoOverflow();
            }

            return $events;
        }

        if (!$target->start_date || !$target->end_date) {
            return [];
        }

        $baseStart = Carbon::parse($target->start_date)->startOfDay();
        $baseEnd = Carbon::parse($target->end_date)->startOfDay();

        if (!$target->is_recurring_monthly) {
            if ($baseEnd->between($startDate->copy()->startOfDay(), $endDate->copy()->endOfDay())) {
                $events[] = [
                    'period_start' => $baseStart->toDateString(),
                    'period_end' => $baseEnd->toDateString(),
                    'due_date' => $baseEnd->toDateString(),
                    'amount' => (float) $target->amount,
                ];
            }

            return $events;
        }

        $recurrenceLimit = $target->recurrence_forever
            ? null
            : ($target->recurrence_until ? Carbon::parse($target->recurrence_until)->endOfMonth() : $baseEnd->copy());

        $index = 0;
        while ($index <= 240) {
            $occurrenceStart = $baseStart->copy()->addMonthsNoOverflow($index);
            $occurrenceEnd = $baseEnd->copy()->addMonthsNoOverflow($index);

            if ($recurrenceLimit && $occurrenceStart->startOfMonth()->gt($recurrenceLimit->startOfMonth())) {
                break;
            }

            if ($occurrenceStart->gt($endDate->copy()->endOfDay())) {
                break;
            }

            if ($occurrenceEnd->between($startDate->copy()->startOfDay(), $endDate->copy()->endOfDay())) {
                $events[] = [
                    'period_start' => $occurrenceStart->toDateString(),
                    'period_end' => $occurrenceEnd->toDateString(),
                    'due_date' => $occurrenceEnd->toDateString(),
                    'amount' => (float) $target->amount,
                ];
            }

            $index++;
        }

        return $events;
    }

    private function mandatoryConfirmation(FinancialPlanningTarget $target, string $dueDate): ?array
    {
        $meta = is_array($target->meta) ? $target->meta : [];
        $confirmations = is_array($meta['confirmations'] ?? null) ? $meta['confirmations'] : [];
        $confirmation = $confirmations[$dueDate] ?? null;

        return is_array($confirmation) ? $confirmation : null;
    }

    private function normalizePriorityFromTarget(int $priority): string
    {
        if ($priority <= 50) {
            return CashObligationEntry::PRIORITY_HIGH;
        }

        if ($priority <= 200) {
            return CashObligationEntry::PRIORITY_MEDIUM;
        }

        return CashObligationEntry::PRIORITY_LOW;
    }

    private function priorityRank(string $priority): int
    {
        return match ($priority) {
            CashObligationEntry::PRIORITY_HIGH => 1,
            CashObligationEntry::PRIORITY_MEDIUM => 2,
            default => 3,
        };
    }

    private function priorityLabel(string $priority): string
    {
        return match ($priority) {
            CashObligationEntry::PRIORITY_HIGH => 'Tinggi',
            CashObligationEntry::PRIORITY_LOW => 'Rendah',
            default => 'Sedang',
        };
    }

    private function categoryLabel(string $category): string
    {
        return match ($category) {
            CashObligationEntry::CATEGORY_OPERATIONAL => 'Operasional',
            CashObligationEntry::CATEGORY_LOAN => 'Pinjaman',
            CashObligationEntry::CATEGORY_VENDOR => 'Vendor',
            CashObligationEntry::CATEGORY_PURCHASE => 'Pembelian',
            default => 'Lainnya',
        };
    }
}
