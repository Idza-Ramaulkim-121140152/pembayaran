import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, Shield, X, Eye, EyeOff } from 'lucide-react';

const ROLE_LABELS = {
    superadmin: { label: 'Super Admin', color: 'bg-red-100 text-red-800', desc: 'Akses penuh + kelola akun' },
    admin: { label: 'Admin', color: 'bg-blue-100 text-blue-800', desc: 'Akses semua fitur' },
    teknisi: { label: 'Teknisi', color: 'bg-green-100 text-green-800', desc: 'Menu teknis (pelanggan, monitoring, ODP, dll)' },
    finance: { label: 'Finance', color: 'bg-yellow-100 text-yellow-800', desc: 'Menu keuangan (penagihan, pengeluaran, payroll)' },
};

const ROLES = ['superadmin', 'admin', 'teknisi', 'finance'];

function UserManagementPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [currentUserRole, setCurrentUserRole] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'admin',
        can_confirm_payments: false,
        can_edit_mutations: false,
    });

    useEffect(() => {
        fetchUsers();
        fetchCurrentUser();
    }, []);

    const fetchCurrentUser = async () => {
        try {
            const res = await fetch('/api/user');
            const data = await res.json();
            setCurrentUserRole(data.role);
        } catch (err) {
            console.error('Failed to fetch current user', err);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/users', {
                headers: { 'Accept': 'application/json' },
            });
            const data = await res.json();
            setUsers(data.data || []);
        } catch (err) {
            setError('Gagal memuat data pengguna.');
        } finally {
            setLoading(false);
        }
    };

    const openAddModal = () => {
        setEditingUser(null);
        setFormData({ name: '', email: '', password: '', role: 'admin', can_confirm_payments: false, can_edit_mutations: false });
        setShowPassword(false);
        setShowModal(true);
        setError(null);
    };

    const openEditModal = (user) => {
        setEditingUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            password: '',
            role: user.role,
            can_confirm_payments: !!user.can_confirm_payments,
            can_edit_mutations: !!user.can_edit_mutations,
        });
        setShowPassword(false);
        setShowModal(true);
        setError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        const isEdit = !!editingUser;
        const url = isEdit ? `/api/users/${editingUser.id}` : '/api/users';
        const method = isEdit ? 'PUT' : 'POST';

        const body = { ...formData };
        if (isEdit && !body.password) delete body.password;

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                const msg = data.error || data.message || Object.values(data.errors || {}).flat().join(', ');
                setError(msg);
                return;
            }

            setSuccess(isEdit ? 'Akun berhasil diperbarui.' : 'Akun berhasil dibuat.');
            setShowModal(false);
            fetchUsers();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Terjadi kesalahan. Silakan coba lagi.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (user) => {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        try {
            const res = await fetch(`/api/users/${user.id}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Gagal menghapus akun.');
                return;
            }

            setSuccess('Akun berhasil dihapus.');
            setDeleteConfirm(null);
            fetchUsers();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Terjadi kesalahan saat menghapus.');
        }
    };

    const availableRoles = currentUserRole === 'superadmin' ? ROLES : ROLES.filter(r => r !== 'superadmin');

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="h-7 w-7 text-blue-600" />
                        Kelola Akun Pengguna
                    </h1>
                    <p className="text-gray-500 mt-1">Atur akun dan hak akses pengguna sistem</p>
                </div>
                <button
                    onClick={openAddModal}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                    <Plus size={18} />
                    Tambah Akun
                </button>
            </div>

            {/* Alerts */}
            {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center justify-between">
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)}><X size={16} /></button>
                </div>
            )}
            {error && !showModal && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X size={16} /></button>
                </div>
            )}

            {/* Role Legend */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Hak Akses Role</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(ROLE_LABELS).map(([key, { label, color, desc }]) => (
                        <div key={key} className="flex items-start gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color} whitespace-nowrap`}>{label}</span>
                            <span className="text-xs text-gray-500">{desc}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Nama</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Dibuat</th>
                                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {users.map(user => {
                                const roleInfo = ROLE_LABELS[user.role] || { label: user.role, color: 'bg-gray-100 text-gray-800' };
                                const isSelf = user.email === window.appUserEmail;
                                return (
                                    <tr key={user.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900">{user.name}</p>
                                                    {isSelf && <span className="text-xs text-blue-500">(Anda)</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleInfo.color}`}>
                                                {roleInfo.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {new Date(user.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                {!isSelf && (
                                                    <button
                                                        onClick={() => setDeleteConfirm(user)}
                                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                                        title="Hapus"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-400">
                                        Belum ada data pengguna.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-bold text-gray-900">
                                {editingUser ? 'Edit Akun' : 'Tambah Akun Baru'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && showModal && (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nama</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Password {editingUser && <span className="text-gray-400 font-normal">(kosongkan jika tidak diubah)</span>}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                                        required={!editingUser}
                                        minLength={6}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    required
                                >
                                    {availableRoles.map(role => (
                                        <option key={role} value={role}>
                                            {ROLE_LABELS[role]?.label || role} — {ROLE_LABELS[role]?.desc || ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200">
                                <input
                                    type="checkbox"
                                    checked={!!formData.can_confirm_payments}
                                    onChange={e => setFormData({ ...formData, can_confirm_payments: e.target.checked })}
                                    className="mt-1"
                                />
                                <div>
                                    <p className="text-sm font-medium text-gray-800">Izinkan Konfirmasi Pembayaran</p>
                                    <p className="text-xs text-gray-500">Hanya user yang dicentang (dan superadmin) dapat konfirmasi/menolak pembayaran invoice.</p>
                                </div>
                            </label>
                            <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200">
                                <input
                                    type="checkbox"
                                    checked={!!formData.can_edit_mutations}
                                    onChange={e => setFormData({ ...formData, can_edit_mutations: e.target.checked })}
                                    className="mt-1"
                                />
                                <div>
                                    <p className="text-sm font-medium text-gray-800">Izinkan Edit Mutasi</p>
                                    <p className="text-xs text-gray-500">Hanya user yang dicentang (dan superadmin) dapat tambah/edit/hapus mutasi.</p>
                                </div>
                            </label>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                    {submitting ? 'Menyimpan...' : editingUser ? 'Simpan Perubahan' : 'Buat Akun'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Hapus Akun</h3>
                        <p className="text-gray-600 mb-4">
                            Yakin ingin menghapus akun <strong>{deleteConfirm.name}</strong> ({deleteConfirm.email})?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                            >
                                Batal
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                            >
                                Hapus
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default UserManagementPage;
