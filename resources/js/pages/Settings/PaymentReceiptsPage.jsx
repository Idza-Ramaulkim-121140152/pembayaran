import { useEffect, useState } from 'react';
import {
    Plus,
    Edit2,
    Trash2,
    Eye,
    EyeOff,
    Wallet,
    X,
    Save,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';

function PaymentReceiptsPage() {
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingOption, setEditingOption] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        is_active: true,
        is_default: false,
    });

    useEffect(() => {
        fetchOptions();
    }, []);

    const fetchOptions = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/payment-receipt-options', {
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            if (response.ok) {
                const data = await response.json();
                setOptions(Array.isArray(data) ? data : []);
            } else {
                const payload = await response.json().catch(() => ({}));
                setError(payload.message || 'Gagal memuat opsi penerimaan pembayaran');
            }
        } catch (err) {
            setError('Gagal memuat opsi penerimaan pembayaran');
        } finally {
            setLoading(false);
        }
    };

    const openModal = (option = null) => {
        if (option) {
            setEditingOption(option);
            setFormData({
                name: option.name || '',
                description: option.description || '',
                is_active: !!option.is_active,
                is_default: !!option.is_default,
            });
        } else {
            setEditingOption(null);
            setFormData({
                name: '',
                description: '',
                is_active: true,
                is_default: false,
            });
        }

        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingOption(null);
        setFormData({
            name: '',
            description: '',
            is_active: true,
            is_default: false,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const url = editingOption
                ? `/api/payment-receipt-options/${editingOption.id}`
                : '/api/payment-receipt-options';

            const response = await fetch(url, {
                method: editingOption ? 'PUT' : 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok) {
                setSuccess(result.message || 'Opsi penerimaan pembayaran berhasil disimpan');
                closeModal();
                fetchOptions();
            } else {
                setError(result.message || 'Gagal menyimpan opsi penerimaan pembayaran');
            }
        } catch (err) {
            setError('Terjadi kesalahan saat menyimpan data');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggle = async (option) => {
        try {
            const response = await fetch(`/api/payment-receipt-options/${option.id}/toggle`, {
                method: 'PATCH',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok) {
                setSuccess(result.message || 'Status opsi penerimaan berhasil diperbarui');
                fetchOptions();
            } else {
                setError(result.message || 'Gagal mengubah status opsi penerimaan');
            }
        } catch (err) {
            setError('Gagal mengubah status opsi penerimaan');
        }
    };

    const handleDelete = async (option) => {
        if (!confirm(`Yakin ingin menghapus opsi "${option.name}"?`)) return;

        try {
            const response = await fetch(`/api/payment-receipt-options/${option.id}`, {
                method: 'DELETE',
                headers: {
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok) {
                setSuccess(result.message || 'Opsi penerimaan pembayaran berhasil dihapus');
                fetchOptions();
            } else {
                setError(result.message || 'Gagal menghapus opsi penerimaan pembayaran');
            }
        } catch (err) {
            setError('Gagal menghapus opsi penerimaan pembayaran');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <Wallet className="text-blue-600" />
                    Pengaturan Penerimaan Pembayaran
                </h1>
                <p className="text-gray-600 mt-1">
                    Kelola pilihan pada kolom Terima via saat konfirmasi pembayaran di menu penagihan.
                </p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-4" />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} className="mb-4" />}

            <div className="mb-6">
                <Button onClick={() => openModal()} className="flex items-center gap-2">
                    <Plus size={20} />
                    Tambah Opsi Penerimaan
                </Button>
            </div>

            <div className="space-y-4">
                {options.length === 0 ? (
                    <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
                        <Wallet size={48} className="mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-500">Belum ada opsi penerimaan pembayaran</p>
                        <p className="text-sm text-gray-400 mt-1">Klik tombol di atas untuk menambahkan opsi baru</p>
                    </div>
                ) : (
                    options.map((option) => (
                        <div
                            key={option.id}
                            className={`bg-white rounded-xl border ${option.is_active ? 'border-gray-200' : 'border-gray-300 bg-gray-50'} p-5 transition-all hover:shadow-md`}
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-100">
                                    <Wallet className="text-blue-600" size={24} />
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-gray-900">{option.name}</h3>
                                        {option.is_default && (
                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                                                Utama
                                            </span>
                                        )}
                                        {!option.is_active && (
                                            <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full font-medium">
                                                Nonaktif
                                            </span>
                                        )}
                                    </div>
                                    {option.description && (
                                        <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">{option.description}</p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggle(option)}
                                        className={`p-2 rounded-lg transition ${option.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                        title={option.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                    >
                                        {option.is_active ? <Eye size={20} /> : <EyeOff size={20} />}
                                    </button>
                                    <button
                                        onClick={() => openModal(option)}
                                        className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                                        title="Edit"
                                    >
                                        <Edit2 size={20} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(option)}
                                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                                        title="Hapus"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">
                                {editingOption ? 'Edit Opsi Penerimaan' : 'Tambah Opsi Penerimaan'}
                            </h2>
                            <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nama Opsi <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Contoh: Tunai, Transfer Toko, E-Wallet"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Keterangan tambahan (opsional)"
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_active}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">Aktifkan opsi penerimaan ini</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_default}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, is_default: e.target.checked }))}
                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">Jadikan sebagai opsi utama</span>
                                </label>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
                                    Batal
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                    ) : (
                                        <>
                                            <Save size={20} />
                                            Simpan
                                        </>
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PaymentReceiptsPage;
