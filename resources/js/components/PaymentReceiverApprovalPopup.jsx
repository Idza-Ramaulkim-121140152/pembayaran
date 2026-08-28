import { useEffect, useState } from 'react';
import Modal from './common/Modal';
import Button from './common/Button';
import Alert from './common/Alert';
import apiClient from '../services/api';

function PaymentReceiverApprovalPopup() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const loadPending = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/payment-receiver-approvals/pending');
            setItems(Array.isArray(response.data?.data) ? response.data.data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat approval penerima pembayaran.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPending();

        const timer = window.setInterval(() => {
            loadPending();
        }, 15000);

        return () => window.clearInterval(timer);
    }, []);

    const handleDecision = async (approvalId, action) => {
        try {
            setSubmitting(true);
            setError(null);
            await apiClient.post(`/payment-receiver-approvals/${approvalId}/${action}`);
            await loadPending();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memproses approval.');
        } finally {
            setSubmitting(false);
        }
    };

    const current = items[0];
    const isOpen = !!current;
    const customerName = current?.invoice?.customer?.name || current?.customer?.name || current?.meta?.customer_name || 'Pelanggan';
    const sourceType = current?.source_type || 'invoice_payment';
    const sourceLabel = sourceType === 'installation_income' ? 'Biaya pemasangan pelanggan' : 'Pembayaran invoice pelanggan';

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {}}
            title="Konfirmasi Penerima Pembayaran"
            theme="dashboard"
            disableBackdropClose
            hideCloseButton
        >
            {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-4" />}
            {current && (
                <div className="space-y-4 text-slate-100">
                    <p className="text-sm text-slate-300">
                        Ada pembayaran yang dikonfirmasi ke akun Anda dan membutuhkan keputusan.
                    </p>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="font-semibold text-white">{customerName}</p>
                        <p className="mt-1 text-sm text-slate-300">Sumber: {sourceLabel}</p>
                        <p className="mt-1 text-sm text-slate-300">Invoice: {current.invoice?.invoice_link || '-'}</p>
                        <p className="mt-1 text-sm text-slate-300">Pengkonfirmasi: {current.requested_by?.name || '-'}</p>
                        <p className="mt-1 text-sm text-slate-300">Peminjam terkait: {current.borrower?.name || '-'}</p>
                        <p className="mt-1 text-sm text-slate-300">Status mutasi: {current.financial_transaction?.status || 'pending'}</p>
                        <p className="mt-2 text-lg font-bold text-amber-300">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(current.amount || 0))}
                        </p>
                    </div>
                    {loading && <p className="text-sm text-slate-400">Memuat...</p>}
                    <div className="flex gap-3">
                        <Button type="button" variant="danger" disabled={submitting} onClick={() => handleDecision(current.id, 'reject')}>
                            {submitting ? 'Memproses...' : 'Tolak dan Masukkan ke Hutang'}
                        </Button>
                        <Button type="button" variant="success" disabled={submitting} onClick={() => handleDecision(current.id, 'approve')}>
                            {submitting ? 'Memproses...' : 'Terima Pembayaran'}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

export default PaymentReceiverApprovalPopup;
