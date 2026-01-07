import { useState, useEffect } from 'react';
import { 
    CreditCard, Plus, Edit2, Trash2, Eye, EyeOff, 
    QrCode, Building2, GripVertical, X, Save, Upload,
    AlertCircle, CheckCircle
} from 'lucide-react';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';

function PaymentMethodsPage() {
    const [methods, setMethods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingMethod, setEditingMethod] = useState(null);
    const [formData, setFormData] = useState({
        type: 'bank_transfer',
        bank_name: '',
        account_name: '',
        account_number: '',
        instructions: '',
        is_active: true,
        is_default: false,
    });
    const [qrisImage, setQrisImage] = useState(null);
    const [qrisPreview, setQrisPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchMethods();
    }, []);

    const fetchMethods = async () => {
        try {
            const response = await fetch('/api/payment-methods', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                }
            });
            if (response.ok) {
                const data = await response.json();
                setMethods(data);
            }
        } catch (err) {
            setError('Gagal memuat metode pembayaran');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (method = null) => {
        if (method) {
            setEditingMethod(method);
            setFormData({
                type: method.type,
                bank_name: method.bank_name || '',
                account_name: method.account_name || '',
                account_number: method.account_number || '',
                instructions: method.instructions || '',
                is_active: method.is_active,
                is_default: method.is_default,
            });
            if (method.qris_image) {
                setQrisPreview(`/storage/${method.qris_image}`);
            }
        } else {
            setEditingMethod(null);
            setFormData({
                type: 'bank_transfer',
                bank_name: '',
                account_name: '',
                account_number: '',
                instructions: '',
                is_active: true,
                is_default: false,
            });
            setQrisPreview(null);
        }
        setQrisImage(null);
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingMethod(null);
        setQrisImage(null);
        setQrisPreview(null);
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setQrisImage(file);
            setQrisPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        const data = new FormData();
        data.append('type', formData.type);
        if (formData.type === 'bank_transfer') {
            data.append('bank_name', formData.bank_name);
            data.append('account_name', formData.account_name);
            data.append('account_number', formData.account_number);
        }
        data.append('instructions', formData.instructions);
        data.append('is_active', formData.is_active ? '1' : '0');
        data.append('is_default', formData.is_default ? '1' : '0');
        if (qrisImage) {
            data.append('qris_image', qrisImage);
        }

        try {
            const url = editingMethod 
                ? `/api/payment-methods/${editingMethod.id}`
                : '/api/payment-methods';
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: data,
            });

            const result = await response.json();
            
            if (response.ok) {
                setSuccess(result.message);
                fetchMethods();
                handleCloseModal();
            } else {
                setError(result.message || 'Gagal menyimpan metode pembayaran');
            }
        } catch (err) {
            setError('Terjadi kesalahan');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (method) => {
        if (method.type === 'qris' && method.is_default) {
            setError('Metode QRIS utama tidak dapat dihapus');
            return;
        }
        
        if (!confirm('Yakin ingin menghapus metode pembayaran ini?')) return;

        try {
            const response = await fetch(`/api/payment-methods/${method.id}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            const result = await response.json();
            
            if (response.ok) {
                setSuccess(result.message);
                fetchMethods();
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError('Gagal menghapus metode pembayaran');
        }
    };

    const handleToggle = async (method) => {
        try {
            const response = await fetch(`/api/payment-methods/${method.id}/toggle`, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            const result = await response.json();
            
            if (response.ok) {
                setSuccess(result.message);
                fetchMethods();
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError('Gagal mengubah status');
        }
    };

    const getMethodIcon = (type) => {
        if (type === 'qris') return <QrCode className="text-purple-600" size={24} />;
        return <Building2 className="text-blue-600" size={24} />;
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
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <CreditCard className="text-blue-600" />
                    Pengaturan Metode Pembayaran
                </h1>
                <p className="text-gray-600 mt-1">
                    Kelola metode pembayaran yang tersedia untuk pelanggan
                </p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} className="mb-4" />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} className="mb-4" />}

            {/* Add Button */}
            <div className="mb-6">
                <Button onClick={() => handleOpenModal()} className="flex items-center gap-2">
                    <Plus size={20} />
                    Tambah Metode Pembayaran
                </Button>
            </div>

            {/* Methods List */}
            <div className="space-y-4">
                {methods.length === 0 ? (
                    <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
                        <CreditCard size={48} className="mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-500">Belum ada metode pembayaran</p>
                        <p className="text-sm text-gray-400 mt-1">Klik tombol di atas untuk menambahkan</p>
                    </div>
                ) : (
                    methods.map((method) => (
                        <div 
                            key={method.id}
                            className={`bg-white rounded-xl border ${method.is_active ? 'border-gray-200' : 'border-gray-300 bg-gray-50'} p-5 transition-all hover:shadow-md`}
                        >
                            <div className="flex items-start gap-4">
                                {/* Drag Handle & Icon */}
                                <div className="flex items-center gap-3">
                                    <GripVertical className="text-gray-400 cursor-move" size={20} />
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${method.type === 'qris' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                                        {getMethodIcon(method.type)}
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-gray-900">
                                            {method.type === 'qris' ? 'QRIS' : method.bank_name}
                                        </h3>
                                        {method.is_default && (
                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                                                Utama
                                            </span>
                                        )}
                                        {!method.is_active && (
                                            <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full font-medium">
                                                Nonaktif
                                            </span>
                                        )}
                                    </div>
                                    {method.type === 'bank_transfer' && (
                                        <div className="mt-1 text-sm text-gray-600">
                                            <p>{method.account_name}</p>
                                            <p className="font-mono">{method.account_number}</p>
                                        </div>
                                    )}
                                    {method.type === 'qris' && method.qris_image && (
                                        <p className="mt-1 text-sm text-gray-500">
                                            Gambar QRIS tersedia
                                        </p>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggle(method)}
                                        className={`p-2 rounded-lg transition ${method.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                        title={method.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                    >
                                        {method.is_active ? <Eye size={20} /> : <EyeOff size={20} />}
                                    </button>
                                    <button
                                        onClick={() => handleOpenModal(method)}
                                        className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                                        title="Edit"
                                    >
                                        <Edit2 size={20} />
                                    </button>
                                    {!(method.type === 'qris' && method.is_default) && (
                                        <button
                                            onClick={() => handleDelete(method)}
                                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                                            title="Hapus"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">
                                {editingMethod ? 'Edit Metode Pembayaran' : 'Tambah Metode Pembayaran'}
                            </h2>
                            <button onClick={handleCloseModal} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {/* Type Selection */}
                            {!editingMethod && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Jenis Metode
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, type: 'qris' }))}
                                            className={`p-4 rounded-xl border-2 transition flex flex-col items-center gap-2 ${formData.type === 'qris' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}
                                        >
                                            <QrCode size={32} className={formData.type === 'qris' ? 'text-purple-600' : 'text-gray-400'} />
                                            <span className={`font-medium ${formData.type === 'qris' ? 'text-purple-700' : 'text-gray-600'}`}>QRIS</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, type: 'bank_transfer' }))}
                                            className={`p-4 rounded-xl border-2 transition flex flex-col items-center gap-2 ${formData.type === 'bank_transfer' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                                        >
                                            <Building2 size={32} className={formData.type === 'bank_transfer' ? 'text-blue-600' : 'text-gray-400'} />
                                            <span className={`font-medium ${formData.type === 'bank_transfer' ? 'text-blue-700' : 'text-gray-600'}`}>Transfer Bank</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Bank Transfer Fields */}
                            {formData.type === 'bank_transfer' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Nama Bank <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.bank_name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="BCA, BNI, Mandiri, dll"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Nama Rekening <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.account_name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Nama pemilik rekening"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Nomor Rekening <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.account_number}
                                            onChange={(e) => setFormData(prev => ({ ...prev, account_number: e.target.value }))}
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                                            placeholder="1234567890"
                                            required
                                        />
                                    </div>
                                </>
                            )}

                            {/* QRIS Image Upload */}
                            {formData.type === 'qris' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Gambar QRIS
                                    </label>
                                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                                        {qrisPreview ? (
                                            <div className="space-y-3">
                                                <img 
                                                    src={qrisPreview} 
                                                    alt="QRIS Preview" 
                                                    className="max-w-[200px] mx-auto rounded-lg"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setQrisImage(null);
                                                        setQrisPreview(null);
                                                    }}
                                                    className="text-sm text-red-600 hover:underline"
                                                >
                                                    Hapus gambar
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer">
                                                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                                                <p className="text-sm text-gray-600">Klik untuk upload gambar QRIS</p>
                                                <p className="text-xs text-gray-400 mt-1">PNG, JPG max 2MB</p>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleImageChange}
                                                    className="hidden"
                                                />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Instructions */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Panduan Pembayaran
                                </label>
                                <textarea
                                    value={formData.instructions}
                                    onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Instruksi pembayaran untuk pelanggan..."
                                />
                            </div>

                            {/* Options */}
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_active}
                                        onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">Aktifkan metode pembayaran ini</span>
                                </label>
                                {!(editingMethod?.type === 'qris' && editingMethod?.is_default) && (
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.is_default}
                                            onChange={(e) => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                                            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">Jadikan sebagai metode utama</span>
                                    </label>
                                )}
                            </div>

                            {/* Submit Buttons */}
                            <div className="flex gap-3 pt-4">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleCloseModal}
                                    className="flex-1"
                                >
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

export default PaymentMethodsPage;
