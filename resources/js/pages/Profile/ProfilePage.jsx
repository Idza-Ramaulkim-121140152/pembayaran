import { useState, useEffect } from 'react';
import { User, Mail, Lock, Trash2, Save, AlertTriangle } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';

function ProfilePage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    
    // Form states
    const [profileData, setProfileData] = useState({ name: '', email: '' });
    const [passwordData, setPasswordData] = useState({ 
        current_password: '', 
        password: '', 
        password_confirmation: '' 
    });
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteModal, setDeleteModal] = useState(false);
    
    const [submitting, setSubmitting] = useState({
        profile: false,
        password: false,
        delete: false,
    });

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchUser = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/user', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            if (!response.ok) throw new Error('Failed to fetch user');
            const data = await response.json();
            setUser(data);
            setProfileData({ name: data.name, email: data.email });
        } catch (err) {
            setError('Gagal memuat data profil');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setSubmitting(prev => ({ ...prev, profile: true }));

        try {
            const response = await fetch('/profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify(profileData),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Gagal mengupdate profil');
            }

            setSuccess('Profil berhasil diupdate');
            fetchUser();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(prev => ({ ...prev, profile: false }));
        }
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        setSubmitting(prev => ({ ...prev, password: true }));

        try {
            const response = await fetch('/password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify(passwordData),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Gagal mengupdate password');
            }

            setSuccess('Password berhasil diupdate');
            setPasswordData({ current_password: '', password: '', password_confirmation: '' });
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(prev => ({ ...prev, password: false }));
        }
    };

    const handleDeleteAccount = async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(prev => ({ ...prev, delete: true }));

        try {
            const response = await fetch('/profile', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify({ password: deletePassword }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Gagal menghapus akun');
            }

            window.location.href = '/';
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(prev => ({ ...prev, delete: false }));
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat profil..." />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Profil</h1>
                <p className="text-gray-600 mt-1">Kelola informasi akun Anda</p>
            </div>

            {/* Alerts */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* Profile Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">Informasi Profil</h2>
                    <p className="text-sm text-gray-600">Update nama dan email akun Anda.</p>
                </div>
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nama</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                value={profileData.name}
                                onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                                required
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="email"
                                value={profileData.email}
                                onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                                required
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" variant="primary" disabled={submitting.profile}>
                            <Save size={18} className="mr-2" />
                            {submitting.profile ? 'Menyimpan...' : 'Simpan'}
                        </Button>
                    </div>
                </form>
            </div>

            {/* Update Password */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">Update Password</h2>
                    <p className="text-sm text-gray-600">Pastikan menggunakan password yang kuat dan unik.</p>
                </div>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password Saat Ini</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="password"
                                value={passwordData.current_password}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, current_password: e.target.value }))}
                                required
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password Baru</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="password"
                                value={passwordData.password}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, password: e.target.value }))}
                                required
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password Baru</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="password"
                                value={passwordData.password_confirmation}
                                onChange={(e) => setPasswordData(prev => ({ ...prev, password_confirmation: e.target.value }))}
                                required
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" variant="primary" disabled={submitting.password}>
                            <Save size={18} className="mr-2" />
                            {submitting.password ? 'Menyimpan...' : 'Update Password'}
                        </Button>
                    </div>
                </form>
            </div>

            {/* Delete Account */}
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
                <div className="mb-6">
                    <h2 className="text-lg font-semibold text-red-600">Hapus Akun</h2>
                    <p className="text-sm text-gray-600">
                        Setelah akun dihapus, semua data akan hilang permanen. Pastikan Anda sudah backup data yang diperlukan.
                    </p>
                </div>
                <Button variant="danger" onClick={() => setDeleteModal(true)}>
                    <Trash2 size={18} className="mr-2" />
                    Hapus Akun
                </Button>
            </div>

            {/* Delete Confirmation Modal */}
            <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} title="Hapus Akun">
                <form onSubmit={handleDeleteAccount} className="space-y-4">
                    <div className="bg-red-50 rounded-lg p-4 flex items-start gap-3">
                        <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm text-red-700 font-medium">Apakah Anda yakin ingin menghapus akun?</p>
                            <p className="text-sm text-red-600 mt-1">
                                Tindakan ini tidak dapat dibatalkan. Semua data Anda akan dihapus secara permanen.
                            </p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Masukkan Password untuk Konfirmasi</label>
                        <input
                            type="password"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            required
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Password"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setDeleteModal(false)}>
                            Batal
                        </Button>
                        <Button type="submit" variant="danger" disabled={submitting.delete}>
                            {submitting.delete ? 'Menghapus...' : 'Ya, Hapus Akun'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default ProfilePage;
