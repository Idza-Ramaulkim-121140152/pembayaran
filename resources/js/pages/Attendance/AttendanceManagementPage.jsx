import React, { useState, useEffect, useCallback } from 'react';
import {
    Calendar,
    Clock,
    Settings,
    Users,
    CheckCircle2,
    AlertTriangle,
    Search,
    Filter,
    Download,
    Plus,
    Edit3,
    Trash2,
    RefreshCw,
    X,
    Eye,
    Smile,
    Shield,
    Sparkles,
    TrendingUp,
} from 'lucide-react';
import apiClient from '../../services/api';

export default function AttendanceManagementPage() {
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [records, setRecords] = useState([]);
    const [summary, setSummary] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [currentPeriod, setCurrentPeriod] = useState(null);
    const [pagination, setPagination] = useState({ currentPage: 1, lastPage: 1, total: 0 });

    // Settings state
    const [settingsForm, setSettingsForm] = useState({
        work_start_time: '08:00',
        work_end_time: '17:00',
        monthly_reset_day: 25,
        late_tolerance_minutes: 0,
    });

    // Filters state
    const [filters, setFilters] = useState({
        period_type: 'current', // 'current', 'last_month', 'custom'
        start_date: '',
        end_date: '',
        user_id: '',
        status: 'all',
        search: '',
        page: 1,
    });

    // Modals state
    const [photoPreview, setPhotoPreview] = useState(null); // { url, title, user, time }
    const [editModal, setEditModal] = useState({ isOpen: false, data: null });
    const [manualModal, setManualModal] = useState({ isOpen: false });
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, id: null, userName: '', date: '' });
    const [toast, setToast] = useState(null);

    const showToast = (type, message) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 5000);
    };

    // Fetch records & settings
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                period_type: filters.period_type,
                user_id: filters.user_id || undefined,
                status: filters.status !== 'all' ? filters.status : undefined,
                search: filters.search.trim() || undefined,
                page: filters.page,
            };

            if (filters.period_type === 'custom') {
                params.start_date = filters.start_date;
                params.end_date = filters.end_date;
            }

            const res = await apiClient.get('/attendance/records', { params });
            if (res.data?.success) {
                const payload = res.data.data;
                setRecords(payload.records?.data || []);
                setPagination({
                    currentPage: payload.records?.current_page || 1,
                    lastPage: payload.records?.last_page || 1,
                    total: payload.records?.total || 0,
                });
                setSummary(payload.summary);
                setEmployees(payload.employees || []);
                setCurrentPeriod(payload.current_period);
                if (payload.settings) {
                    setSettingsForm({
                        work_start_time: payload.settings.work_start_time || '08:00',
                        work_end_time: payload.settings.work_end_time || '17:00',
                        monthly_reset_day: Number(payload.settings.monthly_reset_day || 25),
                        late_tolerance_minutes: Number(payload.settings.late_tolerance_minutes || 0),
                    });
                }
            }
        } catch (err) {
            console.error('Failed to fetch attendance records:', err);
            showToast('error', 'Gagal memuat data absensi karyawan.');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Save global settings
    const handleSaveSettings = async (e) => {
        e.preventDefault();
        try {
            setSavingSettings(true);
            const res = await apiClient.post('/attendance/settings', settingsForm);
            if (res.data?.success) {
                showToast('success', res.data.message || 'Pengaturan absensi berhasil disimpan.');
                fetchData();
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Gagal menyimpan pengaturan.';
            showToast('error', msg);
        } finally {
            setSavingSettings(false);
        }
    };

    // Export CSV
    const handleExportCSV = () => {
        const query = new URLSearchParams();
        query.append('period_type', filters.period_type);
        if (filters.period_type === 'custom') {
            if (filters.start_date) query.append('start_date', filters.start_date);
            if (filters.end_date) query.append('end_date', filters.end_date);
        }
        if (filters.user_id) query.append('user_id', filters.user_id);
        if (filters.status && filters.status !== 'all') query.append('status', filters.status);
        if (filters.search) query.append('search', filters.search);

        window.open(`/api/attendance/export?${query.toString()}`, '_blank');
    };

    // Handle delete
    const handleConfirmDelete = async () => {
        if (!deleteModal.id) return;
        try {
            const res = await apiClient.delete(`/attendance/records/${deleteModal.id}`);
            if (res.data?.success) {
                showToast('success', 'Data absensi berhasil dihapus.');
                setDeleteModal({ isOpen: false, id: null, userName: '', date: '' });
                fetchData();
            }
        } catch (err) {
            showToast('error', 'Gagal menghapus data absensi.');
        }
    };

    // Handle edit submit
    const handleSaveEdit = async (updatedData) => {
        try {
            const res = await apiClient.put(`/attendance/records/${editModal.data.id}`, updatedData);
            if (res.data?.success) {
                showToast('success', 'Data absensi berhasil diperbarui.');
                setEditModal({ isOpen: false, data: null });
                fetchData();
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Gagal memperbarui data absensi.';
            showToast('error', msg);
        }
    };

    // Handle manual add submit
    const handleSaveManual = async (manualData) => {
        try {
            const res = await apiClient.post('/attendance/records', manualData);
            if (res.data?.success) {
                showToast('success', 'Data absensi manual berhasil ditambahkan.');
                setManualModal({ isOpen: false });
                fetchData();
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.response?.data?.errors?.date?.[0] || 'Gagal menambahkan absensi manual.';
            showToast('error', msg);
        }
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Toast Alert */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-xl transition-all ${
                    toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}>
                    {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                    <span>{toast.message}</span>
                    <button type="button" onClick={() => setToast(null)} className="ml-3 text-white/80 hover:text-white">✕</button>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-500">
                        <Shield size={14} />
                        Superadmin Panel
                    </div>
                    <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
                        Manajemen Presensi Karyawan
                    </h1>
                    <p className="mt-1 text-xs text-slate-500">
                        Konfigurasi jam kerja, tanggal reset bulanan global, serta pengawasan dan edit/hapus data kehadiran.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                        <Download size={14} />
                        Export CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => setManualModal({ isOpen: true })}
                        className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600"
                    >
                        <Plus size={15} />
                        Tambah Absen Manual
                    </button>
                    <button
                        type="button"
                        onClick={fetchData}
                        disabled={loading}
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:text-slate-800 disabled:opacity-50"
                        title="Segarkan data"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin text-orange-500' : ''} />
                    </button>
                </div>
            </div>

            {/* Panel 1: Pengaturan Jam Kerja & Reset Global */}
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-6">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                        <Settings size={18} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">Pengaturan Jam Kerja & Siklus Reset Global</h2>
                        <p className="text-xs text-slate-500">Berlaku untuk seluruh karyawan di sistem.</p>
                    </div>
                </div>

                <form onSubmit={handleSaveSettings} className="mt-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {/* Jam Masuk */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Jam Masuk</label>
                            <div className="relative mt-1.5">
                                <input
                                    type="time"
                                    required
                                    value={settingsForm.work_start_time}
                                    onChange={(e) => setSettingsForm({ ...settingsForm, work_start_time: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                                />
                            </div>
                            <span className="text-[11px] text-slate-400 mt-1 block">Wajib (lewat = terlambat)</span>
                        </div>

                        {/* Jam Pulang */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Jam Pulang Standar</label>
                            <div className="relative mt-1.5">
                                <input
                                    type="time"
                                    required
                                    value={settingsForm.work_end_time}
                                    onChange={(e) => setSettingsForm({ ...settingsForm, work_end_time: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                                />
                            </div>
                            <span className="text-[11px] text-slate-400 mt-1 block">Opsional bagi karyawan</span>
                        </div>

                        {/* Toleransi Keterlambatan */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Toleransi Terlambat (Menit)</label>
                            <div className="relative mt-1.5">
                                <input
                                    type="number"
                                    min="0"
                                    max="120"
                                    value={settingsForm.late_tolerance_minutes}
                                    onChange={(e) => setSettingsForm({ ...settingsForm, late_tolerance_minutes: Number(e.target.value) })}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                                />
                            </div>
                            <span className="text-[11px] text-slate-400 mt-1 block">Contoh: 0 atau 15 menit</span>
                        </div>

                        {/* Tanggal Reset Bulanan */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Tanggal Reset Bulanan</label>
                            <div className="relative mt-1.5">
                                <select
                                    value={settingsForm.monthly_reset_day}
                                    onChange={(e) => setSettingsForm({ ...settingsForm, monthly_reset_day: Number(e.target.value) })}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                                >
                                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                                        <option key={day} value={day}>
                                            Tanggal {day} {day === 25 ? '(Standar Payroll)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <span className="text-[11px] text-slate-400 mt-1 block">Siklus: Tgl {settingsForm.monthly_reset_day} s/d Tgl {settingsForm.monthly_reset_day - 1 || 28}</span>
                        </div>
                    </div>

                    {/* Explanatory Info Card */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-orange-50/60 p-3.5 text-xs text-orange-950">
                        <div className="flex items-start gap-2">
                            <Sparkles size={16} className="text-orange-500 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold">Periode Siklus Aktif Saat Ini:</span>{' '}
                                <span className="rounded bg-white px-2 py-0.5 font-bold text-orange-800 shadow-sm">
                                    {currentPeriod?.label || '-'}
                                </span>
                                <p className="mt-0.5 text-slate-600">
                                    Perhitungan total kehadiran bulanan dihitung dari tanggal reset ({settingsForm.monthly_reset_day}) sampai dengan satu hari sebelum tanggal reset berikutnya.
                                </p>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={savingSettings}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-xs font-bold text-white shadow transition hover:bg-orange-600 disabled:opacity-50 shrink-0"
                        >
                            {savingSettings ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Simpan Pengaturan
                        </button>
                    </div>
                </form>
            </div>

            {/* Panel 2: Summary KPI Cards */}
            {summary && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Kehadiran</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                <Users size={16} />
                            </span>
                        </div>
                        <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.total_attendances}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Entri presensi tercatat</p>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Tepat Waktu</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                                <CheckCircle2 size={16} />
                            </span>
                        </div>
                        <p className="mt-2 text-2xl font-extrabold text-emerald-700">{summary.total_on_time}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Sebelum jam masuk</p>
                    </div>

                    <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Terlambat</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                                <AlertTriangle size={16} />
                            </span>
                        </div>
                        <p className="mt-2 text-2xl font-extrabold text-amber-700">{summary.total_late}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Melebihi jam masuk</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tingkat Ketepatan</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                                <TrendingUp size={16} />
                            </span>
                        </div>
                        <p className="mt-2 text-2xl font-extrabold text-slate-900">{summary.punctuality_rate}%</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Persentase kepatuhan jam</p>
                    </div>
                </div>
            )}

            {/* Panel 3: Filters & Data Table */}
            <div className="rounded-3xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
                {/* Filter Toolbar */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                        {/* Periode Selector */}
                        <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Filter Periode</label>
                            <select
                                value={filters.period_type}
                                onChange={(e) => setFilters({ ...filters, period_type: e.target.value, page: 1 })}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-orange-400"
                            >
                                <option value="current">Periode Reset Saat Ini</option>
                                <option value="last_month">Periode Reset Bulan Lalu</option>
                                <option value="custom">Rentang Tanggal Khusus</option>
                                <option value="all">Semua Waktu</option>
                            </select>
                        </div>

                        {/* Karyawan Selector */}
                        <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Karyawan</label>
                            <select
                                value={filters.user_id}
                                onChange={(e) => setFilters({ ...filters, user_id: e.target.value, page: 1 })}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-orange-400"
                            >
                                <option value="">Semua Karyawan</option>
                                {employees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.name} ({emp.role})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Status Selector */}
                        <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Status Kehadiran</label>
                            <select
                                value={filters.status}
                                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-orange-400"
                            >
                                <option value="all">Semua Status</option>
                                <option value="on_time">Tepat Waktu</option>
                                <option value="late">Terlambat</option>
                                <option value="present">Hadir</option>
                                <option value="leave">Izin / Cuti</option>
                                <option value="sick">Sakit</option>
                            </select>
                        </div>

                        {/* Search */}
                        <div>
                            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cari Nama / Email</label>
                            <div className="relative mt-1">
                                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                                <input
                                    type="text"
                                    value={filters.search}
                                    onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                                    placeholder="Ketik nama..."
                                    className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-orange-400"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Custom Date Pickers if selected */}
                    {filters.period_type === 'custom' && (
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200/60">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tanggal Mulai</label>
                                <input
                                    type="date"
                                    value={filters.start_date}
                                    onChange={(e) => setFilters({ ...filters, start_date: e.target.value, page: 1 })}
                                    className="mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tanggal Selesai</label>
                                <input
                                    type="date"
                                    value={filters.end_date}
                                    onChange={(e) => setFilters({ ...filters, end_date: e.target.value, page: 1 })}
                                    className="mt-0.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Table Data */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-4 py-3">Tanggal</th>
                                <th className="px-4 py-3">Karyawan</th>
                                <th className="px-4 py-3 text-center">Foto Masuk</th>
                                <th className="px-4 py-3">Jam Masuk</th>
                                <th className="px-4 py-3 text-center">Foto Pulang</th>
                                <th className="px-4 py-3">Jam Pulang</th>
                                <th className="px-4 py-3">Durasi</th>
                                <th className="px-4 py-3">Catatan</th>
                                <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {records.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                                        Tidak ada data absensi yang sesuai filter.
                                    </td>
                                </tr>
                            ) : (
                                records.map((row) => (
                                    <tr key={row.id} className="transition hover:bg-orange-50/40">
                                        {/* Tanggal */}
                                        <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                                            {row.date ? new Date(row.date).toLocaleDateString('id-ID', {
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            }) : '-'}
                                        </td>

                                        {/* Karyawan */}
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-slate-900">{row.user?.name || `User #${row.user_id}`}</p>
                                            <p className="text-[11px] text-slate-400">{row.user?.email || '-'}</p>
                                            <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 uppercase mt-0.5">
                                                {row.user?.role || 'karyawan'}
                                            </span>
                                        </td>

                                        {/* Foto Masuk */}
                                        <td className="px-4 py-3 text-center whitespace-nowrap">
                                            {row.photo_in_url ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setPhotoPreview({
                                                        url: row.photo_in_url,
                                                        title: 'Foto Wajah Absen Masuk',
                                                        user: row.user?.name,
                                                        time: row.clock_in_at ? new Date(row.clock_in_at).toLocaleTimeString('id-ID') : '',
                                                        smileScore: row.smile_score_in,
                                                    })}
                                                    className="group relative inline-block h-10 w-10 overflow-hidden rounded-xl border border-emerald-300 shadow-sm transition hover:scale-105"
                                                >
                                                    <img src={row.photo_in_url} alt="In" className="h-full w-full object-cover" />
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white">
                                                        <Eye size={14} />
                                                    </div>
                                                </button>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">-</span>
                                            )}
                                        </td>

                                        {/* Jam Masuk & Status */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {row.clock_in_at ? (
                                                <div>
                                                    <span className="font-mono font-bold text-slate-900">
                                                        {new Date(row.clock_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                                    </span>
                                                    <div className="mt-1 flex flex-col items-start gap-1">
                                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                            row.clock_in_status === 'late'
                                                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                        }`}>
                                                            {row.clock_in_status === 'late'
                                                                ? `Terlambat ${row.clock_in_late_minutes || 0} mnt`
                                                                : 'Tepat Waktu'}
                                                        </span>
                                                        {row.clock_in_status === 'late' && (row.late_reason || row.clock_in_notes) && (
                                                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 border border-amber-200/80 max-w-[220px] truncate" title={row.late_reason || row.clock_in_notes}>
                                                                Alasan: {row.late_reason || (row.clock_in_notes?.includes('[Alasan Terlambat:') ? row.clock_in_notes.replace(/^\[Alasan Terlambat:\s*([^\]]+)\].*$/, '$1') : '-')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400">Belum masuk</span>
                                            )}
                                        </td>

                                        {/* Foto Pulang */}
                                        <td className="px-4 py-3 text-center whitespace-nowrap">
                                            {row.photo_out_url ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setPhotoPreview({
                                                        url: row.photo_out_url,
                                                        title: 'Foto Wajah Absen Pulang',
                                                        user: row.user?.name,
                                                        time: row.clock_out_at ? new Date(row.clock_out_at).toLocaleTimeString('id-ID') : '',
                                                        smileScore: row.smile_score_out,
                                                    })}
                                                    className="group relative inline-block h-10 w-10 overflow-hidden rounded-xl border border-blue-300 shadow-sm transition hover:scale-105"
                                                >
                                                    <img src={row.photo_out_url} alt="Out" className="h-full w-full object-cover" />
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition text-white">
                                                        <Eye size={14} />
                                                    </div>
                                                </button>
                                            ) : (
                                                <span className="text-[11px] text-slate-400">-</span>
                                            )}
                                        </td>

                                        {/* Jam Pulang */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {row.clock_out_at ? (
                                                <span className="font-mono font-semibold text-slate-900">
                                                    {new Date(row.clock_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 italic">Belum pulang</span>
                                            )}
                                        </td>

                                        {/* Durasi */}
                                        <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                                            {row.work_duration_formatted || '-'}
                                        </td>

                                        {/* Catatan */}
                                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                                            {row.clock_in_notes || row.clock_out_notes || '-'}
                                        </td>

                                        {/* Aksi */}
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditModal({ isOpen: true, data: row })}
                                                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-blue-600 shadow-sm transition"
                                                    title="Edit Absensi"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDeleteModal({
                                                        isOpen: true,
                                                        id: row.id,
                                                        userName: row.user?.name || '',
                                                        date: row.date,
                                                    })}
                                                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-600 shadow-sm transition"
                                                    title="Hapus Absensi"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Toolbar */}
                {pagination.lastPage > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
                        <span>
                            Halaman {pagination.currentPage} dari {pagination.lastPage} ({pagination.total} total data)
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={pagination.currentPage <= 1}
                                onClick={() => setFilters({ ...filters, page: pagination.currentPage - 1 })}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold disabled:opacity-50"
                            >
                                Sebelumnya
                            </button>
                            <button
                                type="button"
                                disabled={pagination.currentPage >= pagination.lastPage}
                                onClick={() => setFilters({ ...filters, page: pagination.currentPage + 1 })}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold disabled:opacity-50"
                            >
                                Berikutnya
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal: Pratinjau Foto Wajah */}
            {photoPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-slate-900 shadow-2xl text-white">
                        <div className="flex items-center justify-between p-4 border-b border-white/10">
                            <div>
                                <h3 className="text-sm font-bold">{photoPreview.title}</h3>
                                <p className="text-xs text-slate-400">{photoPreview.user} • {photoPreview.time} WIB</p>
                            </div>
                            <button type="button" onClick={() => setPhotoPreview(null)} className="text-white/60 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="relative aspect-square w-full bg-black">
                            <img src={photoPreview.url} alt="Preview" className="h-full w-full object-cover" />
                            {photoPreview.smileScore !== null && (
                                <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-slate-950/80 backdrop-blur-md px-3 py-2 text-xs flex items-center justify-between">
                                    <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                        <Smile size={15} />
                                        Senyum Terverifikasi
                                    </span>
                                    <span className="font-mono font-bold text-emerald-400">
                                        {Math.round(photoPreview.smileScore * 100)}%
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Edit Absensi */}
            {editModal.isOpen && editModal.data && (
                <EditAttendanceDialog
                    attendance={editModal.data}
                    onClose={() => setEditModal({ isOpen: false, data: null })}
                    onSave={handleSaveEdit}
                />
            )}

            {/* Modal: Tambah Presensi Manual */}
            {manualModal.isOpen && (
                <ManualAttendanceDialog
                    employees={employees}
                    workStartTime={settingsForm.work_start_time}
                    workEndTime={settingsForm.work_end_time}
                    onClose={() => setManualModal({ isOpen: false })}
                    onSave={handleSaveManual}
                />
            )}

            {/* Modal: Konfirmasi Hapus */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3 text-rose-600">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                                <Trash2 size={20} />
                            </div>
                            <h3 className="text-base font-bold text-slate-900">Hapus Data Absensi?</h3>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Apakah Anda yakin ingin menghapus data absensi karyawan <strong>{deleteModal.userName}</strong> pada tanggal <strong>{deleteModal.date}</strong>? Tindakan ini tidak dapat dibatalkan.
                        </p>
                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeleteModal({ isOpen: false, id: null, userName: '', date: '' })}
                                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 shadow"
                            >
                                Ya, Hapus Data
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper to parse late reason
function parseLateReason(rawReason) {
    if (!rawReason) return { category: '', custom: '' };
    if (['Bangun Kesiangan', 'Dinas Luar', 'Keperluan Pribadi'].includes(rawReason)) {
        return { category: rawReason, custom: '' };
    }
    if (rawReason.startsWith('Lainnya: ')) {
        return { category: 'Lainnya', custom: rawReason.replace(/^Lainnya:\s*/, '') };
    }
    return { category: 'Lainnya', custom: rawReason };
}

// Subcomponent: Dialog Edit Absensi
function EditAttendanceDialog({ attendance, onClose, onSave }) {
    const formatTimeVal = (datetimeStr) => {
        if (!datetimeStr) return '';
        const d = new Date(datetimeStr);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const formatDateVal = (datetimeStr) => {
        if (!datetimeStr) return '';
        const d = new Date(datetimeStr);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const initialLate = parseLateReason(
        attendance.late_reason ||
        (attendance.clock_in_notes?.includes('[Alasan Terlambat:')
            ? attendance.clock_in_notes.replace(/^\[Alasan Terlambat:\s*([^\]]+)\].*$/, '$1')
            : '')
    );
    const [lateReasonCategory, setLateReasonCategory] = useState(initialLate.category);
    const [lateReasonCustom, setLateReasonCustom] = useState(initialLate.custom);

    const [form, setForm] = useState({
        date: formatDateVal(attendance.date),
        clock_in_time: formatTimeVal(attendance.clock_in_at),
        clock_in_status: attendance.clock_in_status || 'on_time',
        clock_in_late_minutes: attendance.clock_in_late_minutes || 0,
        clock_out_time: formatTimeVal(attendance.clock_out_at),
        clock_in_notes: attendance.clock_in_notes || '',
        clock_out_notes: attendance.clock_out_notes || '',
        status: attendance.status || 'present',
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        // Convert times to full ISO date strings
        const datePart = form.date;
        const clockInAt = form.clock_in_time ? `${datePart} ${form.clock_in_time}:00` : null;
        const clockOutAt = form.clock_out_time ? `${datePart} ${form.clock_out_time}:00` : null;

        let finalLateReason = null;
        if (form.clock_in_status === 'late' || form.status === 'late') {
            finalLateReason = lateReasonCategory === 'Lainnya'
                ? (lateReasonCustom.trim() ? `Lainnya: ${lateReasonCustom.trim()}` : 'Lainnya')
                : lateReasonCategory;
        }

        onSave({
            date: form.date,
            clock_in_at: clockInAt,
            clock_in_status: form.clock_in_status,
            clock_in_late_minutes: Number(form.clock_in_late_minutes),
            late_reason: finalLateReason,
            clock_out_at: clockOutAt,
            clock_in_notes: form.clock_in_notes,
            clock_out_notes: form.clock_out_notes,
            status: form.status,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4 shrink-0">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">Edit Presensi: {attendance.user?.name}</h3>
                        <p className="text-xs text-slate-500">ID #{attendance.id}</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
                    <div>
                        <label className="block font-bold text-slate-700">Tanggal</label>
                        <input
                            type="date"
                            required
                            value={form.date}
                            onChange={(e) => setForm({ ...form, date: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold text-slate-700">Jam Masuk</label>
                            <input
                                type="time"
                                value={form.clock_in_time}
                                onChange={(e) => setForm({ ...form, clock_in_time: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block font-bold text-slate-700">Status Masuk</label>
                            <select
                                value={form.clock_in_status}
                                onChange={(e) => setForm({ ...form, clock_in_status: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            >
                                <option value="on_time">Tepat Waktu</option>
                                <option value="late">Terlambat</option>
                            </select>
                        </div>
                    </div>

                    {form.clock_in_status === 'late' && (
                        <div>
                            <label className="block font-bold text-slate-700">Menit Terlambat</label>
                            <input
                                type="number"
                                min="0"
                                value={form.clock_in_late_minutes}
                                onChange={(e) => setForm({ ...form, clock_in_late_minutes: Number(e.target.value) })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            />
                        </div>
                    )}

                    {(form.clock_in_status === 'late' || form.status === 'late') && (
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                            <label className="block font-bold text-amber-900">Alasan Keterlambatan</label>
                            <select
                                value={lateReasonCategory}
                                onChange={(e) => setLateReasonCategory(e.target.value)}
                                className="w-full rounded-xl border border-amber-300 bg-white p-2.5 font-medium"
                            >
                                <option value="">-- Pilih Alasan Keterlambatan --</option>
                                <option value="Bangun Kesiangan">Bangun Kesiangan</option>
                                <option value="Dinas Luar">Dinas Luar</option>
                                <option value="Keperluan Pribadi">Keperluan Pribadi</option>
                                <option value="Lainnya">Lainnya</option>
                            </select>

                            {lateReasonCategory === 'Lainnya' && (
                                <div className="pt-1">
                                    <label className="block text-[11px] font-semibold text-slate-700">Keterangan Tambahan (Lainnya)</label>
                                    <textarea
                                        rows={2}
                                        value={lateReasonCustom}
                                        onChange={(e) => setLateReasonCustom(e.target.value)}
                                        placeholder="Ketik keterangan alasan keterlambatan..."
                                        className="mt-1 w-full rounded-xl border border-amber-300 bg-white p-2.5 font-medium"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold text-slate-700">Jam Pulang (Opsional)</label>
                            <input
                                type="time"
                                value={form.clock_out_time}
                                onChange={(e) => setForm({ ...form, clock_out_time: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block font-bold text-slate-700">Status Absensi</label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            >
                                <option value="present">Hadir</option>
                                <option value="late">Terlambat</option>
                                <option value="leave">Izin / Cuti</option>
                                <option value="sick">Sakit</option>
                                <option value="alpha">Alpha</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block font-bold text-slate-700">Catatan Masuk / Pulang</label>
                        <textarea
                            rows={2}
                            value={form.clock_in_notes}
                            onChange={(e) => setForm({ ...form, clock_in_notes: e.target.value })}
                            placeholder="Keterangan..."
                            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">
                            Batal
                        </button>
                        <button type="submit" className="rounded-xl bg-orange-500 px-5 py-2 font-bold text-white shadow hover:bg-orange-600">
                            Simpan Perubahan
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Subcomponent: Dialog Tambah Absensi Manual
function ManualAttendanceDialog({ employees, workStartTime, workEndTime, onClose, onSave }) {
    const todayStr = new Date().toISOString().split('T')[0];

    const [lateReasonCategory, setLateReasonCategory] = useState('');
    const [lateReasonCustom, setLateReasonCustom] = useState('');

    const [form, setForm] = useState({
        user_id: employees[0]?.id || '',
        date: todayStr,
        clock_in_time: workStartTime,
        clock_out_time: workEndTime,
        clock_in_status: 'on_time',
        clock_in_late_minutes: 0,
        status: 'present',
        clock_in_notes: 'Input manual oleh Superadmin',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.user_id) return;

        const datePart = form.date;
        const clockInAt = form.clock_in_time ? `${datePart} ${form.clock_in_time}:00` : null;
        const clockOutAt = form.clock_out_time ? `${datePart} ${form.clock_out_time}:00` : null;

        let finalLateReason = null;
        if (form.clock_in_status === 'late' || form.status === 'late') {
            finalLateReason = lateReasonCategory === 'Lainnya'
                ? (lateReasonCustom.trim() ? `Lainnya: ${lateReasonCustom.trim()}` : 'Lainnya')
                : lateReasonCategory;
        }

        onSave({
            user_id: Number(form.user_id),
            date: form.date,
            clock_in_at: clockInAt,
            clock_in_status: form.clock_in_status,
            clock_in_late_minutes: Number(form.clock_in_late_minutes),
            late_reason: finalLateReason,
            clock_out_at: clockOutAt,
            status: form.status,
            clock_in_notes: form.clock_in_notes,
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4 shrink-0">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">Tambah Absensi Manual</h3>
                        <p className="text-xs text-slate-500">Gunakan bila karyawan terkendala kamera/gawai.</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
                    <div>
                        <label className="block font-bold text-slate-700">Pilih Karyawan</label>
                        <select
                            required
                            value={form.user_id}
                            onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                        >
                            <option value="">-- Pilih Karyawan --</option>
                            {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.name} ({emp.email} - {emp.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block font-bold text-slate-700">Tanggal Absensi</label>
                        <input
                            type="date"
                            required
                            value={form.date}
                            onChange={(e) => setForm({ ...form, date: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold text-slate-700">Jam Masuk</label>
                            <input
                                type="time"
                                required
                                value={form.clock_in_time}
                                onChange={(e) => setForm({ ...form, clock_in_time: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block font-bold text-slate-700">Status Masuk</label>
                            <select
                                value={form.clock_in_status}
                                onChange={(e) => setForm({ ...form, clock_in_status: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            >
                                <option value="on_time">Tepat Waktu</option>
                                <option value="late">Terlambat</option>
                            </select>
                        </div>
                    </div>

                    {form.clock_in_status === 'late' && (
                        <div>
                            <label className="block font-bold text-slate-700">Menit Terlambat</label>
                            <input
                                type="number"
                                min="0"
                                value={form.clock_in_late_minutes}
                                onChange={(e) => setForm({ ...form, clock_in_late_minutes: Number(e.target.value) })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            />
                        </div>
                    )}

                    {(form.clock_in_status === 'late' || form.status === 'late') && (
                        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                            <label className="block font-bold text-amber-900">Alasan Keterlambatan</label>
                            <select
                                value={lateReasonCategory}
                                onChange={(e) => setLateReasonCategory(e.target.value)}
                                className="w-full rounded-xl border border-amber-300 bg-white p-2.5 font-medium"
                            >
                                <option value="">-- Pilih Alasan Keterlambatan --</option>
                                <option value="Bangun Kesiangan">Bangun Kesiangan</option>
                                <option value="Dinas Luar">Dinas Luar</option>
                                <option value="Keperluan Pribadi">Keperluan Pribadi</option>
                                <option value="Lainnya">Lainnya</option>
                            </select>

                            {lateReasonCategory === 'Lainnya' && (
                                <div className="pt-1">
                                    <label className="block text-[11px] font-semibold text-slate-700">Keterangan Tambahan (Lainnya)</label>
                                    <textarea
                                        rows={2}
                                        value={lateReasonCustom}
                                        onChange={(e) => setLateReasonCustom(e.target.value)}
                                        placeholder="Ketik keterangan alasan keterlambatan..."
                                        className="mt-1 w-full rounded-xl border border-amber-300 bg-white p-2.5 font-medium"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block font-bold text-slate-700">Jam Pulang (Opsional)</label>
                            <input
                                type="time"
                                value={form.clock_out_time}
                                onChange={(e) => setForm({ ...form, clock_out_time: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            />
                        </div>
                        <div>
                            <label className="block font-bold text-slate-700">Status</label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                            >
                                <option value="present">Hadir</option>
                                <option value="late">Terlambat</option>
                                <option value="leave">Izin / Cuti</option>
                                <option value="sick">Sakit</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block font-bold text-slate-700">Catatan</label>
                        <textarea
                            rows={2}
                            value={form.clock_in_notes}
                            onChange={(e) => setForm({ ...form, clock_in_notes: e.target.value })}
                            className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100">
                            Batal
                        </button>
                        <button type="submit" className="rounded-xl bg-orange-500 px-5 py-2 font-bold text-white shadow hover:bg-orange-600">
                            Simpan Absensi
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
