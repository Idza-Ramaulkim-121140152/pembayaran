<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollProjectDetail extends Model
{
    protected $fillable = ['payroll_project_id', 'tipe', 'deskripsi', 'jumlah', 'harga_satuan', 'subtotal'];

    public function project()
    {
        return $this->belongsTo(PayrollProject::class, 'payroll_project_id');
    }
}
