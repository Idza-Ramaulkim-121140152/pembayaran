<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PayrollProjectDetail extends Model
{
    protected $fillable = [
        'payroll_project_id',
        'tipe',
        'deskripsi',
        'inventory_item_id',
        'jumlah',
        'harga_satuan',
        'subtotal',
    ];

    protected $casts = [
        'jumlah' => 'decimal:2',
        'harga_satuan' => 'decimal:0',
        'subtotal' => 'decimal:0',
    ];

    public function project()
    {
        return $this->belongsTo(PayrollProject::class, 'payroll_project_id');
    }

    public function inventoryItem()
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }
}
