<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectReportWilayahMapping extends Model
{
    protected $fillable = [
        'project_report_id',
        'wilayah_level',
        'wilayah_id',
        'label_snapshot',
    ];

    public function projectReport()
    {
        return $this->belongsTo(ProjectReport::class);
    }
}
