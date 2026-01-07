import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, Wrench, Plus, Edit2, Trash2, X, Check,
    Calendar, MapPin, Clock, AlertCircle, Info, ChevronDown,
    ToggleLeft, ToggleRight, Search, Filter, RefreshCw
} from 'lucide-react';

function NetworkNoticePage() {
    const navigate = useNavigate();
    const [notices, setNotices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingNotice, setEditingNotice] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [filter, setFilter] = useState({ type: '', status: '' });
    const [odps, setOdps] = useState([]);

    const [form, setForm] = useState({
        title: '',
        message: '',
        type: 'gangguan',
        severity: 'medium',
        is_mass: false,
        affected_area: '',
        affected_odp: '',
        start_time: '',
        end_time: '',
        is_active: true,
    });

    useEffect(() => {
        fetchNotices();
        fetchStats();
        fetchOdps();
    }, [filter]);

    const fetchNotices = async () => {
        try {
            const params = new URLSearchParams();
            if (filter.type) params.append('type', filter.type);
            if (filter.status) params.append('status', filter.status);

            const response = await fetch(`/api/network-notices?${params}`, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            const result = await response.json();
            if (result.success) {
                setNotices(result.data.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch notices', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await fetch('/api/network-notices/stats', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            const result = await response.json();
            if (result.success) {
                setStats(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch stats', err);
        }
    };

    const fetchOdps = async () => {
        try {
            const response = await fetch('/api/odp', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            const result = await response.json();
            if (result.data) {
                setOdps(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch ODPs', err);
        }
    };

    const resetForm = () => {
        setForm({
            title: '',
            message: '',
            type: 'gangguan',
            severity: 'medium',
            is_mass: false,
            affected_area: '',
            affected_odp: '',
            start_time: '',
            end_time: '',
            is_active: true,
        });
        setEditingNotice(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const url = editingNotice
                ? `/api/network-notices/${editingNotice.id}`
                : '/api/network-notices';
            const method = editingNotice ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify(form),
            });

            const result = await response.json();
            if (result.success) {
                setShowForm(false);
                resetForm();
                fetchNotices();
                fetchStats();
            } else {
                alert(result.message || 'Gagal menyimpan data');
            }
        } catch (err) {
            console.error('Failed to save notice', err);
            alert('Terjadi kesalahan');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (notice) => {
        setForm({
            title: notice.title,
            message: notice.message,
            type: notice.type,
            severity: notice.severity,
            is_mass: notice.is_mass,
            affected_area: notice.affected_area || '',
            affected_odp: notice.affected_odp || '',
            start_time: notice.start_time ? notice.start_time.slice(0, 16) : '',
            end_time: notice.end_time ? notice.end_time.slice(0, 16) : '',
            is_active: notice.is_active,
        });
        setEditingNotice(notice);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Yakin ingin menghapus informasi ini?')) return;

        try {
            const response = await fetch(`/api/network-notices/${id}`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            const result = await response.json();
            if (result.success) {
                fetchNotices();
                fetchStats();
            }
        } catch (err) {
            console.error('Failed to delete notice', err);
        }
    };

    const handleToggle = async (id) => {
        try {
            const response = await fetch(`/api/network-notices/${id}/toggle`, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });

            const result = await response.json();
            if (result.success) {
                fetchNotices();
                fetchStats();
            }
        } catch (err) {
            console.error('Failed to toggle notice', err);
        }
    };

    const getSeverityBadge = (severity) => {
        const badges = {
            low: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Ringan' },
            medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Sedang' },
            high: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Tinggi' },
            critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Kritis' },
        };
        const badge = badges[severity] || badges.medium;
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                {badge.label}
            </span>
        );
    };

    const getTypeBadge = (type) => {
        if (type === 'gangguan') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    <AlertTriangle size={12} />
                    Gangguan
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                <Wrench size={12} />
                Maintenance
            </span>
        );
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Informasi Gangguan & Maintenance</h1>
                <p className="text-gray-600">Kelola informasi gangguan dan perbaikan terjadwal</p>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                <AlertTriangle size={20} className="text-red-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900">{stats.active_gangguan}</p>
                                <p className="text-xs text-gray-500">Gangguan Aktif</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                <AlertCircle size={20} className="text-orange-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900">{stats.mass_gangguan}</p>
                                <p className="text-xs text-gray-500">Gangguan Massal</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Wrench size={20} className="text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900">{stats.active_maintenance}</p>
                                <p className="text-xs text-gray-500">Maintenance Aktif</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                <Info size={20} className="text-gray-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                                <p className="text-xs text-gray-500">Total Record</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters & Actions */}
            <div className="bg-white rounded-xl shadow-sm border mb-6">
                <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex flex-wrap gap-3">
                        <select
                            value={filter.type}
                            onChange={(e) => setFilter({ ...filter, type: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        >
                            <option value="">Semua Tipe</option>
                            <option value="gangguan">Gangguan</option>
                            <option value="maintenance">Maintenance</option>
                        </select>
                        <select
                            value={filter.status}
                            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        >
                            <option value="">Semua Status</option>
                            <option value="active">Aktif</option>
                            <option value="inactive">Nonaktif</option>
                        </select>
                        <button
                            onClick={() => { fetchNotices(); fetchStats(); }}
                            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 border rounded-lg hover:bg-gray-50"
                        >
                            <RefreshCw size={16} />
                            Refresh
                        </button>
                    </div>
                    <button
                        onClick={() => { resetForm(); setShowForm(true); }}
                        className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition"
                    >
                        <Plus size={18} />
                        Tambah Informasi
                    </button>
                </div>
            </div>

            {/* Notices List */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center">
                        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-gray-500">Memuat data...</p>
                    </div>
                ) : notices.length === 0 ? (
                    <div className="p-8 text-center">
                        <Info size={48} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500">Belum ada informasi</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {notices.map((notice) => (
                            <div key={notice.id} className={`p-4 hover:bg-gray-50 transition ${!notice.is_active ? 'opacity-60' : ''}`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            {getTypeBadge(notice.type)}
                                            {getSeverityBadge(notice.severity)}
                                            {notice.is_mass && (
                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                    Massal
                                                </span>
                                            )}
                                            {!notice.is_active && (
                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                                    Nonaktif
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-semibold text-gray-900 mb-1">{notice.title}</h3>
                                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">{notice.message}</p>
                                        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                                            {notice.affected_area && (
                                                <span className="flex items-center gap-1">
                                                    <MapPin size={12} />
                                                    {notice.affected_area}
                                                </span>
                                            )}
                                            {notice.affected_odp && (
                                                <span className="flex items-center gap-1">
                                                    <Info size={12} />
                                                    ODP: {notice.affected_odp}
                                                </span>
                                            )}
                                            {notice.start_time && (
                                                <span className="flex items-center gap-1">
                                                    <Clock size={12} />
                                                    Mulai: {formatDateTime(notice.start_time)}
                                                </span>
                                            )}
                                            {notice.end_time && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={12} />
                                                    Selesai: {formatDateTime(notice.end_time)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggle(notice.id)}
                                            className={`p-2 rounded-lg transition ${notice.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                            title={notice.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                        >
                                            {notice.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(notice)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                            title="Edit"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(notice.id)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                            title="Hapus"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">
                                {editingNotice ? 'Edit Informasi' : 'Tambah Informasi Baru'}
                            </h2>
                            <button
                                onClick={() => { setShowForm(false); resetForm(); }}
                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {/* Type & Severity */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipe *</label>
                                    <select
                                        value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        required
                                    >
                                        <option value="gangguan">Gangguan</option>
                                        <option value="maintenance">Perbaikan Terjadwal</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Keparahan *</label>
                                    <select
                                        value={form.severity}
                                        onChange={(e) => setForm({ ...form, severity: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        required
                                    >
                                        <option value="low">Ringan</option>
                                        <option value="medium">Sedang</option>
                                        <option value="high">Tinggi</option>
                                        <option value="critical">Kritis</option>
                                    </select>
                                </div>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Judul *</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    placeholder="Contoh: Gangguan Jaringan Area Selatan"
                                    required
                                />
                            </div>

                            {/* Message */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Pesan/Deskripsi *</label>
                                <textarea
                                    value={form.message}
                                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    rows={3}
                                    placeholder="Jelaskan detail gangguan atau perbaikan..."
                                    required
                                />
                            </div>

                            {/* Is Mass */}
                            {form.type === 'gangguan' && (
                                <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                                    <input
                                        type="checkbox"
                                        id="is_mass"
                                        checked={form.is_mass}
                                        onChange={(e) => setForm({ ...form, is_mass: e.target.checked })}
                                        className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                                    />
                                    <label htmlFor="is_mass" className="text-sm">
                                        <span className="font-medium text-yellow-800">Gangguan Massal</span>
                                        <span className="text-yellow-700 block text-xs">Akan ditampilkan di Landing Page untuk semua pengunjung</span>
                                    </label>
                                </div>
                            )}

                            {/* Affected Area & ODP */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Area Terdampak</label>
                                    <input
                                        type="text"
                                        value={form.affected_area}
                                        onChange={(e) => setForm({ ...form, affected_area: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        placeholder="Contoh: Perumahan XYZ"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">ODP Terdampak</label>
                                    <input
                                        type="text"
                                        value={form.affected_odp}
                                        onChange={(e) => setForm({ ...form, affected_odp: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        placeholder="Contoh: ODP-01, ODP-02"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Pisahkan dengan koma jika lebih dari satu</p>
                                </div>
                            </div>

                            {/* Time Range */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {form.type === 'maintenance' ? 'Waktu Mulai' : 'Waktu Kejadian'}
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={form.start_time}
                                        onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimasi Selesai</label>
                                    <input
                                        type="datetime-local"
                                        value={form.end_time}
                                        onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            {/* Is Active */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={form.is_active}
                                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                                />
                                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                                    Aktifkan informasi ini
                                </label>
                            </div>

                            {/* Submit */}
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={() => { setShowForm(false); resetForm(); }}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Menyimpan...
                                        </>
                                    ) : (
                                        <>
                                            <Check size={18} />
                                            {editingNotice ? 'Perbarui' : 'Simpan'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default NetworkNoticePage;
