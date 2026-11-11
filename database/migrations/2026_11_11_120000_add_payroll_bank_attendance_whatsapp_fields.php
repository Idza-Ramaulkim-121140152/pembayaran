<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('payroll_members')) {
            Schema::table('payroll_members', function (Blueprint $table) {
                if (!Schema::hasColumn('payroll_members', 'atas_nama_rekening')) {
                    $table->string('atas_nama_rekening', 150)->nullable()->after('nomor_rekening');
                }
            });
        }

        if (Schema::hasTable('payroll_member_payments')) {
            Schema::table('payroll_member_payments', function (Blueprint $table) {
                if (!Schema::hasColumn('payroll_member_payments', 'payment_method')) {
                    $table->string('payment_method', 30)->nullable()->after('cash_paid_amount');
                }
                if (!Schema::hasColumn('payroll_member_payments', 'bank_name')) {
                    $table->string('bank_name', 100)->nullable()->after('payment_method');
                }
                if (!Schema::hasColumn('payroll_member_payments', 'account_number')) {
                    $table->string('account_number', 100)->nullable()->after('bank_name');
                }
                if (!Schema::hasColumn('payroll_member_payments', 'account_holder')) {
                    $table->string('account_holder', 150)->nullable()->after('account_number');
                }
                if (!Schema::hasColumn('payroll_member_payments', 'attendance_summary')) {
                    $table->json('attendance_summary')->nullable()->after('account_holder');
                }
                if (!Schema::hasColumn('payroll_member_payments', 'whatsapp_status')) {
                    $table->string('whatsapp_status', 30)->nullable()->after('attendance_summary');
                }
                if (!Schema::hasColumn('payroll_member_payments', 'whatsapp_sent_at')) {
                    $table->timestamp('whatsapp_sent_at')->nullable()->after('whatsapp_status');
                }
                if (!Schema::hasColumn('payroll_member_payments', 'whatsapp_error')) {
                    $table->text('whatsapp_error')->nullable()->after('whatsapp_sent_at');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payroll_member_payments')) {
            $columns = array_values(array_filter([
                'payment_method',
                'bank_name',
                'account_number',
                'account_holder',
                'attendance_summary',
                'whatsapp_status',
                'whatsapp_sent_at',
                'whatsapp_error',
            ], fn (string $col) => Schema::hasColumn('payroll_member_payments', $col)));

            if (!empty($columns)) {
                Schema::table('payroll_member_payments', function (Blueprint $table) use ($columns) {
                    $table->dropColumn($columns);
                });
            }
        }

        if (Schema::hasTable('payroll_members') && Schema::hasColumn('payroll_members', 'atas_nama_rekening')) {
            Schema::table('payroll_members', function (Blueprint $table) {
                $table->dropColumn('atas_nama_rekening');
            });
        }
    }
};
