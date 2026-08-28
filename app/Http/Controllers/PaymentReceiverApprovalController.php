<?php

namespace App\Http\Controllers;

use App\Models\PaymentReceiverApprovalRequest;
use App\Services\BorrowerLoanService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class PaymentReceiverApprovalController extends Controller
{
    public function __construct(private BorrowerLoanService $borrowerLoanService)
    {
    }

    private function ensureReady(): void
    {
        abort_unless(Schema::hasTable('payment_receiver_approval_requests'), 503, 'Fitur approval penerima belum siap. Jalankan migrasi terlebih dahulu.');
    }

    public function pending(Request $request)
    {
        $this->ensureReady();

        $rows = PaymentReceiverApprovalRequest::query()
            ->with([
                'invoice:id,invoice_link,customer_id',
                'invoice.customer:id,name',
                'customer:id,name',
                'financialTransaction:id,status,amount,transaction_date',
                'requestedBy:id,name',
                'borrower:id,name',
            ])
            ->where('receiver_user_id', $request->user()->id)
            ->where('status', PaymentReceiverApprovalRequest::STATUS_PENDING)
            ->orderBy('created_at')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function approve(Request $request, PaymentReceiverApprovalRequest $approval)
    {
        $this->ensureReady();

        try {
            $result = $this->borrowerLoanService->approveReceiverRequest(
                $approval,
                $request->user(),
                $request->input('decision_note')
            );

            return response()->json([
                'message' => 'Pembayaran diterima oleh akun penerima.',
                'data' => $result,
            ]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function reject(Request $request, PaymentReceiverApprovalRequest $approval)
    {
        $this->ensureReady();

        try {
            $loan = $this->borrowerLoanService->rejectReceiverRequest(
                $approval,
                $request->user(),
                $request->input('decision_note')
            );

            return response()->json([
                'message' => 'Pembayaran ditolak oleh akun penerima dan dimasukkan ke hutang.',
                'data' => $loan,
            ]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
