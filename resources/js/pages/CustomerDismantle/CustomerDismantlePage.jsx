import { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Calendar,
    Camera,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    Download,
    ExternalLink,
    Eye,
    FileSpreadsheet,
    FileText,
    Filter,
    HardHat,
    Home,
    Image as ImageIcon,
    Info,
    Layers,
    LayoutGrid,
    List,
    Loader2,
    MapPin,
    Navigation,
    Network,
    Phone,
    Plus,
    Printer,
    Radio,
    RefreshCw,
    RotateCcw,
    Router,
    Search,
    Send,
    Shield,
    Sparkles,
    Trash2,
    Unplug,
    Upload,
    User,
    UserX,
    Users,
    Wrench,
    X,
} from 'lucide-react';
import customerDismantleService from '../../services/customerDismantleService';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';

const STATUS_CONFIG = {
    siap_dicopot: {
        label: 'Siap Dicopot',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        dotClass: 'bg-amber-500',
    },
    proses: {
        label: 'Dalam Proses',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
        dotClass: 'bg-blue-500',
    },
    sudah_dicopot: {
        label: 'Sudah Dicopot',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        dotClass: 'bg-emerald-500',
    },
    batal_bayar: {
        label: 'Batal (Bayar / Janji)',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
        dotClass: 'bg-purple-500',
    },
};

const ITEM_CHECKLIST_OPTIONS = [
    { key: 'ont', label: 'Modem / ONT Utama' },
    { key: 'adaptor', label: 'Adaptor Daya Listrik' },
    { key: 'dropcore', label: 'Kabel Dropcore Penarikan' },
    { key: 'patchcord', label: 'Patchcord & Roset Optik' },
];

export default function CustomerDismantlePage() {
    const userRole = String(window.appUserRole || 'admin').toLowerCase().trim();
    const isSuperAdminOrAdmin = ['superadmin', 'admin'].includes(userRole);

    // Data state
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState({
        total_eligible: 0,
        total_ready: 0,
        total_in_progress: 0,
        total_retrieved: 0,
        total_cancelled: 0,
        total_unpaid_amount: 0,
        with_photos_count: 0,
        average_days_off: 0,
    });
    const [filterOptions, setFilterOptions] = useState({
        kecamatans: [],
        odps: [],
        technicians: [],
    });

    // Alert feedback state
    const [alert, setAlert] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    // View mode: 'card' or 'table'
    const [viewMode, setViewMode] = useState('card');

    // Filter controls
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [agingFilter, setAgingFilter] = useState('all');
    const [hasPhotoFilter, setHasPhotoFilter] = useState('all');
    const [kecamatanFilter, setKecamatanFilter] = useState('');
    const [odpFilter, setOdpFilter] = useState('');
    const [sortBy, setSortBy] = useState('days_off_desc');

    // Modals
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [dispatchItem, setDispatchItem] = useState(null);
    const [targetTechnicianPhone, setTargetTechnicianPhone] = useState('');
    const [statusModalItem, setStatusModalItem] = useState(null);

    // Status Modal Form State
    const [statusForm, setStatusForm] = useState({
        status: 'sudah_dicopot',
        notes: '',
        technician_name: '',
        retrieved_items: ['ont', 'adaptor'],
        proof_photo_file: null,
        proof_photo_preview: null,
    });

    // Fetch data
    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {
                search: search || undefined,
                status: statusFilter !== 'all' ? statusFilter : undefined,
                aging_months: agingFilter !== 'all' ? agingFilter : undefined,
                has_photo: hasPhotoFilter !== 'all' ? hasPhotoFilter : undefined,
                kecamatan_id: kecamatanFilter || undefined,
                odp_id: odpFilter || undefined,
                sort_by: sortBy,
            };
            const response = await customerDismantleService.list(params);
            const data = response?.data || {};
            setItems(data.items || []);
            setSummary(data.summary || {});
            if (data.filter_options) {
                setFilterOptions(data.filter_options);
            }
        } catch (err) {
            console.error('Gagal mengambil data pelanggan dicopot:', err);
            setAlert({
                type: 'error',
                message: err.response?.data?.message || 'Gagal memuat data pelanggan yang bisa dicopot.',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [statusFilter, agingFilter, hasPhotoFilter, kecamatanFilter, odpFilter, sortBy]);

    // Debounced search
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchData();
        }, 350);
        return () => clearTimeout(handler);
    }, [search]);

    // Copy to clipboard helper
    const handleCopy = (text, id = 'common') => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2200);
    };

    // Open Dispatch / WA share modal
    const handleOpenDispatch = (item) => {
        setDispatchItem(item);
        setTargetTechnicianPhone('');
    };

    // Open Status Edit modal
    const handleOpenStatusModal = (item) => {
        setStatusModalItem(item);
        setStatusForm({
            status: item.dismantle_status === 'siap_dicopot' ? 'sudah_dicopot' : item.dismantle_status,
            notes: item.dismantle_notes || '',
            technician_name: item.technician_name || (filterOptions.technicians?.[0]?.name || ''),
            retrieved_items: Array.isArray(item.retrieved_items) && item.retrieved_items.length > 0
                ? item.retrieved_items
                : ['ont', 'adaptor'],
            proof_photo_file: null,
            proof_photo_preview: item.proof_photo_url || null,
        });
    };

    // Toggle checklist item
    const toggleChecklistItem = (key) => {
        setStatusForm((prev) => {
            const exists = prev.retrieved_items.includes(key);
            return {
                ...prev,
                retrieved_items: exists
                    ? prev.retrieved_items.filter((k) => k !== key)
                    : [...prev.retrieved_items, key],
            };
        });
    };

    // Handle photo file change
    const handleProofFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setStatusForm((prev) => ({
                ...prev,
                proof_photo_file: file,
                proof_photo_preview: URL.createObjectURL(file),
            }));
        }
    };

    // Submit Status Update
    const handleSubmitStatus = async (e) => {
        e.preventDefault();
        if (!statusModalItem) return;

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('status', statusForm.status);
            formData.append('notes', statusForm.notes || '');
            formData.append('technician_name', statusForm.technician_name || '');
            statusForm.retrieved_items.forEach((item) => {
                formData.append('retrieved_items[]', item);
            });
            if (statusForm.proof_photo_file) {
                formData.append('proof_photo', statusForm.proof_photo_file);
            }

            const response = await customerDismantleService.updateStatus(statusModalItem.id, formData);
            setAlert({
                type: 'success',
                message: response?.data?.message || 'Status pencopotan berhasil diperbarui.',
            });
            setStatusModalItem(null);
            fetchData();
        } catch (err) {
            console.error('Gagal memperbarui status:', err);
            setAlert({
                type: 'error',
                message: err.response?.data?.message || 'Gagal menyimpan status pencopotan.',
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Format currency
    const formatRp = (num) => 'Rp ' + Number(num || 0).toLocaleString('id-ID');

    // Print SPK
    const handlePrintWorkOrders = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-slate-50/70 p-4 md:p-6 lg:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 print:hidden">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-rose-100 text-rose-700 shadow-sm ring-1 ring-rose-200">
                            <Unplug className="w-6 h-6" />
                        </span>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                                Alat Pelanggan Yang Bisa Dicopot
                            </h1>
                            <p className="text-sm text-slate-500">
                                Daftar pelanggan yang <span className="font-semibold text-rose-600">OFF &gt; 2 Bulan (60+ hari tidak bayar)</span> untuk penugasan penarikan perangkat ONT, Adaptor, dan Kabel oleh teknisi.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handlePrintWorkOrders}
                        className="flex items-center gap-1.5 shadow-sm"
                    >
                        <Printer className="w-4 h-4 text-slate-600" />
                        <span>Cetak SPK Pencopotan</span>
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={fetchData}
                        disabled={loading}
                        className="flex items-center gap-1.5 shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                    </Button>
                </div>
            </div>

            {/* Print Header (Only visible during print) */}
            <div className="hidden print:block mb-6 border-b-2 border-slate-900 pb-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold uppercase tracking-wider text-slate-900">
                            Surat Perintah Kerja (SPK) Pencopotan Perangkat
                        </h2>
                        <p className="text-xs text-slate-600">
                            Rumah Kita Net — ISP Management System | Dicetak pada: {new Date().toLocaleString('id-ID')}
                        </p>
                    </div>
                    <div className="text-right text-xs">
                        <p className="font-semibold">Kriteria Penarikan:</p>
                        <p className="text-slate-600">Pelanggan OFF / Menunggak &gt; 2 Bulan</p>
                    </div>
                </div>
            </div>

            {/* Feedback Alert */}
            {alert && (
                <div className="print:hidden">
                    <Alert
                        type={alert.type}
                        message={alert.message}
                        onClose={() => setAlert(null)}
                    />
                </div>
            )}

            {/* Top KPI Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4">
                {/* 1. Siap Dicopot */}
                <div className="bg-white rounded-2xl p-4 border border-amber-200/80 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                            Siap Dicopot
                        </span>
                        <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                            <Unplug className="w-5 h-5" />
                        </span>
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold text-amber-900">
                        {summary.total_ready || 0}
                    </div>
                    <div className="text-xs text-amber-700/80 mt-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Perlu ditugaskan ke teknisi</span>
                    </div>
                </div>

                {/* 2. Dalam Proses */}
                <div className="bg-white rounded-2xl p-4 border border-blue-200/80 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                            Dalam Proses
                        </span>
                        <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                            <HardHat className="w-5 h-5" />
                        </span>
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold text-blue-900">
                        {summary.total_in_progress || 0}
                    </div>
                    <div className="text-xs text-blue-700/80 mt-1 flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" />
                        <span>Teknisi sedang berjalan</span>
                    </div>
                </div>

                {/* 3. Sudah Dicopot */}
                <div className="bg-white rounded-2xl p-4 border border-emerald-200/80 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                            Sudah Dicopot
                        </span>
                        <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                            <CheckCircle2 className="w-5 h-5" />
                        </span>
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold text-emerald-900">
                        {summary.total_retrieved || 0}
                    </div>
                    <div className="text-xs text-emerald-700/80 mt-1 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Perangkat berhasil ditarik</span>
                    </div>
                </div>

                {/* 4. Total Tunggakan Tertahan */}
                <div className="bg-white rounded-2xl p-4 border border-rose-200/80 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                            Tunggakan Belum Bayar
                        </span>
                        <span className="p-2 rounded-xl bg-rose-50 text-rose-600">
                            <AlertCircle className="w-5 h-5" />
                        </span>
                    </div>
                    <div className="text-xl md:text-2xl font-extrabold text-rose-900 truncate">
                        {formatRp(summary.total_unpaid_amount)}
                    </div>
                    <div className="text-xs text-rose-700/80 mt-1 flex items-center gap-1">
                        <span>Rata-rata OFF: {summary.average_days_off || 0} hari</span>
                    </div>
                </div>
            </div>

            {/* Filter and Control Toolbar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4 print:hidden">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    {/* Search box */}
                    <div className="md:col-span-4 relative">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cari nama, PPPoE, HP, ODP, atau alamat..."
                            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filter Status */}
                    <div className="md:col-span-2">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                            <option value="all">Semua Status</option>
                            <option value="siap_dicopot">Siap Dicopot</option>
                            <option value="proses">Dalam Proses</option>
                            <option value="sudah_dicopot">Sudah Dicopot</option>
                            <option value="batal_bayar">Batal (Bayar)</option>
                        </select>
                    </div>

                    {/* Filter Lama OFF */}
                    <div className="md:col-span-2">
                        <select
                            value={agingFilter}
                            onChange={(e) => setAgingFilter(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                            <option value="all">Semua Lama OFF (&gt;2 Bln)</option>
                            <option value="2_3">2 - 3 Bulan (60-89 hr)</option>
                            <option value="3_6">3 - 6 Bulan (90-179 hr)</option>
                            <option value="6_plus">&gt; 6 Bulan (180+ hr)</option>
                        </select>
                    </div>

                    {/* Filter Kecamatan */}
                    <div className="md:col-span-2">
                        <select
                            value={kecamatanFilter}
                            onChange={(e) => setKecamatanFilter(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 truncate"
                        >
                            <option value="">Semua Kecamatan</option>
                            {(filterOptions.kecamatans || []).map((k) => (
                                <option key={k.id} value={k.id}>
                                    Kec. {k.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Filter Foto Rumah */}
                    <div className="md:col-span-2">
                        <select
                            value={hasPhotoFilter}
                            onChange={(e) => setHasPhotoFilter(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                            <option value="all">Semua Foto</option>
                            <option value="with_photo">Ada Foto Rumah ({summary.with_photos_count || 0})</option>
                            <option value="without_photo">Tanpa Foto</option>
                        </select>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-3">
                        <span>Menampilkan <strong className="text-slate-800">{items.length}</strong> pelanggan</span>
                        <span>•</span>
                        <div className="flex items-center gap-1.5">
                            <span>Urutkan:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="bg-transparent font-medium text-slate-700 underline cursor-pointer focus:outline-none"
                            >
                                <option value="days_off_desc">Lama OFF Terlama</option>
                                <option value="days_off_asc">Lama OFF Terpendek</option>
                                <option value="amount_desc">Tunggakan Tertinggi</option>
                                <option value="name_asc">Nama Pelanggan (A-Z)</option>
                                <option value="odp_asc">Nama ODP (A-Z)</option>
                            </select>
                        </div>
                    </div>

                    {/* View mode toggle */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                        <button
                            onClick={() => setViewMode('card')}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                viewMode === 'card'
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span>Kartu</span>
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                viewMode === 'table'
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <List className="w-3.5 h-3.5" />
                            <span>Tabel</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            {loading ? (
                <div className="bg-white rounded-2xl p-16 border border-slate-200 text-center shadow-sm">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600">Memuat data pelanggan eligible pencopotan...</p>
                </div>
            ) : items.length === 0 ? (
                <div className="bg-white rounded-2xl p-16 border border-dashed border-slate-300 text-center shadow-sm">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-slate-800">
                        Tidak Ada Pelanggan Yang Memenuhi Kriteria
                    </h3>
                    <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                        Semua pelanggan terpantau tertib atau filter yang Anda pilih tidak menemukan hasil.
                    </p>
                    {(search || statusFilter !== 'all' || agingFilter !== 'all' || hasPhotoFilter !== 'all') && (
                        <button
                            onClick={() => {
                                setSearch('');
                                setStatusFilter('all');
                                setAgingFilter('all');
                                setHasPhotoFilter('all');
                                setKecamatanFilter('');
                                setOdpFilter('');
                            }}
                            className="mt-4 px-4 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all"
                        >
                            Reset Semua Filter
                        </button>
                    )}
                </div>
            ) : viewMode === 'card' ? (
                /* Card Grid View (Ideal for technicians and visual check) */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 print:grid-cols-2">
                    {items.map((item) => {
                        const statusConf = STATUS_CONFIG[item.dismantle_status] || STATUS_CONFIG.siap_dicopot;
                        return (
                            <div
                                key={item.id}
                                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                            >
                                {/* Top Banner / Photo */}
                                <div className="relative bg-slate-100 h-44 w-full flex items-center justify-center overflow-hidden border-b border-slate-200">
                                    {item.foto_depan_rumah ? (
                                        <>
                                            <img
                                                src={item.foto_depan_rumah}
                                                alt={`Rumah ${item.name}`}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
                                                onClick={() => setSelectedPhoto({ url: item.foto_depan_rumah, title: `Foto Rumah: ${item.name}`, address: item.address })}
                                            />
                                            <div
                                                onClick={() => setSelectedPhoto({ url: item.foto_depan_rumah, title: `Foto Rumah: ${item.name}`, address: item.address })}
                                                className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                            >
                                                <span className="bg-white/90 text-slate-900 text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 shadow-md">
                                                    <Eye className="w-3.5 h-3.5" /> Lihat Foto Penuh
                                                </span>
                                            </div>
                                            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-medium backdrop-blur-sm flex items-center gap-1">
                                                <Camera className="w-3 h-3" /> Fasad Rumah
                                            </span>
                                        </>
                                    ) : (
                                        <div className="text-center p-6 text-slate-400">
                                            <Home className="w-10 h-10 mx-auto mb-1 stroke-1 text-slate-300" />
                                            <span className="text-xs font-medium">Belum ada foto rumah</span>
                                        </div>
                                    )}

                                    {/* Status Badge Over Photo */}
                                    <span className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-sm backdrop-blur-sm ${statusConf.badgeClass} flex items-center gap-1.5`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dotClass}`} />
                                        {statusConf.label}
                                    </span>

                                    {/* Overdue Badge Over Photo */}
                                    <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-600/90 text-white shadow-sm backdrop-blur-sm flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        OFF {item.days_off} Hari
                                    </span>
                                </div>

                                {/* Body Information */}
                                <div className="p-4 space-y-3 flex-1">
                                    {/* Customer Identity */}
                                    <div>
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="font-bold text-slate-900 text-base leading-tight">
                                                {item.name}
                                            </h3>
                                            <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 shrink-0">
                                                {item.total_unpaid_amount_formatted}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                PPPoE: <strong className="text-slate-800">{item.pppoe_username}</strong>
                                            </span>
                                            <button
                                                onClick={() => handleCopy(item.pppoe_username, `pppoe-${item.id}`)}
                                                className="text-slate-400 hover:text-slate-700 transition-colors"
                                                title="Salin PPPoE"
                                            >
                                                {copiedId === `pppoe-${item.id}` ? (
                                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Phone & WA */}
                                    <div className="flex items-center gap-2 text-xs">
                                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                                            <span>{item.phone || 'Tanpa No. HP'}</span>
                                        </div>
                                        {item.whatsapp_direct_url && (
                                            <a
                                                href={item.whatsapp_direct_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-emerald-600 hover:text-emerald-800 font-semibold flex items-center gap-1 ml-auto"
                                            >
                                                <span>Chat WA</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>

                                    {/* Address & Google Maps */}
                                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-150 space-y-1.5 text-xs">
                                        <div className="flex items-start gap-1.5 text-slate-700">
                                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                                            <div className="flex-1 leading-snug">
                                                <p className="font-medium text-slate-800">{item.address}</p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">{item.region_label}</p>
                                            </div>
                                        </div>

                                        <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between">
                                            <span className="text-[11px] text-slate-500">
                                                {item.has_coordinates ? '📍 GPS Tersedia' : '🗺️ Berdasarkan Alamat'}
                                            </span>
                                            <a
                                                href={item.google_maps_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                                            >
                                                <Navigation className="w-3 h-3" />
                                                <span>Buka Google Maps</span>
                                            </a>
                                        </div>
                                    </div>

                                    {/* ODP & Hardware Details */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-150">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                                ODP / Port
                                            </span>
                                            <span className="font-semibold text-slate-800 truncate block">
                                                {item.odp_name} <span className="text-indigo-600">(Port {item.odp_port})</span>
                                            </span>
                                        </div>
                                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-150">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                                Perangkat Router
                                            </span>
                                            <span className="font-semibold text-slate-800 truncate block">
                                                {item.home_router_type}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Dismantle Notes / Proof Preview if available */}
                                    {item.dismantle_notes && (
                                        <div className="text-[11px] bg-amber-50 text-amber-900 border border-amber-200/80 rounded-lg p-2 leading-relaxed">
                                            <strong>Catatan Teknisi:</strong> {item.dismantle_notes}
                                            {item.technician_name && (
                                                <span className="block text-[10px] text-amber-700/80 mt-0.5">
                                                    Petugas: {item.technician_name} {item.retrieved_at_human && `(${item.retrieved_at_human})`}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {item.proof_photo_url && (
                                        <button
                                            onClick={() => setSelectedPhoto({ url: item.proof_photo_url, title: `Bukti Pencopotan: ${item.name}`, address: item.address })}
                                            className="w-full text-xs py-1.5 px-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition-all"
                                        >
                                            <ImageIcon className="w-3.5 h-3.5" />
                                            <span>Lihat Bukti Foto Pencopotan</span>
                                        </button>
                                    )}
                                </div>

                                {/* Footer Action Buttons */}
                                <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex items-center gap-2 print:hidden">
                                    <button
                                        onClick={() => handleOpenDispatch(item)}
                                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                                    >
                                        <Send className="w-3.5 h-3.5" />
                                        <span>Kirim ke Teknisi</span>
                                    </button>

                                    <button
                                        onClick={() => handleOpenStatusModal(item)}
                                        className="py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                                    >
                                        <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Update Status</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Table View (Dense data view for admin office) */
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px]">
                                <tr>
                                    <th className="py-3 px-4">Pelanggan</th>
                                    <th className="py-3 px-4">Lama OFF & Tagihan</th>
                                    <th className="py-3 px-4">Alamat & Navigasi</th>
                                    <th className="py-3 px-4">ODP & Perangkat</th>
                                    <th className="py-3 px-4">Foto Rumah</th>
                                    <th className="py-3 px-4">Status Pencopotan</th>
                                    <th className="py-3 px-4 text-right print:hidden">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {items.map((item) => {
                                    const statusConf = STATUS_CONFIG[item.dismantle_status] || STATUS_CONFIG.siap_dicopot;
                                    return (
                                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                                            {/* Pelanggan */}
                                            <td className="py-3 px-4">
                                                <div className="font-bold text-slate-900 text-sm">{item.name}</div>
                                                <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                                                    PPPoE: <strong className="text-slate-800">{item.pppoe_username}</strong>
                                                </div>
                                                <div className="text-slate-600 text-[11px] mt-0.5 flex items-center gap-1">
                                                    <Phone className="w-3 h-3 text-slate-400" />
                                                    <span>{item.phone || '-'}</span>
                                                </div>
                                            </td>

                                            {/* Lama OFF & Tagihan */}
                                            <td className="py-3 px-4">
                                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 mb-1">
                                                    OFF {item.days_off} Hari (~{item.months_off} Bln)
                                                </span>
                                                <div className="font-bold text-slate-900">{item.total_unpaid_amount_formatted}</div>
                                                <div className="text-[11px] text-slate-500">{item.unpaid_invoices_count} Tagihan tertunda</div>
                                            </td>

                                            {/* Alamat & Maps */}
                                            <td className="py-3 px-4 max-w-xs">
                                                <div className="font-medium text-slate-800 truncate" title={item.address}>
                                                    {item.address}
                                                </div>
                                                <div className="text-[11px] text-slate-500 truncate">{item.region_label}</div>
                                                <a
                                                    href={item.google_maps_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline mt-1"
                                                >
                                                    <Navigation className="w-3 h-3" />
                                                    <span>Google Maps</span>
                                                </a>
                                            </td>

                                            {/* ODP & Perangkat */}
                                            <td className="py-3 px-4">
                                                <div className="font-semibold text-slate-800">
                                                    {item.odp_name} <span className="text-indigo-600">(P{item.odp_port})</span>
                                                </div>
                                                <div className="text-[11px] text-slate-500">{item.home_router_type}</div>
                                                <div className="text-[10px] text-slate-400">Kabel: {item.dropcore_length_label}</div>
                                            </td>

                                            {/* Foto Rumah */}
                                            <td className="py-3 px-4">
                                                {item.foto_depan_rumah ? (
                                                    <div
                                                        onClick={() => setSelectedPhoto({ url: item.foto_depan_rumah, title: `Foto Rumah: ${item.name}`, address: item.address })}
                                                        className="w-14 h-12 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all relative group"
                                                    >
                                                        <img
                                                            src={item.foto_depan_rumah}
                                                            alt={item.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-slate-400 italic">Tanpa Foto</span>
                                                )}
                                            </td>

                                            {/* Status Pencopotan */}
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusConf.badgeClass}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dotClass}`} />
                                                    {statusConf.label}
                                                </span>
                                                {item.technician_name && (
                                                    <div className="text-[10px] text-slate-500 mt-1">
                                                        Teknisi: {item.technician_name}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Aksi */}
                                            <td className="py-3 px-4 text-right space-x-2 print:hidden">
                                                <button
                                                    onClick={() => handleOpenDispatch(item)}
                                                    className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                                                    title="Kirim ke WA Teknisi"
                                                >
                                                    <Send className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleOpenStatusModal(item)}
                                                    className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
                                                    title="Update Status Pencopotan"
                                                >
                                                    <Wrench className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal: Fullscreen Photo Lightbox */}
            {selectedPhoto && (
                <Modal
                    isOpen={!!selectedPhoto}
                    onClose={() => setSelectedPhoto(null)}
                    title={selectedPhoto.title || 'Foto Pelanggan'}
                    size="3xl"
                >
                    <div className="space-y-4">
                        <div className="relative rounded-2xl overflow-hidden bg-black/90 flex items-center justify-center max-h-[75vh]">
                            <img
                                src={selectedPhoto.url}
                                alt="Foto Preview"
                                className="max-w-full max-h-[70vh] object-contain rounded-lg"
                            />
                        </div>
                        {selectedPhoto.address && (
                            <p className="text-xs text-slate-600 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                <span>{selectedPhoto.address}</span>
                            </p>
                        )}
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <a
                                href={selectedPhoto.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 inline-flex items-center gap-1.5"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Buka di Tab Baru</span>
                            </a>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setSelectedPhoto(null)}
                            >
                                Tutup
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal: Dispatch / Share WA ke Teknisi */}
            {dispatchItem && (
                <Modal
                    isOpen={!!dispatchItem}
                    onClose={() => setDispatchItem(null)}
                    title="Kirim Instruksi Pencopotan ke Teknisi"
                    size="xl"
                >
                    <div className="space-y-4 text-xs">
                        {/* Target Technician Selector */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                            <label className="font-bold text-slate-800 block">
                                Pilih Teknisi Penerima Tugas:
                            </label>
                            <select
                                value={targetTechnicianPhone}
                                onChange={(e) => setTargetTechnicianPhone(e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                            >
                                <option value="">-- Buka WhatsApp Umum (Pilih Kontak Manual di WA) --</option>
                                {(filterOptions.technicians || []).map((t) => (
                                    <option key={t.id} value={t.phone || ''}>
                                        {t.name} ({t.phone || 'Tanpa No. HP'})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* WhatsApp Message Preview Box */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="font-bold text-slate-700">Preview Teks Pesan WhatsApp:</span>
                                <button
                                    onClick={() => handleCopy(dispatchItem.share_wa_text, 'dispatch-text')}
                                    className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                                >
                                    {copiedId === 'dispatch-text' ? (
                                        <>
                                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                                            <span className="text-emerald-600">Berhasil Disalin!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>Salin Teks</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <textarea
                                readOnly
                                rows={10}
                                value={dispatchItem.share_wa_text}
                                className="w-full p-3 font-mono text-[11px] bg-slate-900 text-slate-100 rounded-xl border border-slate-800 focus:outline-none leading-relaxed"
                            />
                        </div>

                        {/* Action buttons */}
                        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDispatchItem(null)}
                            >
                                Batal
                            </Button>

                            <div className="flex items-center gap-2">
                                <a
                                    href={
                                        targetTechnicianPhone
                                            ? `https://wa.me/${targetTechnicianPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(dispatchItem.share_wa_text)}`
                                            : dispatchItem.share_wa_url
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-2 shadow-sm transition-all"
                                >
                                    <Send className="w-4 h-4" />
                                    <span>Kirim ke WhatsApp</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal: Update Status Pencopotan Perangkat */}
            {statusModalItem && (
                <Modal
                    isOpen={!!statusModalItem}
                    onClose={() => setStatusModalItem(null)}
                    title={`Update Status Pencopotan: ${statusModalItem.name}`}
                    size="xl"
                >
                    <form onSubmit={handleSubmitStatus} className="space-y-4 text-xs">
                        {/* Customer Info Header in Modal */}
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                                <span className="font-bold text-slate-900 block">{statusModalItem.name}</span>
                                <span className="text-slate-500 font-mono text-[11px]">PPPoE: {statusModalItem.pppoe_username}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-rose-700 font-bold block">{statusModalItem.total_unpaid_amount_formatted}</span>
                                <span className="text-[10px] text-slate-400">OFF {statusModalItem.days_off} Hari</span>
                            </div>
                        </div>

                        {/* Status Radio / Select */}
                        <div>
                            <label className="font-bold text-slate-800 block mb-1.5">
                                Status Pencopotan <span className="text-rose-500">*</span>:
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
                                    <button
                                        type="button"
                                        key={key}
                                        onClick={() => setStatusForm((prev) => ({ ...prev, status: key }))}
                                        className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all ${
                                            statusForm.status === key
                                                ? `${conf.badgeClass} ring-2 ring-indigo-500/30 shadow-sm`
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        {conf.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Checklist Retrieved Items (if sudah_dicopot or proses) */}
                        <div>
                            <label className="font-bold text-slate-800 block mb-1.5">
                                Daftar Perangkat Yang Ditarik:
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {ITEM_CHECKLIST_OPTIONS.map((item) => {
                                    const checked = statusForm.retrieved_items.includes(item.key);
                                    return (
                                        <button
                                            type="button"
                                            key={item.key}
                                            onClick={() => toggleChecklistItem(item.key)}
                                            className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                                                checked
                                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span
                                                className={`w-4 h-4 rounded-md flex items-center justify-center border text-[10px] ${
                                                    checked
                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                        : 'border-slate-300 bg-white'
                                                }`}
                                            >
                                                {checked && <Check className="w-3 h-3 stroke-[3]" />}
                                            </span>
                                            <span>{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Nama Teknisi Pelaksana */}
                        <div>
                            <label className="font-bold text-slate-800 block mb-1">
                                Nama Teknisi Pelaksana:
                            </label>
                            <input
                                type="text"
                                value={statusForm.technician_name}
                                onChange={(e) => setStatusForm((prev) => ({ ...prev, technician_name: e.target.value }))}
                                placeholder="Contoh: Budi & Dani"
                                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>

                        {/* Upload Proof Photo */}
                        <div>
                            <label className="font-bold text-slate-800 block mb-1">
                                Upload Foto Bukti Pencopotan (Opsional):
                            </label>
                            <div className="flex items-center gap-3">
                                <label className="cursor-pointer px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold inline-flex items-center gap-2 border border-slate-200 transition-all">
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Pilih Foto Bukti</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleProofFileChange}
                                        className="hidden"
                                    />
                                </label>
                                {statusForm.proof_photo_preview && (
                                    <div className="flex items-center gap-2">
                                        <img
                                            src={statusForm.proof_photo_preview}
                                            alt="Preview"
                                            className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                                        />
                                        <span className="text-[11px] text-emerald-600 font-semibold">Foto siap diupload</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="font-bold text-slate-800 block mb-1">
                                Catatan Lapangan / Keterangan:
                            </label>
                            <textarea
                                rows={3}
                                value={statusForm.notes}
                                onChange={(e) => setStatusForm((prev) => ({ ...prev, notes: e.target.value }))}
                                placeholder="Contoh: Modem ONT Fiberhome ditarik kondisi utuh. Pelanggan tidak ada di tempat, diterima oleh istri."
                                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                        </div>

                        {/* Submit Actions */}
                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={submitting}
                                onClick={() => setStatusModalItem(null)}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                disabled={submitting}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Menyimpan...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Simpan Status</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
