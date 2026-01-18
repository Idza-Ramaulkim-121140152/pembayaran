import { useEffect, useState } from 'react';
import { 
    Plus, Edit2, Trash2, Search, Phone, Eye, X, 
    User, Calendar, MapPin, Wifi, CreditCard, FileText,
    MessageCircle, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, History,
    CheckCircle, Clock, XCircle, Router, Gift, Download
} from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import customerService from '../../services/customerService';

function CustomersPage() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [search, setSearch] = useState('');
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all'); // all, active, inactive
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [showDetail, setShowDetail] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [sortBy, setSortBy] = useState('name'); // name, due_date
    const [sortOrder, setSortOrder] = useState('asc'); // asc, desc
    const [showSecretModal, setShowSecretModal] = useState(false);
    const [secretData, setSecretData] = useState(null);
    const [loadingSecret, setLoadingSecret] = useState(false);
    const [showCompensationModal, setShowCompensationModal] = useState(false);
    const [compensationCustomer, setCompensationCustomer] = useState(null);
    const [newDueDate, setNewDueDate] = useState('');
    const [submittingCompensation, setSubmittingCompensation] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    useEffect(() => {
        let filtered = customers;
        
        // Filter by status
        if (filterStatus === 'active') {
            filtered = filtered.filter(c => c.is_active);
        } else if (filterStatus === 'inactive') {
            filtered = filtered.filter(c => !c.is_active);
        }
        
        // Filter by search
        if (search) {
            filtered = filtered.filter(
                (customer) =>
                    customer.name?.toLowerCase().includes(search.toLowerCase()) ||
                    customer.phone?.includes(search) ||
                    customer.address?.toLowerCase().includes(search.toLowerCase()) ||
                    customer.pppoe_username?.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Sort
        filtered = [...filtered].sort((a, b) => {
            if (sortBy === 'name') {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                if (sortOrder === 'asc') {
                    return nameA.localeCompare(nameB);
                } else {
                    return nameB.localeCompare(nameA);
                }
            } else if (sortBy === 'due_date') {
                const dateA = parseInt(a.due_date) || 0;
                const dateB = parseInt(b.due_date) || 0;
                if (sortOrder === 'asc') {
                    return dateA - dateB;
                } else {
                    return dateB - dateA;
                }
            }
            return 0;
        });
        
        setFilteredCustomers(filtered);
    }, [search, customers, filterStatus, sortBy, sortOrder]);

    const fetchCustomers = async () => {
        try {
            const response = await customerService.getAll();
            setCustomers(response.data.data || []);
        } catch (err) {
            setError('Gagal memuat daftar pelanggan');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Apakah Anda yakin ingin menghapus pelanggan ini?')) return;

        try {
            await customerService.delete(id);
            setCustomers(customers.filter((c) => c.id !== id));
            setSuccess('Pelanggan berhasil dihapus');
        } catch (err) {
            setError('Gagal menghapus pelanggan');
            console.error(err);
        }
    };

    const handleViewDetail = (customer) => {
        setSelectedCustomer(customer);
        setShowDetail(true);
    };

    const handleViewHistory = async (customer) => {
        setSelectedCustomer(customer);
        setShowHistory(true);
        setLoadingHistory(true);
        try {
            const response = await customerService.getPaymentHistory(customer.id);
            setPaymentHistory(response.data.invoices || []);
        } catch (err) {
            console.error('Failed to load payment history', err);
            setPaymentHistory([]);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleViewSecret = async (customer) => {
        if (!customer.pppoe_username) {
            setError('Pelanggan ini tidak memiliki username PPPoE');
            return;
        }

        setLoadingSecret(true);
        setShowSecretModal(true);
        setSecretData(null);

        try {
            const response = await axios.get(`/pelanggan/${customer.id}/secret`, {
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                withCredentials: true,
            });
            
            if (response.data.success) {
                setSecretData(response.data.data);
            } else {
                setError(response.data.message || 'Gagal memuat informasi secret');
                setShowSecretModal(false);
            }
        } catch (err) {
            console.error('Failed to load secret', err);
            setError('Gagal memuat informasi secret');
            setShowSecretModal(false);
        } finally {
            setLoadingSecret(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('id-ID', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
        });
    };

    const formatCurrency = (amount) => {
        if (!amount) return '-';
        return new Intl.NumberFormat('id-ID', { 
            style: 'currency', 
            currency: 'IDR',
            minimumFractionDigits: 0 
        }).format(amount);
    };

    const getWhatsAppLink = (phone) => {
        if (!phone) return '#';
        let cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.substring(1);
        }
        return `https://wa.me/${cleanPhone}`;
    };

    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    const handleOpenCompensation = (customer) => {
        setCompensationCustomer(customer);
        setNewDueDate(customer.due_date || '');
        setShowCompensationModal(true);
    };

    const handleAddDays = (days) => {
        const currentDate = newDueDate ? new Date(newDueDate) : new Date();
        currentDate.setDate(currentDate.getDate() + days);
        setNewDueDate(currentDate.toISOString().split('T')[0]);
    };

    const handleSubmitCompensation = async (e) => {
        e.preventDefault();
        
        if (!newDueDate) {
            setError('Tanggal jatuh tempo harus diisi');
            return;
        }

        try {
            setSubmittingCompensation(true);
            await customerService.giveCompensation(compensationCustomer.id, newDueDate);
            setSuccess(`Kompensasi berhasil diberikan kepada ${compensationCustomer.name}`);
            setShowCompensationModal(false);
            fetchCustomers();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memberikan kompensasi');
        } finally {
            setSubmittingCompensation(false);
        }
    };

    const getSortIcon = (field) => {
        if (sortBy !== field) {
            return <ArrowUpDown size={16} className="text-gray-400" />;
        }
        return sortOrder === 'asc' 
            ? <ArrowUp size={16} className="text-blue-600" /> 
            : <ArrowDown size={16} className="text-blue-600" />;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <LoadingSpinner text="Memuat pelanggan..." />
            </div>
        );
    }

    const handleExport = async () => {
        try {
            window.location.href = '/api/customers/export/excel';
        } catch (err) {
            setError('Gagal mengekspor data pelanggan');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Daftar Pelanggan</h1>
                    <p className="text-gray-600 mt-1">Total {customers.length} pelanggan terdaftar</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition"
                    >
                        <Download size={20} />
                        Export Data
                    </button>
                    <Link to="/customer-verification">
                        <Button className="flex items-center gap-2">
                            <Plus size={20} />
                            Aktivasi Baru
                        </Button>
                    </Link>
                </div>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* Search & Filter */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex flex-col gap-4">
                    {/* Search */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="Cari nama, telepon, alamat, atau username PPPoE..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setFilterStatus('all')}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${filterStatus === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                Semua
                            </button>
                            <button
                                onClick={() => setFilterStatus('active')}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${filterStatus === 'active' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                Aktif
                            </button>
                            <button
                                onClick={() => setFilterStatus('inactive')}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${filterStatus === 'inactive' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            >
                                Nonaktif
                            </button>
                        </div>
                    </div>

                    {/* Sort Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-500">Urutkan:</span>
                        <button
                            onClick={() => handleSort('name')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                sortBy === 'name' 
                                    ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-transparent'
                            }`}
                        >
                            {getSortIcon('name')}
                            Nama
                        </button>
                        <button
                            onClick={() => handleSort('due_date')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                sortBy === 'due_date' 
                                    ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-transparent'
                            }`}
                        >
                            {getSortIcon('due_date')}
                            Jatuh Tempo
                        </button>
                    </div>
                </div>
            </div>

            {/* Customers Grid */}
            {filteredCustomers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCustomers.map((customer) => (
                        <div 
                            key={customer.id} 
                            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition"
                        >
                            {/* Card Header */}
                            <div className="p-4 border-b border-gray-100">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                            {customer.name?.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{customer.name}</h3>
                                            <p className="text-sm text-gray-500">{customer.pppoe_username || '-'}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                        customer.is_active 
                                            ? 'bg-green-100 text-green-700' 
                                            : 'bg-red-100 text-red-700'
                                    }`}>
                                        {customer.is_active ? 'Aktif' : 'Nonaktif'}
                                    </span>
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm">
                                    <Phone size={16} className="text-gray-400" />
                                    <span className="text-gray-700">{customer.phone || '-'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Wifi size={16} className="text-gray-400" />
                                    <span className="text-gray-700">{customer.package_type || '-'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <MapPin size={16} className="text-gray-400" />
                                    <span className="text-gray-700 truncate">{customer.address || '-'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Calendar size={16} className="text-gray-400" />
                                    <span className="text-gray-700">Jatuh tempo: {customer.due_date || '-'}</span>
                                </div>
                            </div>

                            {/* Card Footer */}
                            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => handleOpenCompensation(customer)}
                                            className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition"
                                            title="Berikan Kompensasi"
                                        >
                                            <Gift size={20} />
                                        </button>
                                        <a
                                            href={getWhatsAppLink(customer.phone)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                            title="Hubungi via WhatsApp"
                                        >
                                            <MessageCircle size={20} />
                                        </a>
                                        <button
                                            onClick={() => handleViewDetail(customer)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                            title="Lihat Detail"
                                        >
                                            <Eye size={20} />
                                        </button>
                                        <button
                                            onClick={() => handleViewHistory(customer)}
                                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition"
                                            title="Histori Pembayaran"
                                        >
                                            <History size={20} />
                                        </button>
                                        {customer.pppoe_username && (
                                            <button
                                                onClick={() => handleViewSecret(customer)}
                                                className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition"
                                                title="Lihat Secret PPPoE"
                                            >
                                                <Router size={20} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <Link to={`/customers/${customer.id}/edit`}>
                                            <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition" title="Edit">
                                                <Edit2 size={18} />
                                            </button>
                                        </Link>
                                        <button
                                            onClick={() => handleDelete(customer.id)}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                            title="Hapus"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <User size={48} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-1">Tidak ada pelanggan</h3>
                    <p className="text-gray-500 mb-4">
                        {search ? 'Tidak ada hasil yang cocok dengan pencarian.' : 'Belum ada pelanggan terdaftar.'}
                    </p>
                    <Link to="/customers/create">
                        <Button>
                            <Plus size={20} className="mr-2" />
                            Aktivasi Pelanggan Baru
                        </Button>
                    </Link>
                </div>
            )}

            {/* Detail Modal */}
            {showDetail && selectedCustomer && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
                                        {selectedCustomer.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">{selectedCustomer.name}</h2>
                                        <p className="text-blue-100">{selectedCustomer.pppoe_username || 'Username belum diset'}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowDetail(false)}
                                    className="p-2 hover:bg-white/20 rounded-lg transition"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto max-h-[60vh]">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Info Pribadi */}
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <User size={18} className="text-blue-600" />
                                        Informasi Pribadi
                                    </h3>
                                    <div className="space-y-3 pl-6">
                                        <div>
                                            <p className="text-xs text-gray-500">Jenis Kelamin</p>
                                            <p className="font-medium text-gray-900">{selectedCustomer.gender || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">No. WhatsApp</p>
                                            <p className="font-medium text-gray-900">{selectedCustomer.phone || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Alamat</p>
                                            <p className="font-medium text-gray-900">{selectedCustomer.address || '-'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Info Layanan */}
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <Wifi size={18} className="text-green-600" />
                                        Informasi Layanan
                                    </h3>
                                    <div className="space-y-3 pl-6">
                                        <div>
                                            <p className="text-xs text-gray-500">Jenis Paket</p>
                                            <p className="font-medium text-gray-900">{selectedCustomer.package_type || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">ODP</p>
                                            <p className="font-medium text-gray-900">{selectedCustomer.odp || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Username PPPoE</p>
                                            <p className="font-medium text-gray-900 font-mono">{selectedCustomer.pppoe_username || '-'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Status</p>
                                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${
                                                selectedCustomer.is_active 
                                                    ? 'bg-green-100 text-green-700' 
                                                    : 'bg-red-100 text-red-700'
                                            }`}>
                                                {selectedCustomer.is_active ? 'Aktif' : 'Nonaktif'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Info Tanggal */}
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <Calendar size={18} className="text-purple-600" />
                                        Informasi Tanggal
                                    </h3>
                                    <div className="space-y-3 pl-6">
                                        <div>
                                            <p className="text-xs text-gray-500">Tanggal Aktivasi</p>
                                            <p className="font-medium text-gray-900">{formatDate(selectedCustomer.activation_date)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500">Jatuh Tempo</p>
                                            <p className="font-medium text-gray-900">{selectedCustomer.due_date || '-'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Info Biaya */}
                                <div className="space-y-4">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <CreditCard size={18} className="text-orange-600" />
                                        Informasi Biaya
                                    </h3>
                                    <div className="space-y-3 pl-6">
                                        <div>
                                            <p className="text-xs text-gray-500">Biaya Pemasangan</p>
                                            <p className="font-medium text-gray-900">{formatCurrency(selectedCustomer.installation_fee)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Lokasi */}
                            {(selectedCustomer.latitude && selectedCustomer.longitude) && (
                                <div className="mt-6 pt-6 border-t border-gray-200">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                        <MapPin size={18} className="text-red-600" />
                                        Lokasi
                                    </h3>
                                    <a 
                                        href={`https://www.google.com/maps?q=${selectedCustomer.latitude},${selectedCustomer.longitude}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                                    >
                                        Buka di Google Maps
                                        <ChevronRight size={16} />
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                            <a
                                href={getWhatsAppLink(selectedCustomer.phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition"
                            >
                                <MessageCircle size={20} />
                                Hubungi Pelanggan
                            </a>
                            <Link 
                                to={`/customers/${selectedCustomer.id}/edit`}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition"
                            >
                                <Edit2 size={20} />
                                Edit Data
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment History Modal */}
            {showHistory && selectedCustomer && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-5 text-white">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                                        <History size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">Histori Pembayaran</h2>
                                        <p className="text-purple-100">{selectedCustomer.name}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowHistory(false)}
                                    className="p-2 hover:bg-white/20 rounded-lg transition"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto max-h-[60vh]">
                            {loadingHistory ? (
                                <div className="flex justify-center py-12">
                                    <LoadingSpinner text="Memuat histori..." />
                                </div>
                            ) : paymentHistory.length > 0 ? (
                                <div className="space-y-4">
                                    {paymentHistory.map((invoice) => (
                                        <div 
                                            key={invoice.id} 
                                            className="border border-gray-200 rounded-xl p-4 hover:border-purple-300 transition"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <p className="text-sm text-gray-500">Invoice</p>
                                                    <p className="font-mono font-semibold text-gray-900">{invoice.invoice_number}</p>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                    invoice.status === 'paid' 
                                                        ? 'bg-green-100 text-green-700' 
                                                        : invoice.status === 'pending'
                                                        ? 'bg-yellow-100 text-yellow-700'
                                                        : invoice.status === 'rejected'
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {invoice.status === 'paid' && <CheckCircle size={12} className="inline mr-1" />}
                                                    {invoice.status === 'pending' && <Clock size={12} className="inline mr-1" />}
                                                    {invoice.status === 'rejected' && <XCircle size={12} className="inline mr-1" />}
                                                    {invoice.status === 'paid' ? 'Lunas' : 
                                                     invoice.status === 'pending' ? 'Menunggu' : 
                                                     invoice.status === 'rejected' ? 'Ditolak' : 'Belum Bayar'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <p className="text-gray-500">Tanggal Invoice</p>
                                                    <p className="text-gray-900">{formatDate(invoice.invoice_date)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-gray-500">Jumlah</p>
                                                    <p className="text-gray-900 font-semibold">{formatCurrency(invoice.amount)}</p>
                                                </div>
                                                {invoice.paid_at && (
                                                    <div>
                                                        <p className="text-gray-500">Tanggal Bayar</p>
                                                        <p className="text-gray-900">{formatDate(invoice.paid_at)}</p>
                                                    </div>
                                                )}
                                                {invoice.description && (
                                                    <div className="col-span-2">
                                                        <p className="text-gray-500">Keterangan</p>
                                                        <p className="text-gray-900">{invoice.description}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <History size={48} className="mx-auto text-gray-300 mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-1">Belum ada histori</h3>
                                    <p className="text-gray-500">Pelanggan ini belum memiliki riwayat pembayaran.</p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                            <button
                                onClick={() => setShowHistory(false)}
                                className="w-full py-2.5 bg-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-300 transition"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Secret Info Modal */}
            {showSecretModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                                    <Router size={20} className="text-orange-600" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Informasi Secret PPPoE</h2>
                                    <p className="text-sm text-gray-500">Detail konfigurasi MikroTik</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowSecretModal(false)}
                                className="text-gray-400 hover:text-gray-600 transition"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="px-6 py-6">
                            {loadingSecret ? (
                                <div className="text-center py-12">
                                    <LoadingSpinner text="Memuat informasi secret..." />
                                </div>
                            ) : secretData ? (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <p className="text-xs text-gray-500 mb-1">Username PPPoE</p>
                                        <p className="text-xl font-mono font-bold text-gray-900">{secretData.name}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <p className="text-xs text-gray-500 mb-1">Password</p>
                                        <p className="text-xl font-mono font-bold text-gray-900">{secretData.password || '-'}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <p className="text-xs text-gray-500 mb-1">Service</p>
                                            <p className="text-sm font-medium text-gray-900">{secretData.service || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <p className="text-xs text-gray-500 mb-1">Profile</p>
                                            <p className="text-sm font-medium text-gray-900">{secretData.profile || '-'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <p className="text-xs text-gray-500 mb-1">Remote Address (IP)</p>
                                        <p className="text-lg font-mono font-medium text-gray-900">{secretData.remote_address || '-'}</p>
                                    </div>
                                    {secretData.local_address && (
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <p className="text-xs text-gray-500 mb-1">Local Address</p>
                                            <p className="text-lg font-mono font-medium text-gray-900">{secretData.local_address}</p>
                                        </div>
                                    )}
                                    {secretData.caller_id && (
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <p className="text-xs text-gray-500 mb-1">Caller ID</p>
                                            <p className="text-sm font-medium text-gray-900">{secretData.caller_id}</p>
                                        </div>
                                    )}
                                    <div className={`rounded-lg p-4 border ${secretData.is_connected ? 'bg-green-50 border-green-200' : secretData.disabled === 'true' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                                        <p className={`text-xs font-medium mb-1 ${secretData.is_connected ? 'text-green-700' : secretData.disabled === 'true' ? 'text-red-700' : 'text-gray-700'}`}>Status Koneksi</p>
                                        <p className={`text-sm font-semibold ${secretData.is_connected ? 'text-green-900' : secretData.disabled === 'true' ? 'text-red-900' : 'text-gray-900'}`}>
                                            {secretData.disabled === 'true' 
                                                ? '🔴 Disabled' 
                                                : secretData.is_connected 
                                                    ? '🟢 Online (Connected)' 
                                                    : '🟡 Offline (Not Connected)'}
                                        </p>
                                        {secretData.is_connected && (
                                            <p className="text-xs text-green-600 mt-1">Sedang terhubung ke MikroTik</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <p className="text-gray-500">Gagal memuat informasi secret</p>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                            <button
                                onClick={() => setShowSecretModal(false)}
                                className="w-full py-2.5 bg-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-300 transition"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Compensation Modal */}
            {showCompensationModal && compensationCustomer && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-full flex items-center justify-center">
                                    <Gift size={24} className="text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Berikan Kompensasi</h2>
                                    <p className="text-sm text-gray-500">{compensationCustomer.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCompensationModal(false)}
                                className="text-gray-400 hover:text-gray-600 transition"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmitCompensation} className="p-6 space-y-6">
                            <div>
                                <p className="text-sm text-gray-600 mb-2">Jatuh tempo saat ini:</p>
                                <p className="text-lg font-semibold text-gray-900">{compensationCustomer.due_date || '-'}</p>
                            </div>

                            {/* Quick Actions */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    Tambah Waktu
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleAddDays(1)}
                                        className="px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition font-medium"
                                    >
                                        +1 Hari
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAddDays(2)}
                                        className="px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition font-medium"
                                    >
                                        +2 Hari
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAddDays(3)}
                                        className="px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition font-medium"
                                    >
                                        +3 Hari
                                    </button>
                                </div>
                            </div>

                            {/* Manual Date Input */}
                            <div>
                                <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-2">
                                    Atau Pilih Tanggal Manual
                                </label>
                                <input
                                    type="date"
                                    id="dueDate"
                                    value={newDueDate}
                                    onChange={(e) => setNewDueDate(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                    required
                                />
                            </div>

                            {/* New Due Date Preview */}
                            {newDueDate && (
                                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                                    <p className="text-sm text-teal-700 mb-1">Jatuh tempo baru:</p>
                                    <p className="text-lg font-bold text-teal-900">{newDueDate}</p>
                                </div>
                            )}

                            {/* Submit Button */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCompensationModal(false)}
                                    className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-300 transition"
                                    disabled={submittingCompensation}
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-medium rounded-xl hover:from-teal-600 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={submittingCompensation}
                                >
                                    {submittingCompensation ? 'Menyimpan...' : 'Berikan Kompensasi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomersPage;
