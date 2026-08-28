<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectReportManualExpense extends Model
{
    protected $fillable = [
        'project_report_id',
        'name',
        'category',
        'quantity',
        'unit',
        'unit_price',
        'subtotal',
        'notes',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'subtotal' => 'decimal:2',
    ];

    public function projectReport()
    {
        return $this->belongsTo(ProjectReport::class);
    }
}
