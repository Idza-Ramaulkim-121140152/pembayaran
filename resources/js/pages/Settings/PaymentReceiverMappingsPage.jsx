import { useEffect, useState } from 'react';
import apiClient from '../../services/api';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';

function PaymentReceiverMappingsPage() {
    const [items, setItems] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const loadData = async () => {
        try {
            setLoading(true);
            const [mappingResponse, usersResponse] = await Promise.all([
                apiClient.get('/payment-receiver-mappings'),
                apiClient.get('/staff-users-lite'),
            ]);
            setItems(Array.isArray(mappingResponse.data?.data) ? mappingResponse.data.data : []);
            setUsers(Array.isArray(usersResponse.data?.data) ? usersResponse.data.data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat mapping penerima.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const toggleReceiver = async (userId, receiverUserId, checked) => {
        const item = items.find((row) => Number(row?.responsible_user?.id) === Number(userId));
        const currentIds = new Set((item?.receivers || []).map((receiver) => Number(receiver.id)));
        if (checked) {
            currentIds.add(receiverUserId);
        } else {
            currentIds.delete(receiverUserId);
        }

        try {
            setSavingId(userId);
            await apiClient.put(`/payment-receiver-mappings/${userId}`, {
                receiver_user_ids: Array.from(currentIds),
            });
            setSuccess('Mapping penerima berhasil diperbarui.');
            await loadData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui mapping.');
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Mapping Akun Penerima Pembayaran</h1>
                <p className="text-gray-600">Setiap akun penanggung/pengkonfirmasi dipetakan ke akun penerima uang yang akan menerima popup konfirmasi dan dapat memvalidasi mutasi.</p>
            </div>
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}
            <div className="space-y-4">
                {loading ? (
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-500">Memuat...</div>
                ) : items.map((item) => {
                    const responsibleUser = item.responsible_user || {};
                    const selectedIds = new Set((item.receivers || []).map((receiver) => Number(receiver.id)));
                    return (
                        <div key={responsibleUser.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between">
                                <div>
                                    <p className="font-semibold text-gray-900">{responsibleUser.name}</p>
                                    <p className="text-sm text-gray-500">{responsibleUser.email} - {responsibleUser.role}</p>
                                    <p className="mt-1 text-xs text-gray-500">Akun ini adalah penanggung/pengkonfirmasi. Pilih akun penerima uang yang boleh menjadi approver mutasi.</p>
                                </div>
                                {savingId === responsibleUser.id && <span className="text-sm text-blue-600">Menyimpan...</span>}
                            </div>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {users.filter((candidate) => candidate.id !== responsibleUser.id).map((candidate) => (
                                    <label key={candidate.id} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(Number(candidate.id))}
                                            onChange={(e) => toggleReceiver(responsibleUser.id, Number(candidate.id), e.target.checked)}
                                        />
                                        <span>{candidate.name} ({candidate.role})</span>
                                    </label>
                                ))}
                            </div>
                            <div className="mt-3">
                                <p className="text-xs text-gray-500">Akun sendiri tetap bisa dipakai untuk konfirmasi biasa tanpa menunggu approval pihak lain.</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default PaymentReceiverMappingsPage;
