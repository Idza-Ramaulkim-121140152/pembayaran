<?php

namespace App\Services;

use App\Models\InstallationChecklist;
use App\Models\InstallationEvent;
use App\Models\InstallationWorkOrder;

class InstallationWorkflowService
{
    /** @var array<int, array{step_key:string,label:string,is_required:bool}> */
    private const DEFAULT_STEPS = [
        ['step_key' => 'survey_valid', 'label' => 'Survey valid', 'is_required' => true],
        ['step_key' => 'material_out', 'label' => 'Material keluar', 'is_required' => true],
        ['step_key' => 'cable_pulled', 'label' => 'Penarikan kabel selesai', 'is_required' => true],
        ['step_key' => 'pppoe_activated', 'label' => 'Aktivasi PPPoE berhasil', 'is_required' => true],
        ['step_key' => 'connection_tested', 'label' => 'Uji koneksi lulus', 'is_required' => true],
        ['step_key' => 'ba_uploaded', 'label' => 'BA/foto bukti terunggah', 'is_required' => true],
    ];

    public function ensureDefaultChecklist(InstallationWorkOrder $workOrder): void
    {
        foreach (self::DEFAULT_STEPS as $index => $step) {
            InstallationChecklist::firstOrCreate(
                [
                    'installation_work_order_id' => $workOrder->id,
                    'step_key' => $step['step_key'],
                ],
                [
                    'label' => $step['label'],
                    'is_required' => $step['is_required'],
                    'sort_order' => $index,
                ]
            );
        }
    }

    public function logEvent(InstallationWorkOrder $workOrder, string $eventType, ?string $message, ?int $userId, array $meta = []): void
    {
        InstallationEvent::create([
            'installation_work_order_id' => $workOrder->id,
            'event_type' => $eventType,
            'message' => $message,
            'created_by' => $userId,
            'meta' => $meta,
        ]);
    }

    public function canBeCompleted(InstallationWorkOrder $workOrder): bool
    {
        return !$workOrder->checklists()
            ->where('is_required', true)
            ->where('is_completed', false)
            ->exists();
    }
}
