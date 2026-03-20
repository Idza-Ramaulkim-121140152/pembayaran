<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Pengeluaran extends Model
{
    protected $fillable = [
        'tanggal', 'jumlah', 'kategori', 'detail', 'user_id'
    ];

    protected $casts = [
        'tanggal' => 'date:Y-m-d',
        'jumlah' => 'decimal:0',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class);
    }
}
