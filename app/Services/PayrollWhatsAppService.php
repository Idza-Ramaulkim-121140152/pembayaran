<?php

namespace App\Services;

use App\Models\NotificationLog;
use App\Models\PayrollMember;
use App\Models\PayrollMemberPayment;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class PayrollWhatsAppService
{
    public function __construct(private readonly AttendanceService $attendanceService)
    {
    }

    /**
     * Send salary payment slip & attendance summary to employee's WhatsApp.
     *
     * @return array{status: string, phone: ?string, error: ?string, message: string}
     */
    public function sendSalarySlip(PayrollMemberPayment $payment, array $context = []): array
    {
        $member = $payment->relationLoaded('member')
            ? $payment->member
            : $payment->member()->first();

        $phone = $this->resolveRecipientPhone($member);
        $message = $this->buildSalarySlipMessage($payment, $member, $context);

        if (!$this->isValidPhone($phone)) {
            $reason = 'Nomor WhatsApp pegawai belum tersedia atau tidak valid.';

            $this->persistPaymentWhatsAppStatus($payment, 'skipped', null, $reason);
            $this->logNotification($payment, $phone, $message, 'skipped', $reason);

            return [
                'status' => 'skipped',
                'phone' => $phone,
                'error' => $reason,
                'message' => $message,
            ];
        }

        $recipientName = trim((string) ($member?->nama ?? 'Pegawai'));

        try {
            $response = app(WhatsAppGatewayService::class)->sendBulk([[
                'phone' => $phone,
                'name' => $recipientName !== '' ? $recipientName : 'Pegawai',
            ]], $message, 0, 15);

            $gateway = $response->json();
            $results = is_array($gateway['results'] ?? null) ? $gateway['results'] : [];

            $sent = false;
            $error = null;

            if (count($results) > 0) {
                $first = $results[0];
                $sent = (bool) ($first['success'] ?? false);
                $error = $sent ? null : (string) ($first['error'] ?? 'Gateway menolak pengiriman pesan.');
            } elseif ($response->successful()) {
                $sent = (bool) ($gateway['success'] ?? true);
                $error = $sent ? null : (string) ($gateway['message'] ?? $gateway['error'] ?? 'Gateway menolak pengiriman pesan.');
            } else {
                $error = 'HTTP ' . $response->status() . ': ' . ($gateway['error'] ?? $gateway['message'] ?? 'Gagal menghubungi WA Gateway.');
            }

            $status = $sent ? 'sent' : 'failed';
            $sentAt = $sent ? now() : null;

            $this->persistPaymentWhatsAppStatus($payment, $status, $sentAt, $error);
            $this->logNotification($payment, $phone, $message, $status, $error);

            return [
                'status' => $status,
                'phone' => $phone,
                'error' => $error,
                'message' => $message,
            ];
        } catch (\Throwable $e) {
            $error = 'Gateway error: ' . $e->getMessage();
            Log::warning('Payroll WhatsApp slip delivery failed', [
                'payment_id' => $payment->id,
                'member_id' => $payment->payroll_member_id,
                'error' => $e->getMessage(),
            ]);

            $this->persistPaymentWhatsAppStatus($payment, 'failed', null, $error);
            $this->logNotification($payment, $phone, $message, 'failed', $error);

            return [
                'status' => 'failed',
                'phone' => $phone,
                'error' => $error,
                'message' => $message,
            ];
        }
    }

    public function buildSalarySlipMessage(
        PayrollMemberPayment $payment,
        ?PayrollMember $member = null,
        array $context = []
    ): string {
        $member ??= $payment->member;
        $companyName = trim((string) SiteSetting::get('company_name', 'Rumah Kita Net'));
        if ($companyName === '') {
            $companyName = 'Rumah Kita Net';
        }

        $memberName = trim((string) ($member?->nama ?? 'Karyawan'));
        $grossNominal = (int) round((float) ($payment->gross_nominal ?: $payment->nominal));
        $loanDeduction = (int) round((float) ($payment->loan_deduction_amount ?? 0));
        $cashPaid = (int) round((float) ($payment->cash_paid_amount ?? max(0, $grossNominal - $loanDeduction)));
        $previousPaidInPeriod = (int) round((float) ($context['previous_paid_in_period'] ?? 0));
        $remainingLoanAfter = isset($context['remaining_loan_after'])
            ? (int) round((float) $context['remaining_loan_after'])
            : null;

        $attendance = is_array($payment->attendance_summary)
            ? $payment->attendance_summary
            : ($context['attendance_summary'] ?? []);

        $periodLabel = trim((string) ($attendance['period_label'] ?? 'Periode berjalan'));
        $totalPresent = (int) ($attendance['total_present'] ?? 0);
        $totalOnTime = (int) ($attendance['total_on_time'] ?? 0);
        $totalLate = (int) ($attendance['total_late'] ?? 0);
        $totalLateMinutes = (int) ($attendance['total_late_minutes'] ?? 0);
        $totalHoursFormatted = trim((string) ($attendance['total_hours_formatted'] ?? '0 mnt'));
        $avgClockIn = trim((string) ($attendance['average_clock_in'] ?? ''));
        $lastClockIn = trim((string) ($attendance['last_clock_in_at'] ?? ''));
        $attendanceLinked = (bool) ($attendance['linked'] ?? false);
        $attendanceNote = trim((string) ($attendance['note'] ?? ''));

        $paymentMethod = $payment->payment_method ?: (($payment->bank_name && strtolower((string) $payment->bank_name) !== 'cash') ? 'transfer' : 'cash');
        $bankName = trim((string) ($payment->bank_name ?: $member?->nama_bank ?? ''));
        $accountNumber = trim((string) ($payment->account_number ?: $member?->nomor_rekening ?? ''));
        $accountHolder = trim((string) ($payment->account_holder ?: $member?->atas_nama_rekening ?: $memberName));

        $destinationLines = [];
        if ($paymentMethod === 'transfer' && $bankName !== '') {
            $destinationLines[] = '🏦 *Metode:* Transfer Bank ' . $bankName;
            $destinationLines[] = '💳 *No. Rekening:* ' . ($accountNumber !== '' ? $accountNumber : '-');
            $destinationLines[] = '👤 *Atas Nama:* ' . ($accountHolder !== '' ? $accountHolder : $memberName);
        } else {
            $destinationLines[] = '💵 *Metode:* Tunai / Cash Langsung';
        }

        $attendanceLines = [
            "🗓️ *Periode Absensi:* {$periodLabel}",
        ];
        if ($attendanceLinked || $totalPresent > 0) {
            $timingDetail = "{$totalPresent} hari";
            if ($totalPresent > 0) {
                $timingDetail .= " ({$totalOnTime} tepat waktu, {$totalLate} terlambat"
                    . ($totalLateMinutes > 0 ? " - total {$totalLateMinutes} mnt" : '')
                    . ')';
            }
            $attendanceLines[] = "📍 *Waktu Masuk / Hadir:* {$timingDetail}";
            $attendanceLines[] = "⏱️ *Total Waktu Kerja:* {$totalHoursFormatted}";
            if ($avgClockIn !== '') {
                $attendanceLines[] = "🕒 *Rata-rata Jam Masuk:* {$avgClockIn}" . ($lastClockIn !== '' ? " (Terakhir: {$lastClockIn})" : '');
            }
        } else {
            $attendanceLines[] = '📍 *Waktu Masuk / Hadir:* Data absensi belum terhubung / 0 hari';
        }
        if ($attendanceNote !== '') {
            $attendanceLines[] = "📝 *Catatan Absensi:* {$attendanceNote}";
        }

        $salaryLines = [];
        $allowanceBreakdown = is_array($payment->allowance_breakdown)
            ? $payment->allowance_breakdown
            : ($context['allowance_breakdown'] ?? null);

        if (is_array($allowanceBreakdown)) {
            $baseSalary = (int) round((float) ($allowanceBreakdown['gaji_pokok'] ?? 0));
            if ($baseSalary > 0) {
                $salaryLines[] = '• Gaji Pokok: ' . $this->formatRupiah($baseSalary);
            }
            foreach (($allowanceBreakdown['items'] ?? []) as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $itemName = trim((string) ($item['nama'] ?? 'Tunjangan'));
                $itemType = strtolower((string) ($item['jenis'] ?? 'bulanan'));
                $itemNominal = (int) round((float) ($item['nominal'] ?? 0));
                $multiplier = (int) ($item['multiplier'] ?? 1);
                $subtotal = (int) round((float) ($item['subtotal'] ?? 0));

                if ($itemType === 'harian') {
                    $salaryLines[] = "• Tunjangan Harian ({$itemName}): {$multiplier} hr x "
                        . $this->formatRupiah($itemNominal) . ' = ' . $this->formatRupiah($subtotal);
                } else {
                    $salaryLines[] = "• Tunjangan Bulanan ({$itemName}): " . $this->formatRupiah($subtotal);
                }
            }
        }

        $salaryLines[] = '• Total Jumlah Gaji (Bruto): *' . $this->formatRupiah($grossNominal) . '*';
        $salaryLines[] = '• Sudah Diambil / Dibayar Sebelumnya (Periode Ini): ' . $this->formatRupiah($previousPaidInPeriod);
        $salaryLines[] = '• Potongan Hutang / Kasbon: ' . $this->formatRupiah($loanDeduction);

        if ($remainingLoanAfter !== null) {
            $salaryLines[] = '• Sisa Hutang / Pinjaman Setelah Pembayaran: ' . $this->formatRupiah($remainingLoanAfter);
        }

        $salaryLines[] = '• *Jumlah Gaji yang Harus Dibayar / Diterima:* *' . $this->formatRupiah($cashPaid) . '*';

        $paidDate = ($payment->created_at ?? now())->copy()->timezone('Asia/Jakarta')->format('d M Y, H:i');

        $lines = [
            "💸 *INFORMASI PEMBAYARAN GAJI - {$companyName}*",
            '',
            "Halo *{$memberName}*, pembayaran gaji Anda telah diproses pada {$paidDate} WIB.",
            '',
            '📊 *INFORMASI WAKTU KERJA (ABSENSI)*',
            ...$attendanceLines,
            '',
            '💰 *RINCIAN GAJI & POTONGAN*',
            ...$salaryLines,
            '',
            '🚚 *TUJUAN PENGIRIMAN GAJI*',
            ...$destinationLines,
        ];

        if (!empty($payment->catatan)) {
            $lines[] = '';
            $lines[] = '🗒️ *Catatan:* ' . trim((string) $payment->catatan);
        }

        $lines[] = '';
        $lines[] = "Terima kasih atas dedikasi dan kerja keras Anda bersama {$companyName}.";

        return implode("\n", $lines);
    }

    private function resolveRecipientPhone(?PayrollMember $member): ?string
    {
        if (!$member) {
            return null;
        }

        $phone = trim((string) ($member->telepon ?? ''));
        if ($this->isValidPhone($phone)) {
            return $phone;
        }

        $linkedUser = $this->attendanceService->resolveUserForPayrollMember($member);
        $fallbackPhone = trim((string) ($linkedUser?->phone ?? ''));

        return $this->isValidPhone($fallbackPhone) ? $fallbackPhone : ($phone !== '' ? $phone : null);
    }

    private function isValidPhone(?string $phone): bool
    {
        if (!$phone || $phone === '0') {
            return false;
        }

        $cleaned = preg_replace('/\D/', '', $phone);
        return strlen((string) $cleaned) >= 8 && strlen((string) $cleaned) <= 16;
    }

    private function persistPaymentWhatsAppStatus(
        PayrollMemberPayment $payment,
        string $status,
        mixed $sentAt,
        ?string $error
    ): void {
        if (!Schema::hasTable('payroll_member_payments') || !Schema::hasColumn('payroll_member_payments', 'whatsapp_status')) {
            return;
        }

        $payment->forceFill([
            'whatsapp_status' => $status,
            'whatsapp_sent_at' => $sentAt,
            'whatsapp_error' => $error,
        ])->save();
    }

    private function logNotification(
        PayrollMemberPayment $payment,
        ?string $phone,
        string $message,
        string $status,
        ?string $error
    ): void {
        if (!Schema::hasTable('notification_logs')) {
            return;
        }

        try {
            NotificationLog::create([
                'phone' => $phone,
                'message' => mb_substr($message, 0, 2000),
                'status' => $status,
                'error' => $error,
                'meta' => [
                    'channel' => 'whatsapp',
                    'type' => 'payroll_salary_slip',
                    'payroll_member_id' => $payment->payroll_member_id,
                    'payroll_member_payment_id' => $payment->id,
                ],
                'sent_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning('Failed to create payroll notification log', ['error' => $e->getMessage()]);
        }
    }

    private function formatRupiah(int $amount): string
    {
        return 'Rp ' . number_format($amount, 0, ',', '.');
    }
}
