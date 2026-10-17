import { useState, useEffect, useMemo } from 'react';
import {
    Users,
    UserPlus,
    RefreshCw,
    Search,
    Shield,
    Wallet,
    CreditCard,
    Clock,
    AlertCircle,
    CheckCircle2,
    Eye,
    Edit2,
    Trash2,
    Link2,
    Phone,
    Mail,
    Building2,
    Calendar,
    X,
    Check,
    ChevronRight,
    ExternalLink,
    AlertTriangle,
    Lock,
    EyeOff,
    FileText,
    History,
    DollarSign,
    UserCheck,
    MessageCircle
} from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const ROLE_BADGES = {
    superadmin: { label: 'Super Admin', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
    admin: { label: 'Admin', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
    teknisi: { label: 'Teknisi', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    finance: { label: 'Finance', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function formatRupiah(num) {
    if (num === null || num === undefined || isNaN(num)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
    }).format(num);
}

function normalizeWaPhone(phone) {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) {
        digits = '62' + digits.slice(1);
    }
    return digits;
}

export default function MasterPegawaiPage() {
    const [employees, setEmployees] = useState([]);
    const [metrics, setMetrics] = useState({
        total_employees: 0,
        total_with_account: 0,
        total_with_payroll: 0,
        total_with_loans: 0,
        total_present_today: 0,
        total_unsynced: 0,
    });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [syncFilter, setSyncFilter] = useState('all');

    // Notification states
    const [toast, setToast] = useState(null);
    const [syncing, setSyncing] = useState(false);

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Selected Employee for view / edit
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [detailData, setDetailData] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [activeDetailTab, setActiveDetailTab] = useState('profile'); // profile, payroll, loans, attendance

    // Form states
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // Create / Edit Form Data
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        // User account
        create_account: false,
        email: '',
        password: '',
        role: 'teknisi',
        can_confirm_payments: false,
        can_edit_mutations: false,
        can_choose_payment_mutation: false,
        can_choose_payment_receiver: false,
        // Payroll
        create_payroll: true,
        tipe_gaji: 'bulanan',
        gaji_pokok: '',
        tunjangan: '',
        tanggal_gajian: 1,
        nama_bank: '',
        nomor_rekening: '',
        is_active: true,
        // Borrower
        create_borrower: true,
        borrower_notes: '',
    });

    // Link Form Data
    const [linkData, setLinkData] = useState({
        user_id: '',
        payroll_member_id: '',
        borrower_id: '',
        sync_attributes: true,
    });

    useEffect(() => {
        fetchEmployees();
    }, [search, roleFilter, syncFilter]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (roleFilter !== 'all') params.append('role', roleFilter);
            if (syncFilter !== 'all') params.append('sync_status', syncFilter);

            const res = await fetch(`/api/master-pegawai?${params.toString()}`, {
                headers: { 'Accept': 'application/json' },
            });
            const json = await res.json();
            if (json.success) {
                setEmployees(json.data || []);
                if (json.metrics) {
                    setMetrics(json.metrics);
                }
            }
        } catch (err) {
            console.error('Failed to fetch employees', err);
            showToast('Gagal memuat data pegawai.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Auto-sync function
    const handleAutoSync = async () => {
        setSyncing(true);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const res = await fetch('/api/master-pegawai/auto-sync', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });
            const json = await res.json();
            if (json.success) {
                showToast(json.message || 'Sinkronisasi berhasil dijalankan!', 'success');
                fetchEmployees();
            } else {
                showToast(json.message || 'Gagal menjalankan auto-sync.', 'error');
            }
        } catch (err) {
            showToast('Terjadi kesalahan saat sinkronisasi.', 'error');
        } finally {
            setSyncing(false);
        }
    };

    // Detail Drawer / Modal
    const handleOpenDetail = async (emp) => {
        setSelectedEmployee(emp);
        setActiveDetailTab('profile');
        setShowDetailModal(true);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/master-pegawai/${emp.id}`, {
                headers: { 'Accept': 'application/json' },
            });
            const json = await res.json();
            if (json.success) {
                setDetailData(json.data);
            }
        } catch (err) {
            console.error('Failed to load employee details', err);
        } finally {
            setDetailLoading(false);
        }
    };

    // Open Create Modal
    const handleOpenCreate = () => {
        setFormData({
            name: '',
            phone: '',
            create_account: false,
            email: '',
            password: '',
            role: 'teknisi',
            can_confirm_payments: false,
            can_edit_mutations: false,
            can_choose_payment_mutation: false,
            can_choose_payment_receiver: false,
            create_payroll: true,
            tipe_gaji: 'bulanan',
            gaji_pokok: '',
            tunjangan: '',
            tanggal_gajian: 1,
            nama_bank: '',
            nomor_rekening: '',
            is_active: true,
            create_borrower: true,
            borrower_notes: '',
        });
        setFormError(null);
        setShowPassword(false);
        setShowCreateModal(true);
    };

    // Open Edit Modal
    const handleOpenEdit = (emp) => {
        setSelectedEmployee(emp);
        setFormData({
            name: emp.nama || '',
            phone: emp.phone !== '-' ? emp.phone : '',
            create_account_now: !emp.user_id,
            email: emp.email || '',
            password: '',
            role: emp.role || 'teknisi',
            can_confirm_payments: emp.user?.can_confirm_payments || false,
            can_edit_mutations: emp.user?.can_edit_mutations || false,
            can_choose_payment_mutation: emp.user?.can_choose_payment_mutation || false,
            can_choose_payment_receiver: emp.user?.can_choose_payment_receiver || false,
            tipe_gaji: emp.payroll?.tipe_gaji || 'bulanan',
            gaji_pokok: emp.payroll?.gaji_pokok || '',
            tunjangan: emp.payroll?.tunjangan || '',
            tanggal_gajian: emp.payroll?.tanggal_gajian || 1,
            nama_bank: emp.payroll?.nama_bank || '',
            nomor_rekening: emp.payroll?.nomor_rekening || '',
            is_active: emp.is_active !== undefined ? emp.is_active : true,
            borrower_notes: emp.borrower?.notes || '',
        });
        setFormError(null);
        setShowPassword(false);
        setShowEditModal(true);
    };

    // Open Link Modal
    const handleOpenLink = (emp) => {
        setSelectedEmployee(emp);
        setLinkData({
            user_id: emp.user_id || '',
            payroll_member_id: emp.payroll_member_id || '',
            borrower_id: emp.borrower_id || '',
            sync_attributes: true,
        });
        setShowLinkModal(true);
    };

    // Submit Create Form
    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFormError(null);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const res = await fetch('/api/master-pegawai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(formData),
            });
            const json = await res.json();
            if (res.ok && json.success) {
                showToast('Pegawai berhasil ditambahkan dan disinkronkan!');
                setShowCreateModal(false);
                fetchEmployees();
            } else {
                setFormError(json.message || json.error || Object.values(json.errors || {}).flat().join(', '));
            }
        } catch (err) {
            setFormError('Terjadi kesalahan koneksi.');
        } finally {
            setSubmitting(false);
        }
    };

    // Submit Edit Form
    const handleEditSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setFormError(null);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const res = await fetch(`/api/master-pegawai/${selectedEmployee.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(formData),
            });
            const json = await res.json();
            if (res.ok && json.success) {
                showToast('Identitas pegawai berhasil diperbarui dan disinkronkan!');
                setShowEditModal(false);
                fetchEmployees();
            } else {
                setFormError(json.message || json.error || Object.values(json.errors || {}).flat().join(', '));
            }
        } catch (err) {
            setFormError('Terjadi kesalahan koneksi.');
        } finally {
            setSubmitting(false);
        }
    };

    // Submit Link Form
    const handleLinkSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const res = await fetch('/api/master-pegawai/link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(linkData),
            });
            const json = await res.json();
            if (res.ok && json.success) {
                showToast('Data berhasil dihubungkan.');
                setShowLinkModal(false);
                fetchEmployees();
            } else {
                showToast(json.message || 'Gagal menghubungkan data.', 'error');
            }
        } catch (err) {
            showToast('Terjadi kesalahan sistem.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Handle Delete / Deactivate
    const handleDelete = async (emp) => {
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const res = await fetch(`/api/master-pegawai/${emp.id}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });
            const json = await res.json();
            if (res.ok && json.success) {
                showToast(json.message || 'Data pegawai berhasil diproses.');
                setDeleteConfirm(null);
                fetchEmployees();
            } else {
                showToast(json.message || json.error || 'Gagal memproses penghapusan.', 'error');
            }
        } catch (err) {
            showToast('Terjadi kesalahan sistem.', 'error');
        }
    };

    return (
        <div className="space-y-6">
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium animate-[fadeIn_.2s_ease-out] ${
                    toast.type === 'error'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                    {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                    <span>{toast.message}</span>
                </div>
            )}

            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="text-indigo-600" size={28} />
                        Master Pegawai
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Pusat pengelolaan identitas tunggal: menyatukan Akun Login, Payroll Gaji, Kasbon/Pinjaman, dan Absensi agar selalu sinkron.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={handleAutoSync}
                        disabled={syncing}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition shadow-sm disabled:opacity-50"
                        title="Cocokkan otomatis akun, payroll, dan peminjam berdasarkan kesamaan nomor telepon atau nama"
                    >
                        <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                        <span>{syncing ? 'Menyinkronkan...' : 'Sinkronkan Otomatis'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-md shadow-indigo-600/20"
                    >
                        <UserPlus size={16} />
                        <span>Tambah Pegawai</span>
                    </button>
                </div>
            </div>

            {/* KPI Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Total Pegawai</span>
                        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                            <Users size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 mt-2">{metrics.total_employees}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Akun Login</span>
                        <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                            <Shield size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 mt-2">{metrics.total_with_account}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Payroll Aktif</span>
                        <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                            <Wallet size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 mt-2">{metrics.total_with_payroll}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Ada Kasbon</span>
                        <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                            <CreditCard size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 mt-2">{metrics.total_with_loans}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Hadir Hari Ini</span>
                        <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                            <UserCheck size={16} />
                        </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 mt-2">{metrics.total_present_today}</p>
                </div>

                <div
                    onClick={() => setSyncFilter(syncFilter === 'unsynced' ? 'all' : 'unsynced')}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                        metrics.total_unsynced > 0
                            ? 'bg-rose-50/50 border-rose-200 hover:bg-rose-50'
                            : 'bg-white border-slate-200/80'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Perlu Sinkron</span>
                        <div className={`p-2 rounded-xl ${metrics.total_unsynced > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                            <AlertCircle size={16} />
                        </div>
                    </div>
                    <p className={`text-2xl font-bold mt-2 ${metrics.total_unsynced > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                        {metrics.total_unsynced}
                    </p>
                </div>
            </div>

            {/* Filter toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari nama, telepon, email..."
                        className="w-full pl-10 pr-4 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                    />
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                    <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-indigo-500"
                    >
                        <option value="all">Semua Role</option>
                        <option value="teknisi">Teknisi</option>
                        <option value="admin">Admin</option>
                        <option value="finance">Finance</option>
                        <option value="superadmin">Super Admin</option>
                    </select>

                    <select
                        value={syncFilter}
                        onChange={(e) => setSyncFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-indigo-500"
                    >
                        <option value="all">Semua Status</option>
                        <option value="synced">Tersinkron Penuh</option>
                        <option value="unsynced">Perlu Sinkronisasi</option>
                        <option value="has_loans">Memiliki Kasbon</option>
                        <option value="has_account">Memiliki Akun</option>
                        <option value="has_payroll">Memiliki Payroll</option>
                    </select>
                </div>
            </div>

            {/* Main Table Content */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="py-20 flex justify-center items-center">
                        <LoadingSpinner message="Memuat master pegawai..." />
                    </div>
                ) : employees.length === 0 ? (
                    <div className="py-16 text-center text-slate-500">
                        <Users size={40} className="mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-700">Belum ada data pegawai.</p>
                        <p className="text-xs text-slate-400 mt-1">Coba sesuaikan filter pencarian atau tambahkan pegawai baru.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3.5">Pegawai</th>
                                    <th className="px-4 py-3.5">Akun Login</th>
                                    <th className="px-4 py-3.5">Payroll / Gaji</th>
                                    <th className="px-4 py-3.5">Kasbon / Pinjaman</th>
                                    <th className="px-4 py-3.5">Absensi Hari Ini</th>
                                    <th className="px-4 py-3.5">Sinkronisasi</th>
                                    <th className="px-4 py-3.5 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {employees.map((emp) => {
                                    const roleBadge = emp.role ? (ROLE_BADGES[emp.role] || { label: emp.role, bg: 'bg-slate-100 text-slate-700' }) : null;
                                    const waNumber = normalizeWaPhone(emp.phone);
                                    const hasLoan = (emp.borrower?.total_outstanding || 0) > 0;

                                    return (
                                        <tr key={emp.id} className="hover:bg-slate-50/70 transition">
                                            {/* Identitas */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-sm shrink-0">
                                                        {emp.nama.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                                                            <span>{emp.nama}</span>
                                                            {!emp.is_active && (
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-normal">
                                                                    Nonaktif
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                                            {emp.phone && emp.phone !== '-' ? (
                                                                <a
                                                                    href={`https://wa.me/${waNumber}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
                                                                >
                                                                    <Phone size={11} />
                                                                    <span>{emp.phone}</span>
                                                                </a>
                                                            ) : (
                                                                <span className="text-slate-400 italic">No WA -</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Akun Login */}
                                            <td className="px-4 py-3.5">
                                                {emp.user_id ? (
                                                    <div>
                                                        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-lg border ${roleBadge?.bg || 'bg-slate-100'}`}>
                                                            {roleBadge?.label || emp.role}
                                                        </span>
                                                        <p className="text-xs text-slate-500 mt-1 truncate max-w-[150px]">{emp.email}</p>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                                        Belum ada akun
                                                    </span>
                                                )}
                                            </td>

                                            {/* Payroll & Gaji */}
                                            <td className="px-4 py-3.5">
                                                {emp.payroll ? (
                                                    <div>
                                                        <p className="font-semibold text-slate-800">
                                                            {formatRupiah(emp.payroll.total_gaji_bulanan || emp.payroll.gaji_pokok)}
                                                        </p>
                                                        <p className="text-xs text-slate-500 capitalize">
                                                            Tipe: {emp.payroll.tipe_gaji} {emp.payroll.tanggal_gajian ? `(Tgl ${emp.payroll.tanggal_gajian})` : ''}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                                        Belum ada payroll
                                                    </span>
                                                )}
                                            </td>

                                            {/* Kasbon / Pinjaman */}
                                            <td className="px-4 py-3.5">
                                                {hasLoan ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                        <AlertTriangle size={12} />
                                                        <span>{formatRupiah(emp.borrower.total_outstanding)}</span>
                                                    </span>
                                                ) : emp.borrower_id ? (
                                                    <span className="text-xs text-slate-500 font-medium">Lunas / Rp 0</span>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Belum terhubung</span>
                                                )}
                                            </td>

                                            {/* Absensi Hari Ini */}
                                            <td className="px-4 py-3.5">
                                                {emp.attendance_today ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <div className={`w-2 h-2 rounded-full ${emp.attendance_today.clock_in_status === 'late' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                        <div>
                                                            <span className="text-xs font-semibold text-slate-700">
                                                                Masuk {emp.attendance_today.clock_in_at || '-'}
                                                            </span>
                                                            {emp.attendance_today.clock_in_status === 'late' && (
                                                                <p className="text-[10px] text-amber-600 font-medium">
                                                                    Telat {emp.attendance_today.clock_in_late_minutes} mnt
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Belum absen</span>
                                                )}
                                            </td>

                                            {/* Status Sinkronisasi */}
                                            <td className="px-4 py-3.5">
                                                {emp.sync_status === 'synced' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <CheckCircle2 size={12} />
                                                        <span>Tersinkron</span>
                                                    </span>
                                                ) : (
                                                    <span
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 cursor-help"
                                                        title={emp.sync_issues?.join(', ') || 'Perlu sinkronisasi'}
                                                    >
                                                        <AlertCircle size={12} />
                                                        <span>Perlu Sinkron</span>
                                                    </span>
                                                )}
                                            </td>

                                            {/* Aksi */}
                                            <td className="px-4 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDetail(emp)}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                                                        title="Lihat Detail 360°"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEdit(emp)}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                                                        title="Edit Identitas & Pengaturan"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenLink(emp)}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition"
                                                        title="Hubungkan Akun / Payroll / Peminjam"
                                                    >
                                                        <Link2 size={16} />
                                                    </button>
                                                    {emp.phone && emp.phone !== '-' && (
                                                        <a
                                                            href={`https://wa.me/${waNumber}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition"
                                                            title="Kirim WhatsApp"
                                                        >
                                                            <MessageCircle size={16} />
                                                        </a>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteConfirm(emp)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                                        title="Hapus / Nonaktifkan"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal Tambah Pegawai */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-[fadeIn_.2s_ease-out]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Tambah Pegawai Baru</h3>
                                <p className="text-xs text-slate-500">Otomatis sinkronkan identitas ke Akun Login, Payroll, dan Peminjam</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCreateModal(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                            {formError && (
                                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                                    <AlertCircle size={16} className="shrink-0" />
                                    <span>{formError}</span>
                                </div>
                            )}

                            {/* Section 1: Identitas Dasar */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                    <Users size={14} /> 1. Identitas Pokok Pegawai
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Nama Lengkap <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Contoh: Budi Santoso"
                                            className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Nomor Telepon / WhatsApp
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            placeholder="08123456789"
                                            className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Akun Login */}
                            <div className="space-y-4 pt-3 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                        <Shield size={14} /> 2. Akun Login Sistem
                                    </h4>
                                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={formData.create_account}
                                            onChange={(e) => setFormData({ ...formData, create_account: e.target.checked })}
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span>Buat Akun Login Sekarang</span>
                                    </label>
                                </div>

                                {formData.create_account && (
                                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 animate-[fadeIn_.15s_ease-out]">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                    Email Login <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    type="email"
                                                    required={formData.create_account}
                                                    value={formData.email}
                                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                    placeholder="pegawai@domain.com"
                                                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                    Password <span className="text-rose-500">*</span>
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        required={formData.create_account}
                                                        value={formData.password}
                                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                        placeholder="Minimal 6 karakter"
                                                        className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white pr-10 focus:outline-none focus:border-indigo-500"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                    >
                                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Role Hak Akses <span className="text-rose-500">*</span>
                                            </label>
                                            <select
                                                value={formData.role}
                                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="teknisi">Teknisi (Akses lapangan & monitoring)</option>
                                                <option value="admin">Administrator (Akses penuh operasional)</option>
                                                <option value="finance">Finance (Akses modul keuangan & payroll)</option>
                                                <option value="superadmin">Super Admin</option>
                                            </select>
                                        </div>

                                        <div className="pt-2">
                                            <p className="text-xs font-semibold text-slate-700 mb-2">Hak Otoritas Keuangan Tambahan:</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                                                <label className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.can_confirm_payments}
                                                        onChange={(e) => setFormData({ ...formData, can_confirm_payments: e.target.checked })}
                                                        className="rounded text-indigo-600"
                                                    />
                                                    <span>Konfirmasi Pembayaran</span>
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.can_edit_mutations}
                                                        onChange={(e) => setFormData({ ...formData, can_edit_mutations: e.target.checked })}
                                                        className="rounded text-indigo-600"
                                                    />
                                                    <span>Edit Mutasi Bank</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Section 3: Payroll Gaji */}
                            <div className="space-y-4 pt-3 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                        <Wallet size={14} /> 3. Data Payroll & Gaji
                                    </h4>
                                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={formData.create_payroll}
                                            onChange={(e) => setFormData({ ...formData, create_payroll: e.target.checked })}
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span>Daftarkan ke Payroll</span>
                                    </label>
                                </div>

                                {formData.create_payroll && (
                                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 animate-[fadeIn_.15s_ease-out]">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Gaji</label>
                                                <select
                                                    value={formData.tipe_gaji}
                                                    onChange={(e) => setFormData({ ...formData, tipe_gaji: e.target.value })}
                                                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                                >
                                                    <option value="bulanan">Bulanan</option>
                                                    <option value="proyek">Proyek</option>
                                                    <option value="campuran">Campuran</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Gaji Pokok (Rp)</label>
                                                <input
                                                    type="number"
                                                    value={formData.gaji_pokok}
                                                    onChange={(e) => setFormData({ ...formData, gaji_pokok: e.target.value })}
                                                    placeholder="0"
                                                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Tunjangan (Rp)</label>
                                                <input
                                                    type="number"
                                                    value={formData.tunjangan}
                                                    onChange={(e) => setFormData({ ...formData, tunjangan: e.target.value })}
                                                    placeholder="0"
                                                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Gajian (1-31)</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="31"
                                                    value={formData.tanggal_gajian}
                                                    onChange={(e) => setFormData({ ...formData, tanggal_gajian: e.target.value })}
                                                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Bank</label>
                                                <input
                                                    type="text"
                                                    value={formData.nama_bank}
                                                    onChange={(e) => setFormData({ ...formData, nama_bank: e.target.value })}
                                                    placeholder="BCA / Mandiri / BRI"
                                                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Rekening</label>
                                                <input
                                                    type="text"
                                                    value={formData.nomor_rekening}
                                                    onChange={(e) => setFormData({ ...formData, nomor_rekening: e.target.value })}
                                                    placeholder="1234567890"
                                                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Section 4: Kasbon / Peminjam */}
                            <div className="space-y-4 pt-3 border-t border-slate-100">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                        <CreditCard size={14} /> 4. Profil Kasbon / Peminjam
                                    </h4>
                                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={formData.create_borrower}
                                            onChange={(e) => setFormData({ ...formData, create_borrower: e.target.checked })}
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span>Siapkan Profil Peminjam</span>
                                    </label>
                                </div>
                                {formData.create_borrower && (
                                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 animate-[fadeIn_.15s_ease-out]">
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                                        <input
                                            type="text"
                                            value={formData.borrower_notes}
                                            onChange={(e) => setFormData({ ...formData, borrower_notes: e.target.value })}
                                            placeholder="Contoh: Teknisi shift malam / area barat"
                                            className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-md shadow-indigo-600/20 disabled:opacity-50"
                                >
                                    {submitting ? 'Menyimpan...' : 'Simpan & Sinkronkan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Edit Pegawai */}
            {showEditModal && selectedEmployee && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-[fadeIn_.2s_ease-out]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Edit Pegawai: {selectedEmployee.nama}</h3>
                                <p className="text-xs text-slate-500">Perubahan nama & telepon akan otomatis diperbarui di seluruh modul</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowEditModal(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleEditSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                            {formError && (
                                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                                    <AlertCircle size={16} className="shrink-0" />
                                    <span>{formError}</span>
                                </div>
                            )}

                            {/* Section 1: Identitas Pokok */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                    <Users size={14} /> Identitas Bersama
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Nama Lengkap <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                            Nomor Telepon / WhatsApp
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            placeholder="08123456789"
                                            className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Pengaturan Akun */}
                            <div className="space-y-4 pt-3 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                    <Shield size={14} /> Pengaturan Akun Login
                                </h4>
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Login</label>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                placeholder="email@example.com"
                                                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Ganti Password (Kosongkan jika tidak diubah)
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={formData.password}
                                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                    placeholder="Minimal 6 karakter"
                                                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 mb-1">Role Akun</label>
                                        <select
                                            value={formData.role}
                                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                            className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                        >
                                            <option value="teknisi">Teknisi</option>
                                            <option value="admin">Administrator</option>
                                            <option value="finance">Finance</option>
                                            <option value="superadmin">Super Admin</option>
                                        </select>
                                    </div>

                                    <div className="pt-2">
                                        <p className="text-xs font-semibold text-slate-700 mb-2">Hak Otoritas Keuangan:</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.can_confirm_payments}
                                                    onChange={(e) => setFormData({ ...formData, can_confirm_payments: e.target.checked })}
                                                    className="rounded text-indigo-600"
                                                />
                                                <span>Konfirmasi Pembayaran</span>
                                            </label>
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.can_edit_mutations}
                                                    onChange={(e) => setFormData({ ...formData, can_edit_mutations: e.target.checked })}
                                                    className="rounded text-indigo-600"
                                                />
                                                <span>Edit Mutasi Bank</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Payroll & Gaji */}
                            <div className="space-y-4 pt-3 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                    <Wallet size={14} /> Pengaturan Payroll & Gaji
                                </h4>
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Gaji</label>
                                            <select
                                                value={formData.tipe_gaji}
                                                onChange={(e) => setFormData({ ...formData, tipe_gaji: e.target.value })}
                                                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                            >
                                                <option value="bulanan">Bulanan</option>
                                                <option value="proyek">Proyek</option>
                                                <option value="campuran">Campuran</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Gaji Pokok (Rp)</label>
                                            <input
                                                type="number"
                                                value={formData.gaji_pokok}
                                                onChange={(e) => setFormData({ ...formData, gaji_pokok: e.target.value })}
                                                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Tunjangan (Rp)</label>
                                            <input
                                                type="number"
                                                value={formData.tunjangan}
                                                onChange={(e) => setFormData({ ...formData, tunjangan: e.target.value })}
                                                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Gajian</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="31"
                                                value={formData.tanggal_gajian}
                                                onChange={(e) => setFormData({ ...formData, tanggal_gajian: e.target.value })}
                                                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Bank</label>
                                            <input
                                                type="text"
                                                value={formData.nama_bank}
                                                onChange={(e) => setFormData({ ...formData, nama_bank: e.target.value })}
                                                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Rekening</label>
                                            <input
                                                type="text"
                                                value={formData.nomor_rekening}
                                                onChange={(e) => setFormData({ ...formData, nomor_rekening: e.target.value })}
                                                className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_active}
                                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                                className="rounded text-indigo-600"
                                            />
                                            <span>Status Pegawai Aktif</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-md shadow-indigo-600/20 disabled:opacity-50"
                                >
                                    {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Detail Pegawai 360° */}
            {showDetailModal && selectedEmployee && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-[fadeIn_.2s_ease-out]">
                        {/* Drawer Header */}
                        <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-2xl font-bold text-indigo-300">
                                    {selectedEmployee.nama.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <span>{selectedEmployee.nama}</span>
                                        {selectedEmployee.role && (
                                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 font-semibold uppercase tracking-wider">
                                                {selectedEmployee.role}
                                            </span>
                                        )}
                                    </h3>
                                    <div className="flex items-center gap-3 text-xs text-slate-300 mt-1">
                                        <span>Telp: {selectedEmployee.phone}</span>
                                        <span>•</span>
                                        <span>Email: {selectedEmployee.email || 'Tanpa Akun'}</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDetailModal(false)}
                                className="self-start sm:self-auto p-2 rounded-xl bg-white/10 text-slate-300 hover:text-white hover:bg-white/20 transition"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex border-b border-slate-200 bg-slate-50 px-6 gap-2 overflow-x-auto">
                            <button
                                type="button"
                                onClick={() => setActiveDetailTab('profile')}
                                className={`py-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                                    activeDetailTab === 'profile'
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Users size={16} />
                                <span>Profil & Akun</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveDetailTab('payroll')}
                                className={`py-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                                    activeDetailTab === 'payroll'
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Wallet size={16} />
                                <span>Payroll & Honor</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveDetailTab('loans')}
                                className={`py-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                                    activeDetailTab === 'loans'
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <CreditCard size={16} />
                                <span>Kasbon & Pinjaman</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveDetailTab('attendance')}
                                className={`py-3 px-4 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                                    activeDetailTab === 'attendance'
                                        ? 'border-indigo-600 text-indigo-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Clock size={16} />
                                <span>Rekap Absensi</span>
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="p-6 max-h-[65vh] overflow-y-auto">
                            {detailLoading ? (
                                <div className="py-12 flex justify-center">
                                    <LoadingSpinner message="Memuat detail komprehensif..." />
                                </div>
                            ) : (
                                <>
                                    {/* Tab 1: Profil & Akun */}
                                    {activeDetailTab === 'profile' && (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Akun Login</span>
                                                    <p className="text-sm font-bold text-slate-800 mt-1">{detailData?.user?.email || 'Belum dibuat'}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">Role: {detailData?.user?.role || '-'}</p>
                                                </div>
                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Status Kepegawaian</span>
                                                    <p className="text-sm font-bold text-emerald-600 mt-1">
                                                        {selectedEmployee.is_active ? 'Karyawan Aktif' : 'Nonaktif'}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {selectedEmployee.is_employee ? 'Terdaftar Sebagai Karyawan Internal' : 'Mitra Eksternal'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="p-4 rounded-xl border border-slate-200">
                                                <h5 className="font-semibold text-sm text-slate-800 mb-3">Hak Akses & Otoritas Sistem:</h5>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        {detailData?.user?.can_confirm_payments ? (
                                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                                        ) : (
                                                            <X size={16} className="text-slate-300" />
                                                        )}
                                                        <span className={detailData?.user?.can_confirm_payments ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                                                            Otoritas Konfirmasi Pembayaran
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {detailData?.user?.can_edit_mutations ? (
                                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                                        ) : (
                                                            <X size={16} className="text-slate-300" />
                                                        )}
                                                        <span className={detailData?.user?.can_edit_mutations ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                                                            Otoritas Edit Mutasi
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {detailData?.user?.can_choose_payment_mutation ? (
                                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                                        ) : (
                                                            <X size={16} className="text-slate-300" />
                                                        )}
                                                        <span className={detailData?.user?.can_choose_payment_mutation ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                                                            Pilih Mutasi Pembayaran
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {detailData?.user?.can_choose_payment_receiver ? (
                                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                                        ) : (
                                                            <X size={16} className="text-slate-300" />
                                                        )}
                                                        <span className={detailData?.user?.can_choose_payment_receiver ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                                                            Pilih Penerima Pembayaran Kas
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 2: Payroll */}
                                    {activeDetailTab === 'payroll' && (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Gaji Pokok & Tunjangan</span>
                                                    <p className="text-lg font-bold text-slate-800 mt-1">
                                                        {formatRupiah(detailData?.payroll?.total_gaji_bulanan || 0)}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        Pokok: {formatRupiah(detailData?.payroll?.gaji_pokok || 0)} | Tunj: {formatRupiah(detailData?.payroll?.tunjangan || 0)}
                                                    </p>
                                                </div>

                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Rekening Bank</span>
                                                    <p className="text-sm font-bold text-slate-800 mt-1">
                                                        {detailData?.payroll?.nama_bank || '-'} {detailData?.payroll?.nomor_rekening || ''}
                                                    </p>
                                                    <p className="text-xs text-slate-500">Tgl Gajian: Setiap tgl {detailData?.payroll?.tanggal_gajian || '-'}</p>
                                                </div>

                                                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50">
                                                    <span className="text-xs font-semibold text-amber-700 uppercase">Honor Belum Dibayar</span>
                                                    <p className="text-lg font-bold text-amber-800 mt-1">
                                                        {formatRupiah(detailData?.payroll?.unpaid_total || 0)}
                                                    </p>
                                                    <p className="text-xs text-amber-600">Total akumulasi proyek/bagian</p>
                                                </div>
                                            </div>

                                            <div>
                                                <h5 className="font-semibold text-sm text-slate-800 mb-2">Riwayat Pembayaran Payroll:</h5>
                                                {(detailData?.payroll_payments || []).length === 0 ? (
                                                    <p className="text-xs text-slate-400 italic">Belum ada catatan pembayaran gaji/honor.</p>
                                                ) : (
                                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                                                                <tr>
                                                                    <th className="px-3 py-2">Tanggal</th>
                                                                    <th className="px-3 py-2">Nominal</th>
                                                                    <th className="px-3 py-2">Metode / Catatan</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {detailData.payroll_payments.map((p) => (
                                                                    <tr key={p.id}>
                                                                        <td className="px-3 py-2 text-slate-600">{p.tanggal}</td>
                                                                        <td className="px-3 py-2 font-bold text-emerald-600">{formatRupiah(p.nominal)}</td>
                                                                        <td className="px-3 py-2 text-slate-500">{p.metode || p.catatan || '-'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 3: Kasbon & Pinjaman */}
                                    {activeDetailTab === 'loans' && (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Total Pinjaman Diberikan</span>
                                                    <p className="text-lg font-bold text-slate-800 mt-1">
                                                        {formatRupiah((detailData?.borrower?.loans || []).reduce((acc, l) => acc + Number(l.amount || 0), 0))}
                                                    </p>
                                                </div>

                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Total Dilunasi</span>
                                                    <p className="text-lg font-bold text-emerald-600 mt-1">
                                                        {formatRupiah((detailData?.borrower?.loans || []).reduce((acc, l) => acc + Number(l.settled_amount || 0), 0))}
                                                    </p>
                                                </div>

                                                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50">
                                                    <span className="text-xs font-semibold text-amber-700 uppercase">Sisa Saldo Kasbon (Outstanding)</span>
                                                    <p className="text-lg font-bold text-amber-800 mt-1">
                                                        {formatRupiah((detailData?.borrower?.loans || [])
                                                            .filter(l => l.status === 'outstanding' || l.status === 'rejected_by_receiver')
                                                            .reduce((acc, l) => acc + Math.max(0, Number(l.amount || 0) - Number(l.settled_amount || 0)), 0))}
                                                    </p>
                                                </div>
                                            </div>

                                            <div>
                                                <h5 className="font-semibold text-sm text-slate-800 mb-2">Riwayat Kasbon & Pinjaman:</h5>
                                                {(detailData?.borrower?.loans || []).length === 0 ? (
                                                    <p className="text-xs text-slate-400 italic">Tidak ada catatan pinjaman untuk pegawai ini.</p>
                                                ) : (
                                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                                                                <tr>
                                                                    <th className="px-3 py-2">Tanggal</th>
                                                                    <th className="px-3 py-2">Nominal Pinjaman</th>
                                                                    <th className="px-3 py-2">Sudah Dibayar</th>
                                                                    <th className="px-3 py-2">Sisa Saldo</th>
                                                                    <th className="px-3 py-2">Status</th>
                                                                    <th className="px-3 py-2">Keterangan</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {detailData.borrower.loans.map((loan) => {
                                                                    const sisa = Math.max(0, Number(loan.amount) - Number(loan.settled_amount));
                                                                    return (
                                                                        <tr key={loan.id}>
                                                                            <td className="px-3 py-2 text-slate-600">
                                                                                {new Date(loan.occurred_at || loan.created_at).toLocaleDateString('id-ID')}
                                                                            </td>
                                                                            <td className="px-3 py-2 font-bold text-slate-800">{formatRupiah(loan.amount)}</td>
                                                                            <td className="px-3 py-2 text-emerald-600">{formatRupiah(loan.settled_amount)}</td>
                                                                            <td className="px-3 py-2 font-semibold text-amber-700">{formatRupiah(sisa)}</td>
                                                                            <td className="px-3 py-2">
                                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                                    loan.status === 'settled'
                                                                                        ? 'bg-emerald-100 text-emerald-800'
                                                                                        : 'bg-amber-100 text-amber-800'
                                                                                }`}>
                                                                                    {loan.status}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-3 py-2 text-slate-500">{loan.notes || '-'}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 4: Absensi */}
                                    {activeDetailTab === 'attendance' && (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Hadir Bulan Ini</span>
                                                    <p className="text-xl font-bold text-slate-800 mt-1">
                                                        {selectedEmployee.attendance_month?.present_days || 0} Hari
                                                    </p>
                                                </div>

                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Keterlambatan</span>
                                                    <p className="text-xl font-bold text-amber-600 mt-1">
                                                        {selectedEmployee.attendance_month?.late_days || 0} Kali
                                                    </p>
                                                </div>

                                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                                                    <span className="text-xs font-semibold text-slate-500 uppercase">Total Jam Kerja</span>
                                                    <p className="text-xl font-bold text-indigo-600 mt-1">
                                                        {Math.round((selectedEmployee.attendance_month?.total_work_minutes || 0) / 60)} Jam
                                                    </p>
                                                </div>
                                            </div>

                                            <div>
                                                <h5 className="font-semibold text-sm text-slate-800 mb-2">Riwayat Log Kehadiran 30 Hari Terakhir:</h5>
                                                {(detailData?.attendances || []).length === 0 ? (
                                                    <p className="text-xs text-slate-400 italic">Belum ada catatan absensi.</p>
                                                ) : (
                                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                                                                <tr>
                                                                    <th className="px-3 py-2">Tanggal</th>
                                                                    <th className="px-3 py-2">Masuk</th>
                                                                    <th className="px-3 py-2">Status Masuk</th>
                                                                    <th className="px-3 py-2">Keluar</th>
                                                                    <th className="px-3 py-2">Durasi Kerja</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {detailData.attendances.map((att) => (
                                                                    <tr key={att.id}>
                                                                        <td className="px-3 py-2 font-medium text-slate-800">{att.date}</td>
                                                                        <td className="px-3 py-2 text-slate-600">{att.clock_in_at ? att.clock_in_at.slice(11, 16) : '-'}</td>
                                                                        <td className="px-3 py-2">
                                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                                att.clock_in_status === 'late'
                                                                                    ? 'bg-amber-100 text-amber-800'
                                                                                    : 'bg-emerald-100 text-emerald-800'
                                                                            }`}>
                                                                                {att.clock_in_status === 'late' ? `Telat ${att.clock_in_late_minutes}m` : 'Tepat Waktu'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-3 py-2 text-slate-600">{att.clock_out_at ? att.clock_out_at.slice(11, 16) : '-'}</td>
                                                                        <td className="px-3 py-2 text-slate-500">{att.work_duration_formatted || '-'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {selectedEmployee.phone && selectedEmployee.phone !== '-' && (
                                    <a
                                        href={`https://wa.me/${normalizeWaPhone(selectedEmployee.phone)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                                    >
                                        <MessageCircle size={14} />
                                        <span>Chat WhatsApp</span>
                                    </a>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowDetailModal(false)}
                                className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 transition"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Hubungkan (Link) */}
            {showLinkModal && selectedEmployee && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-[fadeIn_.2s_ease-out]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
                            <div>
                                <h3 className="font-bold text-slate-800 text-base">Hubungkan Relasi Pegawai</h3>
                                <p className="text-xs text-slate-500">Pasangkan akun user dengan data payroll dan peminjam</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowLinkModal(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleLinkSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Pilih Akun User Login <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    required
                                    value={linkData.user_id}
                                    onChange={(e) => setLinkData({ ...linkData, user_id: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                >
                                    <option value="">-- Pilih Akun User --</option>
                                    {employees.filter(e => e.user_id).map(e => (
                                        <option key={e.user_id} value={e.user_id}>
                                            {e.nama} ({e.email})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Hubungkan ke Payroll Member
                                </label>
                                <select
                                    value={linkData.payroll_member_id}
                                    onChange={(e) => setLinkData({ ...linkData, payroll_member_id: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                >
                                    <option value="">-- Tidak ada / Tetap --</option>
                                    {employees.filter(e => e.payroll_member_id).map(e => (
                                        <option key={e.payroll_member_id} value={e.payroll_member_id}>
                                            {e.payroll?.nama || e.nama} ({e.payroll?.nama_bank || 'Tanpa Bank'})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Hubungkan ke Profil Peminjam
                                </label>
                                <select
                                    value={linkData.borrower_id}
                                    onChange={(e) => setLinkData({ ...linkData, borrower_id: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white"
                                >
                                    <option value="">-- Tidak ada / Tetap --</option>
                                    {employees.filter(e => e.borrower_id).map(e => (
                                        <option key={e.borrower_id} value={e.borrower_id}>
                                            {e.borrower?.name || e.nama}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 pt-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={linkData.sync_attributes}
                                    onChange={(e) => setLinkData({ ...linkData, sync_attributes: e.target.checked })}
                                    className="rounded text-indigo-600"
                                />
                                <span>Sinkronkan nomor telepon dan nama secara otomatis</span>
                            </label>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setShowLinkModal(false)}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition"
                                >
                                    {submitting ? 'Menghubungkan...' : 'Hubungkan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Konfirmasi Hapus / Nonaktifkan */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 animate-[fadeIn_.2s_ease-out]">
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="font-bold text-slate-800 text-lg">Hapus / Nonaktifkan Pegawai?</h3>
                        <p className="text-sm text-slate-600 mt-2">
                            Apakah Anda yakin ingin menonaktifkan data untuk <strong>{deleteConfirm.nama}</strong>?
                        </p>
                        <p className="text-xs text-slate-500 mt-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <strong>Catatan Keamanan:</strong> Jika pegawai memiliki catatan pinjaman aktif atau proyek historis, data akan dinonaktifkan secara aman untuk melindungi integritas pembukuan keuangan.
                        </p>
                        <div className="flex items-center justify-end gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDelete(deleteConfirm)}
                                className="px-4 py-2 rounded-xl text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition shadow-md shadow-rose-600/20"
                            >
                                Ya, Lanjutkan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
