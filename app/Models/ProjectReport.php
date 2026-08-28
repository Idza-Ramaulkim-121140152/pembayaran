<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectReport extends Model
{
    protected $fillable = [
        'name',
        'notes',
        'starts_at',
        'ends_at',
        'is_active',
    ];

    protected $casts = [
        'starts_at' => 'date:Y-m-d',
        'ends_at' => 'date:Y-m-d',
        'is_active' => 'boolean',
    ];

    public function wilayahMappings()
    {
        return $this->hasMany(ProjectReportWilayahMapping::class)->orderBy('id');
    }

    public function manualExpenses()
    {
        return $this->hasMany(ProjectReportManualExpense::class)->orderBy('id');
    }

    public function customers()
    {
        return $this->belongsToMany(Customer::class, 'project_report_customers')->withTimestamps();
    }

    public function payrollProjects()
    {
        return $this->belongsToMany(PayrollProject::class, 'project_report_payroll_projects')->withTimestamps();
    }
}
