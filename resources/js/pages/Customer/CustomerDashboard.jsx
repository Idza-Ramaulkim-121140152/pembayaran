import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    User, MapPin, Phone, Wifi, Calendar, CreditCard,
    FileText, MessageSquare, Send, LogOut, Clock, 
    CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp,
    Home
} from 'lucide-react';
import NetworkNoticePopup from '../../components/NetworkNoticePopup';

function CustomerDashboard() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [networkNotices, setNetworkNotices] = useState([]);
    const [showNoticePopup, setShowNoticePopup] = useState(false);
    
    // Form aduan
    const [showComplaintForm, setShowComplaintForm] = useState(false);
    const [complaintForm, setComplaintForm] = useState({
        subject: '',
        message: '',
        category: 'gangguan',
    });
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);

    useEffect(() => {
        // Check if logged in
        const isLoggedIn = localStorage.getItem('customer_logged_in');
        if (!isLoggedIn) {
            navigate('/customer/login');
            return;
        }
        fetchDashboard();
        fetchNetworkNotices();
    }, [navigate]);

    const fetchNetworkNotices = async () => {
        try {
            // Get customer's ODP if available from localStorage or data
            const response = await fetch('/api/network-notices/customer', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            const result = await response.json();
            if (result.success && result.data.length > 0) {
                setNetworkNotices(result.data);
                setShowNoticePopup(true);
            }
        } catch (err) {
            console.error('Failed to fetch network notices', err);
        }
    };

    const fetchDashboard = async () => {
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/dashboard', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });

            const result = await response.json();

            if (result.success) {
                setData(result);
            } else {
                if (response.status === 401) {
                    localStorage.removeItem('customer_logged_in');
                    navigate('/customer/login');
                } else {
                    setError(result.message);
                }
            }
        } catch (err) {
            setError('Gagal memuat data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            await fetch('/api/customer/logout', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
            });
        } catch (err) {
            console.error(err);
        }
        
        localStorage.removeItem('customer_logged_in');
        localStorage.removeItem('customer_name');
        localStorage.removeItem('customer_id');
        navigate('/customer/login');
    };

    const handleComplaintSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            const response = await fetch('/api/customer/complaint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify(complaintForm),
            });

            const result = await response.json();

            if (result.success) {
                setSuccessMessage('Aduan berhasil dikirim! Kami akan segera menindaklanjuti.');
                setComplaintForm({ subject: '', message: '', category: 'gangguan' });
                setShowComplaintForm(false);
                fetchDashboard(); // Refresh data
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError('Gagal mengirim aduan');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('id-ID').format(price);
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    };

    const getStatusBadge = (status) => {
        const badges = {
            'paid': { color: 'bg-green-100 text-green-700', text: 'Lunas', icon: CheckCircle },
            'pending': { color: 'bg-yellow-100 text-yellow-700', text: 'Menunggu', icon: Clock },
            'overdue': { color: 'bg-red-100 text-red-700', text: 'Jatuh Tempo', icon: AlertCircle },
            'cancelled': { color: 'bg-gray-100 text-gray-700', text: 'Dibatalkan', icon: XCircle },
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

    const getComplaintStatusBadge = (status) => {
        const badges = {
            'pending': { color: 'bg-yellow-100 text-yellow-700', text: 'Menunggu' },
            'in_progress': { color: 'bg-blue-100 text-blue-700', text: 'Diproses' },
            'resolved': { color: 'bg-green-100 text-green-700', text: 'Selesai' },
            'closed': { color: 'bg-gray-100 text-gray-700', text: 'Ditutup' },
        };
        const badge = badges[status] || badges['pending'];
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                {badge.text}
            </span>
        );
    };

    const getCategoryLabel = (category) => {
        const labels = {
            'gangguan': 'Gangguan Jaringan',
            'pembayaran': 'Pembayaran',
            'layanan': 'Layanan',
            'lainnya': 'Lainnya',
        };
        return labels[category] || category;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Memuat data...</p>
                </div>
            </div>
        );
    }

    const customer = data?.customer;
    const invoices = data?.invoices || [];
    const complaints = data?.complaints || [];

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
            {/* Network Notice Popup - auto hide after 3 seconds */}
            {showNoticePopup && networkNotices.length > 0 && (
                <NetworkNoticePopup 
                    notices={networkNotices} 
                    autoHideDelay={3000}
                    showOnlyFirst={true}
                    onClose={() => setShowNoticePopup(false)}
                />
            )}

            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <a href="/" className="flex items-center gap-2">
                                <img src="/logo_baru.png" alt="Logo" className="h-10" />
                                <div className="hidden sm:block">
                                    <p className="font-bold text-gray-900">Rumah Kita Net</p>
                                    <p className="text-xs text-gray-500">Portal Pelanggan</p>
                                </div>
                            </a>
                        </div>
                        <div className="flex items-center gap-4">
                            <a href="/" className="text-gray-600 hover:text-gray-900 transition">
                                <Home size={20} />
                            </a>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 text-red-600 hover:text-red-700 transition"
                            >
                                <LogOut size={20} />
                                <span className="hidden sm:inline">Keluar</span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
                {/* Success Message */}
                {successMessage && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-3">
                        <CheckCircle size={20} />
                        <span>{successMessage}</span>
                        <button 
                            onClick={() => setSuccessMessage(null)}
                            className="ml-auto text-green-700 hover:text-green-900"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
                        <AlertCircle size={20} />
                        <span>{error}</span>
                        <button 
                            onClick={() => setError(null)}
                            className="ml-auto text-red-700 hover:text-red-900"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Customer Info Card */}
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-8 text-white">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
                                {customer?.nama?.charAt(0) || 'P'}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">{customer?.nama || 'Pelanggan'}</h1>
                                <p className="text-white/80 text-sm">
                                    {customer?.is_active ? (
                                        <span className="inline-flex items-center gap-1">
                                            <CheckCircle size={14} /> Akun Aktif
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1">
                                            <XCircle size={14} /> Akun Tidak Aktif
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <MapPin size={20} className="text-orange-600" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Alamat</p>
                                <p className="font-medium text-gray-900 text-sm">{customer?.alamat || '-'}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Phone size={20} className="text-green-600" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">No. Telepon</p>
                                <p className="font-medium text-gray-900 text-sm">{customer?.no_telp || '-'}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <User size={20} className="text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Username PPPoE</p>
                                <p className="font-medium text-gray-900 text-sm">{customer?.user_pppoe || '-'}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Wifi size={20} className="text-purple-600" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Paket</p>
                                <p className="font-medium text-gray-900 text-sm">
                                    {customer?.paket || '-'}
                                    {customer?.harga && ` - Rp ${formatPrice(customer.harga)}`}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Payment History */}
                <div className="bg-white rounded-2xl shadow-lg p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <CreditCard size={20} className="text-orange-500" />
                            Riwayat Pembayaran
                        </h2>
                    </div>

                    {invoices.length > 0 ? (
                        <div className="space-y-3">
                            {invoices.map((invoice) => (
                                <div 
                                    key={invoice.id} 
                                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                                            <FileText size={20} className="text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">
                                                Tagihan {new Date(invoice.periode || invoice.created_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                Rp {formatPrice(invoice.amount || invoice.jumlah || 0)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {getStatusBadge(invoice.status)}
                                        {invoice.paid_at && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                Dibayar: {formatDate(invoice.paid_at)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <CreditCard size={48} className="mx-auto mb-4 text-gray-300" />
                            <p>Belum ada riwayat pembayaran</p>
                        </div>
                    )}
                </div>

                {/* Complaints Section */}
                <div className="bg-white rounded-2xl shadow-lg p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <MessageSquare size={20} className="text-orange-500" />
                            Aduan / Keluhan
                        </h2>
                        <button
                            onClick={() => setShowComplaintForm(!showComplaintForm)}
                            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition"
                        >
                            {showComplaintForm ? (
                                <>
                                    <ChevronUp size={18} />
                                    Tutup Form
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    Buat Aduan
                                </>
                            )}
                        </button>
                    </div>

                    {/* Complaint Form */}
                    {showComplaintForm && (
                        <form onSubmit={handleComplaintSubmit} className="bg-orange-50 rounded-xl p-6 mb-6 space-y-4">
                            <h3 className="font-semibold text-gray-900">Form Aduan Baru</h3>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Kategori
                                </label>
                                <select
                                    value={complaintForm.category}
                                    onChange={(e) => setComplaintForm(prev => ({ ...prev, category: e.target.value }))}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                >
                                    <option value="gangguan">Gangguan Jaringan</option>
                                    <option value="pembayaran">Pembayaran</option>
                                    <option value="layanan">Layanan</option>
                                    <option value="lainnya">Lainnya</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Judul Aduan *
                                </label>
                                <input
                                    type="text"
                                    value={complaintForm.subject}
                                    onChange={(e) => setComplaintForm(prev => ({ ...prev, subject: e.target.value }))}
                                    required
                                    placeholder="Contoh: Internet lambat sejak kemarin"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Detail Aduan *
                                </label>
                                <textarea
                                    value={complaintForm.message}
                                    onChange={(e) => setComplaintForm(prev => ({ ...prev, message: e.target.value }))}
                                    required
                                    rows={4}
                                    placeholder="Jelaskan masalah Anda secara detail..."
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-medium transition disabled:opacity-50"
                            >
                                {submitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        <span>Mengirim...</span>
                                    </>
                                ) : (
                                    <>
                                        <Send size={18} />
                                        <span>Kirim Aduan</span>
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {/* Complaints List */}
                    {complaints.length > 0 ? (
                        <div className="space-y-3">
                            {complaints.map((complaint) => (
                                <div 
                                    key={complaint.id} 
                                    className="p-4 bg-gray-50 rounded-xl"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="font-medium text-gray-900">{complaint.subject}</h4>
                                                {getComplaintStatusBadge(complaint.status)}
                                            </div>
                                            <p className="text-sm text-gray-600 mt-1">{complaint.message}</p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                                <span>{getCategoryLabel(complaint.category)}</span>
                                                <span>•</span>
                                                <span>{formatDate(complaint.created_at)}</span>
                                            </div>
                                            {complaint.admin_response && (
                                                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                                                    <p className="text-xs font-medium text-blue-700 mb-1">Balasan Admin:</p>
                                                    <p className="text-sm text-blue-900">{complaint.admin_response}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
                            <p>Belum ada aduan</p>
                            <p className="text-sm mt-1">Klik "Buat Aduan" jika Anda memiliki keluhan</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-12 py-6">
                <div className="max-w-5xl mx-auto px-4 text-center text-sm text-gray-500">
                    <p>© 2025 Rumah Kita Network. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}

export default CustomerDashboard;
