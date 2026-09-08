<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::statement("ALTER TABLE `odps` MODIFY COLUMN `rasio_distribusi` VARCHAR(50) NULL DEFAULT '1:8'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE `odps` MODIFY COLUMN `rasio_distribusi` ENUM('1:2', '1:4', '1:8', '1:16') NOT NULL DEFAULT '1:8'");
    }
};
