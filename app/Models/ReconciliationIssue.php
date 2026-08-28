<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReconciliationIssue extends Model
{
    public const STATUS_OPEN = 'open';
    public const STATUS_IN_REVIEW = 'in_review';
    public const STATUS_RESOLVED = 'resolved';
    public const STATUS_IGNORED = 'ignored';

    public const SEVERITY_CRITICAL = 'critical';
    public const SEVERITY_HIGH = 'high';
    public const SEVERITY_MEDIUM = 'medium';
    public const SEVERITY_LOW = 'low';

    protected $fillable = [
        'issue_type',
        'fingerprint',
        'status',
        'severity',
        'title',
        'description',
        'primary_entity_type',
        'primary_entity_id',
        'detected_at',
        'resolved_at',
        'ignored_at',
        'assigned_to',
        'resolution_action',
        'resolution_notes',
        'meta',
    ];

    protected $casts = [
        'detected_at' => 'datetime',
        'resolved_at' => 'datetime',
        'ignored_at' => 'datetime',
        'meta' => 'array',
    ];

    public static function statusOptions(): array
    {
        return [
            self::STATUS_OPEN,
            self::STATUS_IN_REVIEW,
            self::STATUS_RESOLVED,
            self::STATUS_IGNORED,
        ];
    }

    public static function severityOptions(): array
    {
        return [
            self::SEVERITY_CRITICAL,
            self::SEVERITY_HIGH,
            self::SEVERITY_MEDIUM,
            self::SEVERITY_LOW,
        ];
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }
}
