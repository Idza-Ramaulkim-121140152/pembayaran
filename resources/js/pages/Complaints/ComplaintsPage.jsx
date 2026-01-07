import { useEffect, useState } from 'react';
import { 
    MessageSquare, Search, Filter, Clock, CheckCircle, AlertCircle,
    User, Phone, Calendar, ChevronDown, ChevronUp, X, Send, Eye,
    Wifi, XCircle, RefreshCw
} from 'lucide-react';
import apiClient from '../../services/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';

function ComplaintsPage() {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [stats, setStats] = useState(null);
    
    // Filters
    const [filters, setFilters] = useState({
        status: '',
        category: '',
        priority: '',
        search: '',
    });
    const [showFilters, setShowFilters] = useState(false);
    
    // Pagination
    const [pagination, setPagination] = useState({
        currentPage: 1,
        lastPage: 1,
        total: 0,
    });

    // Modal
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [responseForm, setResponseForm] = useState({
        status: '',
        admin_response: '',
        priority: '',
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchComplaints();
        fetchStats();
    }, [filters, pagination.currentPage]);

    const fetchComplaints = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.append('page', pagination.currentPage);
            if (filters.status) params.append('status', filters.status);
            if (filters.category) params.append('category', filters.category);
            if (filters.priority) params.append('priority', filters.priority);
            if (filters.search) params.append('search', filters.search);

            const response = await apiClient.get(`/complaints?${params.toString()}`);
            setComplaints(response.data.data);
            setPagination({
                currentPage: response.data.current_page,
                lastPage: response.data.last_page,
                total: response.data.total,
            });
        } catch (err) {
            setError('Gagal memuat data aduan');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await apiClient.get('/complaints/stats');
            setStats(response.data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, currentPage: 1 }));
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setPagination(prev => ({ ...prev, currentPage: 1 }));
        fetchComplaints();
    };

    const openModal = (complaint) => {
        setSelectedComplaint(complaint);
        setResponseForm({
            status: complaint.status,
            admin_response: complaint.admin_response || '',
            priority: complaint.priority,
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedComplaint(null);
        setResponseForm({ status: '', admin_response: '', priority: '' });
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        
        try {
            await apiClient.put(`/complaints/${selectedComplaint.id}`, responseForm);
            setSuccess('Aduan berhasil diperbarui');
            closeModal();
            fetchComplaints();
            fetchStats();
        } catch (err) {
            setError('Gagal memperbarui aduan');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status) => {
        const badges = {
            'pending': { color: 'bg-yellow-100 text-yellow-700', text: 'Menunggu', icon: Clock },
            'in_progress': { color: 'bg-blue-100 text-blue-700', text: 'Diproses', icon: RefreshCw },
            'resolved': { color: 'bg-green-100 text-green-700', text: 'Selesai', icon: CheckCircle },
            'closed': { color: 'bg-gray-100 text-gray-700', text: 'Ditutup', icon: XCircle },
        };
        const badge = badges[status] || badges['pending'];
        const Icon = badge.icon;
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                <Icon size={12} />
                {badge.text}
            </span>
        );
    };

    const getCategoryBadge = (category) => {
        const badges = {
            'gangguan': { color: 'bg-red-100 text-red-700', text: 'Gangguan Jaringan' },
            'pembayaran': { color: 'bg-purple-100 text-purple-700', text: 'Pembayaran' },
            'layanan': { color: 'bg-blue-100 text-blue-700', text: 'Layanan' },
            'lainnya': { color: 'bg-gray-100 text-gray-700', text: 'Lainnya' },
        };
        const badge = badges[category] || badges['lainnya'];
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                {badge.text}
            </span>
        );
    };

    const getPriorityBadge = (priority) => {
        const badges = {
            'low': { color: 'bg-green-100 text-green-700', text: 'Rendah' },
            'medium': { color: 'bg-yellow-100 text-yellow-700', text: 'Sedang' },
            'high': { color: 'bg-red-100 text-red-700', text: 'Tinggi' },
        };
        const badge = badges[priority] || badges['medium'];
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                {badge.text}
            </span>
        );
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <MessageSquare className="text-pink-500" />
                        Kelola Aduan Pelanggan
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Kelola dan tanggapi aduan dari pelanggan
                    </p>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <Alert type="error" title="Error" message={error} onClose={() => setError(null)} />
            )}
            {success && (
                <Alert type="success" title="Berhasil" message={success} onClose={() => setSuccess(null)} />
            )}

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                                <Clock size={20} className="text-yellow-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Menunggu</p>
                                <p className="text-xl font-bold text-gray-900">{stats.by_status?.pending || 0}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <RefreshCw size={20} className="text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Diproses</p>
                                <p className="text-xl font-bold text-gray-900">{stats.by_status?.in_progress || 0}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <CheckCircle size={20} className="text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Selesai</p>
                                <p className="text-xl font-bold text-gray-900">{stats.by_status?.resolved || 0}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                <XCircle size={20} className="text-gray-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Ditutup</p>
                                <p className="text-xl font-bold text-gray-900">{stats.by_status?.closed || 0}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Search */}
                    <form onSubmit={handleSearch} className="flex-1">
                        <div className="relative">
                            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Cari berdasarkan nama pelanggan atau judul..."
                                value={filters.search}
                                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500"
                            />
                        </div>
                    </form>

                    {/* Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                        <Filter size={18} />
                        Filter
                        {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                </div>

                {/* Filter Options */}
                {showFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                                value={filters.status}
                                onChange={(e) => handleFilterChange('status', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500"
                            >
                                <option value="">Semua Status</option>
                                <option value="pending">Menunggu</option>
                                <option value="in_progress">Diproses</option>
                                <option value="resolved">Selesai</option>
                                <option value="closed">Ditutup</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                            <select
                                value={filters.category}
                                onChange={(e) => handleFilterChange('category', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500"
                            >
                                <option value="">Semua Kategori</option>
                                <option value="gangguan">Gangguan Jaringan</option>
                                <option value="pembayaran">Pembayaran</option>
                                <option value="layanan">Layanan</option>
                                <option value="lainnya">Lainnya</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Prioritas</label>
                            <select
                                value={filters.priority}
                                onChange={(e) => handleFilterChange('priority', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500"
                            >
                                <option value="">Semua Prioritas</option>
                                <option value="low">Rendah</option>
                                <option value="medium">Sedang</option>
                                <option value="high">Tinggi</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Complaints List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                {loading ? (
                    <div className="flex justify-center items-center py-12">
                        <LoadingSpinner text="Memuat data aduan..." />
                    </div>
                ) : complaints.length === 0 ? (
                    <div className="text-center py-12">
                        <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
                        <p className="text-gray-500">Belum ada aduan</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {complaints.map((complaint) => (
                            <div 
                                key={complaint.id}
                                className="p-4 hover:bg-gray-50 transition cursor-pointer"
                                onClick={() => openModal(complaint)}
                            >
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap mb-2">
                                            {getStatusBadge(complaint.status)}
                                            {getCategoryBadge(complaint.category)}
                                            {getPriorityBadge(complaint.priority)}
                                        </div>
                                        <h3 className="font-semibold text-gray-900">{complaint.subject}</h3>
                                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{complaint.message}</p>
                                        
                                        {/* Customer Info */}
                                        <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <User size={14} />
                                                {complaint.customer?.name || 'Unknown'}
                                            </span>
                                            {complaint.customer?.phone && (
                                                <span className="flex items-center gap-1">
                                                    <Phone size={14} />
                                                    {complaint.customer.phone}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <Calendar size={14} />
                                                {formatDate(complaint.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openModal(complaint);
                                        }}
                                        className="flex items-center gap-1 text-pink-600 hover:text-pink-700 text-sm font-medium"
                                    >
                                        <Eye size={16} />
                                        Detail
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {pagination.lastPage > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                            Menampilkan {complaints.length} dari {pagination.total} aduan
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
                                disabled={pagination.currentPage === 1}
                                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition"
                            >
                                Sebelumnya
                            </button>
                            <span className="px-3 py-1 text-sm text-gray-600">
                                {pagination.currentPage} / {pagination.lastPage}
                            </span>
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
                                disabled={pagination.currentPage === pagination.lastPage}
                                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition"
                            >
                                Selanjutnya
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {showModal && selectedComplaint && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                        <div className="fixed inset-0 bg-gray-900/50 transition-opacity" onClick={closeModal}></div>
                        
                        <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-auto overflow-hidden">
                            {/* Modal Header */}
                            <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-4 text-white">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold">Detail Aduan</h3>
                                    <button onClick={closeModal} className="p-1 hover:bg-white/20 rounded-lg transition">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 max-h-[70vh] overflow-y-auto">
                                {/* Customer Info */}
                                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                                    <h4 className="text-sm font-medium text-gray-500 mb-3">Informasi Pelanggan</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="flex items-center gap-2">
                                            <User size={16} className="text-gray-400" />
                                            <span className="text-sm text-gray-900">{selectedComplaint.customer?.name || '-'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Phone size={16} className="text-gray-400" />
                                            <span className="text-sm text-gray-900">{selectedComplaint.customer?.phone || '-'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Wifi size={16} className="text-gray-400" />
                                            <span className="text-sm text-gray-900">{selectedComplaint.customer?.pppoe_username || '-'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Calendar size={16} className="text-gray-400" />
                                            <span className="text-sm text-gray-900">{formatDate(selectedComplaint.created_at)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Complaint Content */}
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-3">
                                        {getStatusBadge(selectedComplaint.status)}
                                        {getCategoryBadge(selectedComplaint.category)}
                                        {getPriorityBadge(selectedComplaint.priority)}
                                    </div>
                                    <h4 className="text-lg font-semibold text-gray-900 mb-2">{selectedComplaint.subject}</h4>
                                    <p className="text-gray-600 whitespace-pre-wrap">{selectedComplaint.message}</p>
                                </div>

                                {/* Response Form */}
                                <form onSubmit={handleUpdate} className="space-y-4 border-t border-gray-100 pt-6">
                                    <h4 className="font-medium text-gray-900">Tanggapi Aduan</h4>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                            <select
                                                value={responseForm.status}
                                                onChange={(e) => setResponseForm(prev => ({ ...prev, status: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500"
                                            >
                                                <option value="pending">Menunggu</option>
                                                <option value="in_progress">Diproses</option>
                                                <option value="resolved">Selesai</option>
                                                <option value="closed">Ditutup</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Prioritas</label>
                                            <select
                                                value={responseForm.priority}
                                                onChange={(e) => setResponseForm(prev => ({ ...prev, priority: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500"
                                            >
                                                <option value="low">Rendah</option>
                                                <option value="medium">Sedang</option>
                                                <option value="high">Tinggi</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Balasan untuk Pelanggan</label>
                                        <textarea
                                            value={responseForm.admin_response}
                                            onChange={(e) => setResponseForm(prev => ({ ...prev, admin_response: e.target.value }))}
                                            rows={4}
                                            placeholder="Tulis balasan untuk pelanggan..."
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-pink-500"
                                        />
                                    </div>

                                    <div className="flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                                        >
                                            Batal
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition disabled:opacity-50"
                                        >
                                            {submitting ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                    <span>Menyimpan...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Send size={16} />
                                                    <span>Simpan</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ComplaintsPage;
