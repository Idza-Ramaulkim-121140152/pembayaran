import { useEffect, useState } from 'react';
import { Edit2, Plus, ShieldAlert, ToggleLeft, ToggleRight, Trash2, Wallet } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';
import {
    AdminConsoleActionRow,
    AdminConsoleField,
    AdminConsoleNotice,
    AdminConsoleSurface,
    adminConsoleButtonClassNames,
    adminConsoleInputClassName,
    adminConsoleSelectClassName,
} from '../../components/common/AdminConsoleUI';
import expenseCategoryService from '../../services/expenseCategoryService';

const DEFAULT_FORM = {
    name: '',
    is_active: true,
};

function ExpenseCategoryForm({ formData, setFormData, onSubmit, onCancel, submitting, isEdit = false }) {
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <AdminConsoleField label="Nama Jenis *">
                <input
                    type="text"
                    value={formData.name}
                    onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                    className={adminConsoleInputClassName}
                    maxLength={100}
                    required
                    placeholder="Contoh: Operasional Lapangan"
                />
            </AdminConsoleField>
            <AdminConsoleField label="Status">
                <select
                    value={formData.is_active ? '1' : '0'}
                    onChange={(event) => setFormData((prev) => ({ ...prev, is_active: event.target.value === '1' }))}
                    className={adminConsoleSelectClassName}
                >
                    <option value="1">Aktif</option>
                    <option value="0">Nonaktif</option>
                </select>
            </AdminConsoleField>
            <AdminConsoleActionRow>
                <Button type="button" variant="secondary" onClick={onCancel} className={adminConsoleButtonClassNames.secondary}>
                    Batal
                </Button>
                <Button type="submit" variant="primary" disabled={submitting} className={adminConsoleButtonClassNames.primary}>
                    {submitting ? 'Menyimpan...' : isEdit ? 'Update' : 'Simpan'}
                </Button>
            </AdminConsoleActionRow>
        </form>
    );
}

function ExpenseCategoriesPage() {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState(DEFAULT_FORM);
    const [createOpen, setCreateOpen] = useState(false);
    const [editModal, setEditModal] = useState({ open: false, item: null });
    const [deleteModal, setDeleteModal] = useState({ open: false, item: null });

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const response = await expenseCategoryService.getAll();
            setCategories(response.data.data || []);
        } catch (err) {
            setError('Gagal memuat master jenis pengeluaran');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => setFormData(DEFAULT_FORM);

    const openEdit = (item) => {
        setFormData({
            name: item.name || '',
            is_active: Boolean(item.is_active),
        });
        setEditModal({ open: true, item });
    };

    const handleCreate = async (event) => {
        event.preventDefault();
        try {
            setSubmitting(true);
            const response = await expenseCategoryService.create(formData);
            setSuccess(response.data.message || 'Jenis pengeluaran berhasil ditambahkan');
            setCreateOpen(false);
            resetForm();
            fetchCategories();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menambahkan jenis pengeluaran');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (event) => {
        event.preventDefault();
        try {
            setSubmitting(true);
            const response = await expenseCategoryService.update(editModal.item.id, formData);
            setSuccess(response.data.message || 'Jenis pengeluaran berhasil diperbarui');
            setEditModal({ open: false, item: null });
            resetForm();
            fetchCategories();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui jenis pengeluaran');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        try {
            setSubmitting(true);
            const response = await expenseCategoryService.delete(deleteModal.item.id);
            setSuccess(response.data.message || 'Jenis pengeluaran berhasil dihapus');
            setDeleteModal({ open: false, item: null });
            fetchCategories();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus jenis pengeluaran');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            key: 'row_number',
            label: 'No',
            render: (_, index) => index + 1,
        },
        {
            key: 'name',
            label: 'Nama Jenis',
            render: (row) => (
                <div className="flex items-center gap-2">
                    <Wallet size={16} className="text-emerald-500" />
                    <span className="font-medium text-gray-800">{row.name}</span>
                </div>
            ),
        },
        {
            key: 'is_active',
            label: 'Status',
            render: (row) => (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${row.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                    {row.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    {row.is_active ? 'Aktif' : 'Nonaktif'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Master Jenis Pengeluaran</h1>
                    <p className="text-gray-600 mt-1">Kelola daftar jenis pengeluaran yang boleh dipilih tim finance.</p>
                </div>
                <Button
                    variant="primary"
                    onClick={() => {
                        resetForm();
                        setCreateOpen(true);
                    }}
                    className={adminConsoleButtonClassNames.primary}
                >
                    <Plus size={18} className="mr-2" />
                    Tambah Jenis
                </Button>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <AdminConsoleSurface accent="emerald" className="p-5 bg-[linear-gradient(135deg,rgba(6,78,59,0.14),rgba(15,23,42,0.96))]">
                <div className="flex items-start gap-3">
                    <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3">
                        <ShieldAlert className="text-emerald-300" size={22} />
                    </div>
                    <div>
                        <p className="text-sm text-slate-300">Catatan</p>
                        <p className="mt-1 text-sm text-slate-200">
                            Jenis nonaktif tidak akan muncul di form pengeluaran baru. Jenis yang sudah dipakai tidak bisa dihapus.
                        </p>
                    </div>
                </div>
            </AdminConsoleSurface>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <ResponsiveDataView
                    rows={categories}
                    columns={columns}
                    keyField="id"
                    priorityFields={['name', 'is_active']}
                    emptyMessage={loading ? 'Memuat data...' : 'Belum ada jenis pengeluaran'}
                    actions={(row) => (
                        <div className="flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                                <Edit2 size={14} />
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteModal({ open: true, item: row })}>
                                <Trash2 size={14} />
                            </Button>
                        </div>
                    )}
                />
            </div>

            <Modal isOpen={createOpen} onClose={() => { setCreateOpen(false); resetForm(); }} title="Tambah Jenis Pengeluaran" theme="dashboard">
                <ExpenseCategoryForm
                    formData={formData}
                    setFormData={setFormData}
                    onSubmit={handleCreate}
                    onCancel={() => {
                        setCreateOpen(false);
                        resetForm();
                    }}
                    submitting={submitting}
                />
            </Modal>

            <Modal isOpen={editModal.open} onClose={() => { setEditModal({ open: false, item: null }); resetForm(); }} title="Edit Jenis Pengeluaran" theme="dashboard">
                <ExpenseCategoryForm
                    formData={formData}
                    setFormData={setFormData}
                    onSubmit={handleUpdate}
                    onCancel={() => {
                        setEditModal({ open: false, item: null });
                        resetForm();
                    }}
                    submitting={submitting}
                    isEdit
                />
            </Modal>

            <Modal isOpen={deleteModal.open} onClose={() => setDeleteModal({ open: false, item: null })} title="Hapus Jenis Pengeluaran" theme="dashboard">
                <div className="space-y-4">
                    <AdminConsoleNotice tone="danger" title="Konfirmasi">
                        <p>Hapus jenis pengeluaran <strong>{deleteModal.item?.name || '-'}</strong>?</p>
                    </AdminConsoleNotice>
                    <AdminConsoleActionRow className="border-t-0 pt-0">
                        <Button variant="secondary" onClick={() => setDeleteModal({ open: false, item: null })} className={adminConsoleButtonClassNames.secondary}>
                            Batal
                        </Button>
                        <Button variant="danger" onClick={handleDelete} disabled={submitting} className={adminConsoleButtonClassNames.danger}>
                            {submitting ? 'Menghapus...' : 'Hapus'}
                        </Button>
                    </AdminConsoleActionRow>
                </div>
            </Modal>
        </div>
    );
}

export default ExpenseCategoriesPage;
