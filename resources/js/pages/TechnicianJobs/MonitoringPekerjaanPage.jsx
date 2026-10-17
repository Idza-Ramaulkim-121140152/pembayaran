import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Check,
    CheckCircle2,
    ChevronDown,
    Clock,
    Copy,
    ExternalLink,
    Eye,
    Filter,
    HardHat,
    Image as ImageIcon,
    Loader2,
    MapPin,
    MessageSquare,
    Phone,
    Plus,
    RefreshCw,
    Search,
    Send,
    Shield,
    Upload,
    User,
    UserCheck,
    Users,
    Wrench,
    X,
    XCircle,
    Radio,
    Calendar,
    Sparkles,
} from 'lucide-react';
import apiClient from '../../services/api';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';

export default function MonitoringPekerjaanPage() {
    const [searchParams] = useSearchParams();
    const userRole = String(window.appUserRole || 'admin').toLowerCase().trim();
    const currentUserId = window.appUserId ? Number(window.appUserId) : null;
    const isSuperAdminOrAdmin = ['superadmin', 'admin'].includes(userRole);

    const [loading, setLoading] = useState(true);
    const [jobs, setJobs] = useState([]);
    const [counts, setCounts] = useState({ total: 0, active: 0, completed: 0, cancelled: 0, gangguan_today: 0 });
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Filters
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'all' | 'completed' | 'cancelled'
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [technicianFilter, setTechnicianFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Reference data
    const [techniciansList, setTechniciansList] = useState([]);
    const [odpList, setOdpList] = useState([]);
    const [kecamatanList, setKecamatanList] = useState([]);
    const [desaList, setDesaList] = useState([]);

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
    const [phoneModalTech, setPhoneModalTech] = useState(null);
    const [phoneInput, setPhoneInput] = useState('');
    const [savingPhone, setSavingPhone] = useState(false);

    // Resolution Modal
    const [resolveModal, setResolveModal] = useState({
        open: false,
        job: null,
        notes: '',
        proofFile: null,
        proofPreview: null,
        submitting: false,
    });

    // Detail Modal
    const [detailModal, setDetailModal] = useState({
        open: false,
        job: null,
    });

    // Cancel Modal
    const [cancelModal, setCancelModal] = useState({
        open: false,
        job: null,
        notes: '',
        submitting: false,
    });

    // Copy Feedback
    const [copiedJobId, setCopiedJobId] = useState(null);

    // Create Form State
    const [formData, setFormData] = useState({
        type: 'gangguan_pelanggan',
        title: '',
        description: '',
        priority: 'normal',
        technician_ids: [],
        customer_id: '',
        scope_type: 'single', // 'single' | 'odp' | 'wilayah' | 'mass_customers'
        odp_id: '',
        wilayah_type: 'desa',
        wilayah_id: '',
        customer_ids: [],
    });

    // Customer search states for modal
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerSearchResults, setCustomerSearchResults] = useState([]);
    const [searchingCustomer, setSearchingCustomer] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // Mass Customer Multi-Select State
    const [massCustomerSearch, setMassCustomerSearch] = useState('');
    const [massCustomerSearchResults, setMassCustomerSearchResults] = useState([]);
    const [selectedMassCustomers, setSelectedMassCustomers] = useState([]);

    const [submittingJob, setSubmittingJob] = useState(false);

    // Fetch initial data
    useEffect(() => {
        fetchJobs();
        fetchTechnicians();
        fetchOdps();
        fetchKecamatan();
    }, [activeTab, typeFilter, priorityFilter, technicianFilter, dateFrom, dateTo]);

    // Check URL query parameters (e.g. ?job=123 or ?action=new)
    useEffect(() => {
        const jobIdParam = searchParams.get('job') || searchParams.get('job_id');
        if (jobIdParam && jobs.length > 0) {
            const found = jobs.find((j) => String(j.id) === String(jobIdParam));
            if (found) {
                setDetailModal({ open: true, job: found });
            }
        }

        const actionParam = searchParams.get('action');
        if (actionParam === 'new') {
            setIsCreateModalOpen(true);
        }
    }, [searchParams, jobs]);

    const fetchJobs = async () => {
        try {
            setLoading(true);
            setError(null);
            const params = {
                status: activeTab,
                type: typeFilter,
                priority: priorityFilter,
                technician_id: technicianFilter || undefined,
                search: searchQuery || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
            };

            const response = await apiClient.get('/technician-jobs', { params });
            if (response.data?.success) {
                setJobs(response.data.data || []);
                setCounts(response.data.counts || { total: 0, active: 0, completed: 0, cancelled: 0, gangguan_today: 0 });
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat daftar pekerjaan');
        } finally {
            setLoading(false);
        }
    };

    const fetchTechnicians = async () => {
        try {
            const res = await apiClient.get('/technician-jobs/technicians');
            if (res.data?.success) {
                setTechniciansList(res.data.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch technicians', err);
        }
    };

    const fetchOdps = async () => {
        try {
            const res = await apiClient.get('/odp', { params: { per_page: 200 } });
            setOdpList(res.data?.data?.data || res.data?.data || []);
        } catch (err) {
            console.error('Failed to fetch ODPs', err);
        }
    };

    const fetchKecamatan = async () => {
        try {
            const res = await apiClient.get('/master-wilayah/kecamatan');
            setKecamatanList(res.data?.data || res.data || []);
        } catch (err) {
            console.error('Failed to fetch kecamatan', err);
        }
    };

    const fetchDesa = async (kecamatanId) => {
        if (!kecamatanId) {
            setDesaList([]);
            return;
        }
        try {
            const res = await apiClient.get('/master-wilayah/desa', { params: { kecamatan_id: kecamatanId } });
            setDesaList(res.data?.data || res.data || []);
        } catch (err) {
            console.error('Failed to fetch desa', err);
        }
    };

    // Customer search debounce for Gangguan 1 Rumah
    useEffect(() => {
        if (!customerSearch || customerSearch.length < 2) {
            setCustomerSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                setSearchingCustomer(true);
                const res = await apiClient.get('/customers', { params: { search: customerSearch, per_page: 8 } });
                const list = res.data?.data?.data || res.data?.data || [];
                setCustomerSearchResults(list);
            } catch (err) {
                console.error('Customer search error', err);
            } finally {
                setSearchingCustomer(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [customerSearch]);

    // Mass customer search debounce
    useEffect(() => {
        if (!massCustomerSearch || massCustomerSearch.length < 2) {
            setMassCustomerSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await apiClient.get('/customers', { params: { search: massCustomerSearch, per_page: 8 } });
                const list = res.data?.data?.data || res.data?.data || [];
                setMassCustomerSearchResults(list);
            } catch (err) {
                console.error('Mass customer search error', err);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [massCustomerSearch]);

    // Handle technician selection with Phone verification modal
    const handleTechnicianToggle = (tech) => {
        const isSelected = formData.technician_ids.includes(tech.id);

        if (isSelected) {
            setFormData((prev) => ({
                ...prev,
                technician_ids: prev.technician_ids.filter((id) => id !== tech.id),
            }));
            return;
        }

        // If tech has no phone, open Phone Input Modal!
        if (!tech.phone || String(tech.phone).trim() === '') {
            setPhoneModalTech(tech);
            setPhoneInput('');
            setIsPhoneModalOpen(true);
            return;
        }

        setFormData((prev) => ({
            ...prev,
            technician_ids: [...prev.technician_ids, tech.id],
        }));
    };

    // Save phone from modal
    const handleSaveTechnicianPhone = async () => {
        if (!phoneModalTech || !phoneInput.trim()) return;

        try {
            setSavingPhone(true);
            const res = await apiClient.put(`/technician-jobs/technicians/${phoneModalTech.id}/phone`, {
                phone: phoneInput.trim(),
            });

            if (res.data?.success) {
                const updatedUser = res.data.user;
                // Update local technicians list
                setTechniciansList((prev) =>
                    prev.map((t) => (t.id === updatedUser.id ? { ...t, phone: updatedUser.phone } : t))
                );

                // Auto-select technician now that phone is set
                setFormData((prev) => ({
                    ...prev,
                    technician_ids: [...new Set([...prev.technician_ids, updatedUser.id])],
                }));

                setIsPhoneModalOpen(false);
                setPhoneModalTech(null);
                setPhoneInput('');
                setSuccessMessage(`Nomor telepon untuk ${updatedUser.name} berhasil disimpan.`);
                setTimeout(() => setSuccessMessage(null), 4000);
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Gagal menyimpan nomor telepon teknisi');
        } finally {
            setSavingPhone(false);
        }
    };

    // Copy job summary text to clipboard
    const handleCopyJobText = async (job) => {
        try {
            const res = await apiClient.get(`/technician-jobs/${job.id}/copy-text`);
            const textToCopy = res.data?.text || job.formatted_copy_text;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                const ta = document.createElement('textarea');
                ta.value = textToCopy;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }

            setCopiedJobId(job.id);
            setTimeout(() => setCopiedJobId(null), 2500);
        } catch (err) {
            console.error('Copy failed', err);
        }
    };

    // Submit new job
    const handleSubmitJob = async (e) => {
        e.preventDefault();

        if (formData.technician_ids.length === 0) {
            alert('Pilih minimal 1 teknisi yang mengerjakan tugas ini.');
            return;
        }

        if (formData.type === 'gangguan_pelanggan' && !formData.customer_id) {
            alert('Pilih pelanggan yang mengalami gangguan.');
            return;
        }

        try {
            setSubmittingJob(true);
            setError(null);

            const payload = {
                type: formData.type,
                title: formData.title || (formData.type === 'gangguan_pelanggan' ? `Gangguan - ${selectedCustomer?.name || 'Pelanggan'}` : 'Pekerjaan Teknisi'),
                description: formData.description,
                priority: formData.priority,
                technician_ids: formData.technician_ids,
                customer_id: formData.customer_id || null,
                scope_type: formData.scope_type,
                odp_id: formData.scope_type === 'odp' ? formData.odp_id : null,
                wilayah_type: formData.scope_type === 'wilayah' ? formData.wilayah_type : null,
                wilayah_id: formData.scope_type === 'wilayah' ? formData.wilayah_id : null,
                customer_ids: formData.scope_type === 'mass_customers' ? selectedMassCustomers.map((c) => c.id) : [],
            };

            const res = await apiClient.post('/technician-jobs', payload);

            if (res.data?.success) {
                const notifInfo = res.data.notification;
                const notifText = notifInfo?.immediate
                    ? 'Pesan penugasan telah langsung dikirim ke WhatsApp teknisi.'
                    : 'Pekerjaan dibuat sebelum 08.00 WIB. Notifikasi WA dijadwalkan otomatis jam 08.00 WIB hari ini.';

                setSuccessMessage(`Pekerjaan #${res.data.data.job_number} berhasil dibuat! ${notifText}`);
                setTimeout(() => setSuccessMessage(null), 8000);

                setIsCreateModalOpen(false);
                resetCreateForm();
                fetchJobs();
            }
        } catch (err) {
            if (err.response?.data?.code === 'TECHNICIAN_MISSING_PHONE') {
                const tech = err.response.data.technician;
                setPhoneModalTech(tech);
                setPhoneInput('');
                setIsPhoneModalOpen(true);
            } else {
                setError(err.response?.data?.message || 'Gagal membuat pekerjaan');
            }
        } finally {
            setSubmittingJob(false);
        }
    };

    const resetCreateForm = () => {
        setFormData({
            type: 'gangguan_pelanggan',
            title: '',
            description: '',
            priority: 'normal',
            technician_ids: [],
            customer_id: '',
            scope_type: 'single',
            odp_id: '',
            wilayah_type: 'desa',
            wilayah_id: '',
            customer_ids: [],
        });
        setSelectedCustomer(null);
        setSelectedMassCustomers([]);
        setCustomerSearch('');
        setMassCustomerSearch('');
    };

    // Open resolve modal
    const handleOpenResolve = (job) => {
        setResolveModal({
            open: true,
            job,
            notes: '',
            proofFile: null,
            proofPreview: null,
            submitting: false,
        });
    };

    // Submit resolution
    const handleSubmitResolve = async () => {
        const { job, notes, proofFile } = resolveModal;
        if (!job) return;

        // If technician, proof & notes are mandatory!
        if (!isSuperAdminOrAdmin) {
            if (!proofFile) {
                alert('Bukti foto pengerjaan wajib dilampirkan oleh teknisi.');
                return;
            }
            if (!notes || notes.trim().length < 5) {
                alert('Catatan pengerjaan wajib diisi minimal 5 karakter.');
                return;
            }
        }

        try {
            setResolveModal((prev) => ({ ...prev, submitting: true }));
            const form = new FormData();
            if (notes) form.append('completion_notes', notes);
            if (proofFile) form.append('completion_proof', proofFile);

            const res = await apiClient.post(`/technician-jobs/${job.id}/resolve`, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (res.data?.success) {
                setSuccessMessage(`Pekerjaan #${job.job_number} berhasil diselesaikan.`);
                setTimeout(() => setSuccessMessage(null), 5000);
                setResolveModal({ open: false, job: null, notes: '', proofFile: null, proofPreview: null, submitting: false });
                fetchJobs();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Gagal menyelesaikan pekerjaan');
            setResolveModal((prev) => ({ ...prev, submitting: false }));
        }
    };

    // Submit cancellation
    const handleSubmitCancel = async () => {
        const { job, notes } = cancelModal;
        if (!job) return;

        try {
            setCancelModal((prev) => ({ ...prev, submitting: true }));
            const res = await apiClient.post(`/technician-jobs/${job.id}/cancel`, { notes });
            if (res.data?.success) {
                setSuccessMessage(`Pekerjaan #${job.job_number} berhasil dibatalkan.`);
                setTimeout(() => setSuccessMessage(null), 5000);
                setCancelModal({ open: false, job: null, notes: '', submitting: false });
                fetchJobs();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Gagal membatalkan pekerjaan');
            setCancelModal((prev) => ({ ...prev, submitting: false }));
        }
    };

    // Render Type Badge
    const renderTypeBadge = (type) => {
        switch (type) {
            case 'gangguan_pelanggan':
                return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"><Wrench size={12} /> Gangguan 1 Rumah</span>;
            case 'gangguan_massal':
                return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200"><Radio size={12} /> Gangguan Massal</span>;
            case 'pemasangan_baru':
                return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Plus size={12} /> Pemasangan Baru</span>;
            default:
                return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200"><HardHat size={12} /> Pekerjaan</span>;
        }
    };

    // Render Priority Badge
    const renderPriorityBadge = (priority) => {
        switch (priority) {
            case 'urgent':
                return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-600 text-white animate-pulse">🚨 Mendesak</span>;
            case 'high':
                return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500 text-white">⚠️ Tinggi</span>;
            default:
                return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">Normal</span>;
        }
    };

    // Render Status Badge
    const renderStatusBadge = (status) => {
        switch (status) {
            case 'completed':
                return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><CheckCircle2 size={13} /> Selesai</span>;
            case 'cancelled':
                return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700"><XCircle size={13} /> Dibatalkan</span>;
            default:
                return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800"><Activity size={13} className="animate-spin text-blue-600" /> Aktif</span>;
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <HardHat className="w-8 h-8 text-blue-600" />
                        Monitoring Pekerjaan
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Pusat pembuatan penugasan teknisi, monitoring gangguan, jadwal notifikasi WA jam 08.00 WIB, dan verifikasi penyelesaian.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        onClick={fetchJobs}
                        disabled={loading}
                        className="flex items-center gap-2 text-xs"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </Button>

                    {isSuperAdminOrAdmin && (
                        <Button
                            variant="primary"
                            onClick={() => {
                                resetCreateForm();
                                setIsCreateModalOpen(true);
                            }}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                        >
                            <Plus size={16} />
                            Buat Pekerjaan Baru
                        </Button>
                    )}
                </div>
            </div>

            {/* Alert Messages */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {successMessage && <Alert type="success" message={successMessage} onClose={() => setSuccessMessage(null)} />}

            {/* Summary Metrics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
                <div
                    onClick={() => setActiveTab('all')}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                        activeTab === 'all'
                            ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20'
                            : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                    }`}
                >
                    <p className="text-xs font-medium text-gray-500">Total Pekerjaan</p>
                    <p className="text-2xl font-black text-gray-900 mt-1">{counts.total || 0}</p>
                </div>

                <div
                    onClick={() => setActiveTab('active')}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                        activeTab === 'active'
                            ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/20'
                            : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-amber-700">Pekerjaan Aktif</p>
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                    </div>
                    <p className="text-2xl font-black text-amber-700 mt-1">{counts.active || 0}</p>
                </div>

                <div
                    onClick={() => setActiveTab('completed')}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                        activeTab === 'completed'
                            ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20'
                            : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                    }`}
                >
                    <p className="text-xs font-medium text-emerald-700">Selesai</p>
                    <p className="text-2xl font-black text-emerald-700 mt-1">{counts.completed || 0}</p>
                </div>

                <div
                    onClick={() => setActiveTab('cancelled')}
                    className={`p-4 rounded-2xl border transition cursor-pointer ${
                        activeTab === 'cancelled'
                            ? 'bg-gray-100 border-gray-300 ring-2 ring-gray-500/20'
                            : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                    }`}
                >
                    <p className="text-xs font-medium text-gray-600">Dibatalkan</p>
                    <p className="text-2xl font-black text-gray-700 mt-1">{counts.cancelled || 0}</p>
                </div>

                <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/50 shadow-sm col-span-2 lg:col-span-1">
                    <p className="text-xs font-medium text-rose-700 flex items-center gap-1">
                        <AlertTriangle size={13} /> Gangguan Hari Ini
                    </p>
                    <p className="text-2xl font-black text-rose-700 mt-1">{counts.gangguan_today || 0}</p>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3.5">
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                    {/* Status Tabs */}
                    <div className="inline-flex rounded-xl bg-gray-100 p-1 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setActiveTab('active')}
                            className={`px-3 py-1.5 rounded-lg transition ${
                                activeTab === 'active' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            Aktif ({counts.active})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            className={`px-3 py-1.5 rounded-lg transition ${
                                activeTab === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            Semua ({counts.total})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('completed')}
                            className={`px-3 py-1.5 rounded-lg transition ${
                                activeTab === 'completed' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            Selesai ({counts.completed})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('cancelled')}
                            className={`px-3 py-1.5 rounded-lg transition ${
                                activeTab === 'cancelled' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            Dibatalkan
                        </button>
                    </div>

                    {/* Search Field */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Cari no tiket, pelanggan, teknisi, lokasi..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchJobs()}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        />
                    </div>
                </div>

                {/* Sub-Filters */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-gray-100 text-xs">
                    <div>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white text-gray-700"
                        >
                            <option value="all">Semua Jenis Pekerjaan</option>
                            <option value="gangguan_pelanggan">Gangguan 1 Rumah</option>
                            <option value="gangguan_massal">Gangguan Massal</option>
                            <option value="pemasangan_baru">Pemasangan Baru</option>
                            <option value="lainnya">Pekerjaan Lainnya</option>
                        </select>
                    </div>

                    <div>
                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white text-gray-700"
                        >
                            <option value="all">Semua Prioritas</option>
                            <option value="urgent">Mendesak (Urgent)</option>
                            <option value="high">Tinggi (High)</option>
                            <option value="normal">Normal</option>
                            <option value="low">Rendah (Low)</option>
                        </select>
                    </div>

                    <div>
                        <select
                            value={technicianFilter}
                            onChange={(e) => setTechnicianFilter(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white text-gray-700"
                        >
                            <option value="">Semua Teknisi</option>
                            {techniciansList.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.phone || 'No WA belum ada'})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-1/2 px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[11px]"
                            title="Dari Tanggal"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-1/2 px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[11px]"
                            title="Sampai Tanggal"
                        />
                    </div>
                </div>
            </div>

            {/* Notification Information Banner */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-3 text-xs text-blue-900">
                <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold">Mekanisme Pengiriman WhatsApp & Pengingat Harian:</p>
                    <p className="mt-0.5 text-blue-800 leading-relaxed">
                        • <strong>Setelah jam 08.00 WIB:</strong> Penugasan langsung terkirim otomatis ke WhatsApp teknisi.<br />
                        • <strong>Sebelum jam 08.00 WIB:</strong> Pesan ditahan dan otomatis dikirim tepat jam 08.00 WIB pagi.<br />
                        • <strong>Pengingat Harian (Senin - Sabtu):</strong> Sistem mengirim pesan WA tiap jam 08.00 WIB untuk pekerjaan yang belum selesai kemarin (<strong>Hari Minggu Libur</strong>).
                    </p>
                </div>
            </div>

            {/* Jobs List / Cards */}
            {loading ? (
                <div className="p-16 flex justify-center">
                    <LoadingSpinner text="Memuat daftar monitoring pekerjaan..." />
                </div>
            ) : jobs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-3">
                    <div className="w-14 h-14 bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center mx-auto">
                        <HardHat size={28} />
                    </div>
                    <h3 className="text-base font-bold text-gray-800">Tidak ada pekerjaan ditemukan</h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto">
                        Tidak ada pekerjaan teknisi pada filter status atau kriteria yang dipilih saat ini.
                    </p>
                    {isSuperAdminOrAdmin && (
                        <Button
                            variant="primary"
                            onClick={() => {
                                resetCreateForm();
                                setIsCreateModalOpen(true);
                            }}
                            className="mt-2 text-xs"
                        >
                            Buat Pekerjaan Baru Sekarang
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {jobs.map((job) => {
                        const isAssigned = (job.technicians || []).some((t) => t.id === currentUserId);
                        const canResolve = isSuperAdminOrAdmin || isAssigned;
                        const isCopied = copiedJobId === job.id;

                        return (
                            <div
                                key={job.id}
                                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between space-y-4"
                            >
                                {/* Card Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                                            {job.job_number}
                                        </span>
                                        {renderTypeBadge(job.type)}
                                        {renderPriorityBadge(job.priority)}
                                        {renderStatusBadge(job.status)}
                                    </div>

                                    <div className="text-xs text-gray-400 flex items-center gap-2">
                                        <Clock size={13} />
                                        <span>Dibuat: {new Date(job.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                    </div>
                                </div>

                                {/* Main Content */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {/* Left 2 Cols: Details */}
                                    <div className="lg:col-span-2 space-y-2.5">
                                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                            {job.title}
                                        </h3>

                                        {/* Target Info */}
                                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs space-y-1.5">
                                            <div className="flex items-start gap-2">
                                                <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                                                <div>
                                                    <span className="font-bold text-gray-800">Target / Lokasi: </span>
                                                    <span className="text-gray-700">{job.target_summary}</span>
                                                    {job.customer && (
                                                        <span className="text-gray-500 block text-[11px] mt-0.5">
                                                            PPPoE: <strong>{job.customer.pppoe_username || '-'}</strong> | Alamat: {job.customer.address || '-'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {job.description && (
                                                <div className="flex items-start gap-2 pt-1 border-t border-gray-200/60">
                                                    <MessageSquare size={14} className="text-gray-400 mt-0.5 shrink-0" />
                                                    <p className="text-gray-600 italic leading-relaxed">
                                                        "{job.description}"
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Completion Notes (if completed) */}
                                        {job.status === 'completed' && (
                                            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold flex items-center gap-1.5">
                                                        <CheckCircle2 size={14} className="text-emerald-600" />
                                                        Diselesaikan oleh: {job.completer?.name || 'Admin'}
                                                    </span>
                                                    {job.completed_at && (
                                                        <span className="text-[11px] text-emerald-700">
                                                            {new Date(job.completed_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                                        </span>
                                                    )}
                                                </div>
                                                {job.completion_notes && (
                                                    <p className="text-emerald-800 mt-1 pl-5">
                                                        Catatan: {job.completion_notes}
                                                    </p>
                                                )}
                                                {job.completion_proof_url && (
                                                    <div className="pt-2 pl-5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setDetailModal({ open: true, job })}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-emerald-300 rounded-lg text-emerald-700 font-semibold hover:bg-emerald-100 transition shadow-xs text-xs"
                                                        >
                                                            <ImageIcon size={13} /> Lihat Foto Bukti Selesai
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Col: Assigned Technicians & Timing */}
                                    <div className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200 flex flex-col justify-between space-y-3">
                                        <div>
                                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <Users size={14} className="text-blue-600" />
                                                Teknisi Bertugas:
                                            </p>
                                            <div className="space-y-2">
                                                {(job.technicians || []).length === 0 ? (
                                                    <p className="text-xs text-gray-400 italic">Belum ditugaskan</p>
                                                ) : (
                                                    job.technicians.map((tech) => {
                                                        const cleanPhone = (tech.phone || '').replace(/\D/g, '');
                                                        const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : null;

                                                        return (
                                                            <div key={tech.id} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200 shadow-xs">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px]">
                                                                        {tech.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <span className="font-semibold text-gray-800">{tech.name}</span>
                                                                </div>

                                                                {waLink ? (
                                                                    <a
                                                                        href={waLink}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-50 text-green-700 border border-green-200 text-[11px] font-bold hover:bg-green-100 transition"
                                                                        title="Hubungi via WhatsApp"
                                                                    >
                                                                        <Phone size={10} /> Chat WA
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                                                        No WA (-)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        {/* Status WA Notification */}
                                        <div className="pt-2 border-t border-slate-200/70 text-[11px] text-slate-500 space-y-1">
                                            {job.notified_at ? (
                                                <div className="flex items-center gap-1 text-emerald-700 font-medium">
                                                    <Check size={12} className="text-emerald-600" />
                                                    WA Terkirim: {new Date(job.notified_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                                </div>
                                            ) : job.scheduled_notify_at ? (
                                                <div className="flex items-center gap-1 text-amber-700 font-medium">
                                                    <Clock size={12} className="text-amber-600" />
                                                    Jadwal WA: 08.00 WIB hari ini
                                                </div>
                                            ) : (
                                                <div>WA: Belum dikirim</div>
                                            )}

                                            {job.last_reminder_at && (
                                                <div className="text-gray-400">
                                                    Pengingat: {new Date(job.last_reminder_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} 08:00 WIB
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Card Footer Actions */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                                    <div className="flex items-center gap-2">
                                        {/* Tombol Copy WA Text */}
                                        <button
                                            type="button"
                                            onClick={() => handleCopyJobText(job)}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                                                isCopied
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300'
                                            }`}
                                            title="Salin ringkasan pekerjaan untuk dikirim ke grup WhatsApp"
                                        >
                                            {isCopied ? (
                                                <>
                                                    <Check size={14} className="text-emerald-600" />
                                                    Tersalin ke Clipboard!
                                                </>
                                            ) : (
                                                <>
                                                    <Copy size={14} />
                                                    Salin Teks Grup WA
                                                </>
                                            )}
                                        </button>

                                        {/* Detail Modal button */}
                                        <button
                                            type="button"
                                            onClick={() => setDetailModal({ open: true, job })}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-100 transition"
                                        >
                                            <Eye size={13} />
                                            Detail
                                        </button>
                                    </div>

                                    {/* Action Buttons for Active Jobs */}
                                    {job.status === 'active' && (
                                        <div className="flex items-center gap-2">
                                            {/* Selesaikan button */}
                                            {canResolve && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenResolve(job)}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
                                                >
                                                    <CheckCircle2 size={14} />
                                                    Selesaikan Tugas
                                                </button>
                                            )}

                                            {/* Cancel Button (Admin/Super Admin only) */}
                                            {isSuperAdminOrAdmin && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCancelModal({ open: true, job, notes: '', submitting: false })}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition"
                                                >
                                                    <XCircle size={13} />
                                                    Batalkan
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ================= MODAL BUAT PEKERJAAN BARU ================= */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Buat Pekerjaan / Tiket Teknisi Baru"
                maxWidth="2xl"
            >
                <form onSubmit={handleSubmitJob} className="space-y-5">
                    {/* Step 1: Jenis Pekerjaan */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                            1. Pilih Jenis Pekerjaan:
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {[
                                { key: 'gangguan_pelanggan', label: 'Gangguan 1 Rumah', desc: '1 Pelanggan', icon: Wrench },
                                { key: 'gangguan_massal', label: 'Gangguan Massal', desc: 'ODP / Wilayah', icon: Radio },
                                { key: 'pemasangan_baru', label: 'Pemasangan Baru', desc: 'Instalasi', icon: Plus },
                                { key: 'lainnya', label: 'Pekerjaan Lain', desc: 'Perbaikan umum', icon: HardHat },
                            ].map((item) => {
                                const Icon = item.icon;
                                const isSelected = formData.type === item.key;
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => {
                                            setFormData((prev) => ({
                                                ...prev,
                                                type: item.key,
                                                scope_type: item.key === 'gangguan_massal' ? 'odp' : 'single',
                                            }));
                                        }}
                                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition ${
                                            isSelected
                                                ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-900'
                                                : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                                        }`}
                                    >
                                        <Icon size={18} className={isSelected ? 'text-blue-600' : 'text-gray-400'} />
                                        <div className="mt-2">
                                            <p className="font-bold text-xs">{item.label}</p>
                                            <p className="text-[10px] text-gray-500">{item.desc}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 2: Target Selection */}
                    {formData.type === 'gangguan_pelanggan' && (
                        <div className="space-y-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                            <label className="block text-xs font-bold text-gray-700">
                                2. Pilih Pelanggan Mengalami Gangguan:
                            </label>

                            {selectedCustomer ? (
                                <div className="p-3 bg-white rounded-xl border border-blue-200 flex items-center justify-between shadow-xs">
                                    <div className="space-y-0.5 text-xs">
                                        <p className="font-bold text-gray-900">{selectedCustomer.name}</p>
                                        <p className="text-gray-500">
                                            WA: {selectedCustomer.phone || '-'} | PPPoE: {selectedCustomer.pppoe_username || '-'}
                                        </p>
                                        <p className="text-gray-600 text-[11px]">{selectedCustomer.address || '-'}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedCustomer(null);
                                            setFormData((prev) => ({ ...prev, customer_id: '' }));
                                        }}
                                        className="text-xs text-red-600 hover:underline font-semibold"
                                    >
                                        Ganti
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                    <input
                                        type="text"
                                        placeholder="Ketik nama pelanggan, no telepon, atau user PPPoE..."
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                                    />
                                    {searchingCustomer && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={14} />
                                    )}

                                    {customerSearchResults.length > 0 && (
                                        <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg divide-y divide-gray-100">
                                            {customerSearchResults.map((c) => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => {
                                                        setSelectedCustomer(c);
                                                        setFormData((prev) => ({ ...prev, customer_id: c.id }));
                                                        setCustomerSearch('');
                                                        setCustomerSearchResults([]);
                                                    }}
                                                    className="p-2.5 hover:bg-blue-50 cursor-pointer text-xs space-y-0.5"
                                                >
                                                    <p className="font-bold text-gray-900">{c.name}</p>
                                                    <p className="text-gray-500 text-[11px]">
                                                        {c.phone || '-'} | PPPoE: {c.pppoe_username || '-'} | {c.address}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {formData.type === 'gangguan_massal' && (
                        <div className="space-y-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                            <label className="block text-xs font-bold text-gray-700">
                                2. Opsi Target Gangguan Massal (Sangat Fleksibel):
                            </label>

                            {/* Sub-tabs for mass outage */}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFormData((prev) => ({ ...prev, scope_type: 'odp' }))}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                        formData.scope_type === 'odp'
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                            : 'bg-white text-gray-600 border-gray-200'
                                    }`}
                                >
                                    Berdasarkan ODP
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData((prev) => ({ ...prev, scope_type: 'wilayah' }))}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                        formData.scope_type === 'wilayah'
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                            : 'bg-white text-gray-600 border-gray-200'
                                    }`}
                                >
                                    Berdasarkan Wilayah
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData((prev) => ({ ...prev, scope_type: 'mass_customers' }))}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                        formData.scope_type === 'mass_customers'
                                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                            : 'bg-white text-gray-600 border-gray-200'
                                    }`}
                                >
                                    Pilih Banyak Pelanggan
                                </button>
                            </div>

                            {/* If ODP Scope */}
                            {formData.scope_type === 'odp' && (
                                <div>
                                    <select
                                        value={formData.odp_id}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, odp_id: e.target.value }))}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="">Pilih ODP yang Mengalami Gangguan</option>
                                        {odpList.map((odp) => (
                                            <option key={odp.id} value={odp.id}>
                                                {odp.nama || odp.name || `ODP #${odp.id}`} {odp.lokasi ? `(${odp.lokasi})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        Seluruh pelanggan yang terhubung ke ODP ini otomatis tercatat dalam tiket gangguan massal.
                                    </p>
                                </div>
                            )}

                            {/* If Wilayah Scope */}
                            {formData.scope_type === 'wilayah' && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <select
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                fetchDesa(val);
                                            }}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                                        >
                                            <option value="">Pilih Kecamatan</option>
                                            {kecamatanList.map((k) => (
                                                <option key={k.id} value={k.id}>{k.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <select
                                            value={formData.wilayah_id}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, wilayah_id: e.target.value, wilayah_type: 'desa' }))}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                                        >
                                            <option value="">Pilih Desa</option>
                                            {desaList.map((d) => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* If Multi-Customer Scope */}
                            {formData.scope_type === 'mass_customers' && (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        placeholder="Cari & tambahkan pelanggan yang terdampak..."
                                        value={massCustomerSearch}
                                        onChange={(e) => setMassCustomerSearch(e.target.value)}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                                    />
                                    {massCustomerSearchResults.length > 0 && (
                                        <div className="max-h-36 overflow-y-auto bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm">
                                            {massCustomerSearchResults.map((c) => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => {
                                                        if (!selectedMassCustomers.some((item) => item.id === c.id)) {
                                                            setSelectedMassCustomers((prev) => [...prev, c]);
                                                        }
                                                        setMassCustomerSearch('');
                                                        setMassCustomerSearchResults([]);
                                                    }}
                                                    className="p-2 hover:bg-purple-50 cursor-pointer text-xs flex justify-between items-center"
                                                >
                                                    <span>{c.name} ({c.phone || '-'})</span>
                                                    <Plus size={14} className="text-purple-600" />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {selectedMassCustomers.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {selectedMassCustomers.map((c) => (
                                                <span key={c.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-xs font-semibold">
                                                    {c.name}
                                                    <X
                                                        size={12}
                                                        className="cursor-pointer hover:text-red-600"
                                                        onClick={() => setSelectedMassCustomers((prev) => prev.filter((item) => item.id !== c.id))}
                                                    />
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {formData.type === 'pemasangan_baru' && (
                        <div className="space-y-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                            <label className="block text-xs font-bold text-gray-700">
                                2. Pilih Pelanggan untuk Pemasangan Baru:
                            </label>
                            {selectedCustomer ? (
                                <div className="p-3 bg-white rounded-xl border border-blue-200 flex items-center justify-between shadow-xs">
                                    <div className="space-y-0.5 text-xs">
                                        <p className="font-bold text-gray-900">{selectedCustomer.name}</p>
                                        <p className="text-gray-500">WA: {selectedCustomer.phone || '-'}</p>
                                        <p className="text-gray-600 text-[11px]">{selectedCustomer.address || '-'}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedCustomer(null);
                                            setFormData((prev) => ({ ...prev, customer_id: '' }));
                                        }}
                                        className="text-xs text-red-600 hover:underline font-semibold"
                                    >
                                        Ganti
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                    <input
                                        type="text"
                                        placeholder="Cari pelanggan baru yang menunggu pemasangan..."
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                                    />
                                    {customerSearchResults.length > 0 && (
                                        <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg divide-y divide-gray-100">
                                            {customerSearchResults.map((c) => (
                                                <div
                                                    key={c.id}
                                                    onClick={() => {
                                                        setSelectedCustomer(c);
                                                        setFormData((prev) => ({ ...prev, customer_id: c.id }));
                                                        setCustomerSearch('');
                                                        setCustomerSearchResults([]);
                                                    }}
                                                    className="p-2.5 hover:bg-blue-50 cursor-pointer text-xs"
                                                >
                                                    <p className="font-bold text-gray-900">{c.name}</p>
                                                    <p className="text-gray-500 text-[11px]">{c.phone || '-'} | {c.address}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Detail & Catatan Gangguan */}
                    <div className="space-y-3">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                            3. Detail & Catatan Pengerjaan:
                        </label>

                        <div>
                            <input
                                type="text"
                                placeholder="Judul Tugas / Ringkasan Masalah (Contoh: Kabel Dropcore Tertekuk)"
                                value={formData.title}
                                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                                required
                                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-blue-500 font-semibold"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] text-gray-600 mb-1 font-medium">Prioritas:</label>
                                <select
                                    value={formData.priority}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="normal">Normal</option>
                                    <option value="high">Tinggi (High)</option>
                                    <option value="urgent">Mendesak (Urgent)</option>
                                    <option value="low">Rendah (Low)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] text-gray-600 mb-1 font-medium">Instruksi Singkat:</label>
                                <span className="text-[11px] text-gray-500 block pt-1">
                                    Catatan akan otomatis masuk ke pesan WhatsApp teknisi.
                                </span>
                            </div>
                        </div>

                        <div>
                            <textarea
                                rows={3}
                                placeholder="Tuliskan catatan teknis detail gangguan atau instruksi pemasangan..."
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-blue-500 leading-relaxed"
                            />
                        </div>
                    </div>

                    {/* Step 4: Pilih Teknisi yang Mengerjakan */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                                4. Pilih Teknisi yang Ditugaskan (Minimal 1, maks 2 orang):
                            </label>
                            <span className="text-[11px] text-blue-600 font-semibold">
                                {formData.technician_ids.length} dipilih
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-200 rounded-xl p-3 max-h-48 overflow-y-auto bg-gray-50/50">
                            {techniciansList.length === 0 ? (
                                <p className="text-xs text-gray-500 p-2">Tidak ada akun teknisi terdaftar.</p>
                            ) : (
                                techniciansList.map((tech) => {
                                    const isSelected = formData.technician_ids.includes(tech.id);
                                    const hasPhone = Boolean(tech.phone && String(tech.phone).trim() !== '');

                                    return (
                                        <div
                                            key={tech.id}
                                            onClick={() => handleTechnicianToggle(tech)}
                                            className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition ${
                                                isSelected
                                                    ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-500/20 text-blue-900'
                                                    : 'bg-white border-gray-200 hover:border-gray-300 text-gray-800'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}} // handled by parent div
                                                    className="w-4 h-4 rounded text-blue-600 pointer-events-none"
                                                />
                                                <div>
                                                    <p className="font-bold text-xs">{tech.name}</p>
                                                    <p className="text-[10px] text-gray-500">{tech.role}</p>
                                                </div>
                                            </div>

                                            <div>
                                                {hasPhone ? (
                                                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono">
                                                        {tech.phone}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                                                        <AlertCircle size={10} /> Isi No WA
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Step 5: Submit Actions */}
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
                        <Button
                            variant="secondary"
                            type="button"
                            onClick={() => setIsCreateModalOpen(false)}
                            disabled={submittingJob}
                            className="text-xs"
                        >
                            Batal
                        </Button>

                        <Button
                            variant="primary"
                            type="submit"
                            disabled={submittingJob}
                            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                        >
                            {submittingJob ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Menyimpan & Mengirim WA...
                                </>
                            ) : (
                                <>
                                    <Send size={14} />
                                    Submit & Aktifkan Tugas
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* ================= MODAL INPUT NOMOR TELEPON TEKNISI ================= */}
            <Modal
                isOpen={isPhoneModalOpen}
                onClose={() => setIsPhoneModalOpen(false)}
                title="Nomor WhatsApp Teknisi Diperlukan"
                maxWidth="md"
            >
                <div className="space-y-4">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            Teknisi <strong>{phoneModalTech?.name}</strong> belum memiliki nomor telepon WhatsApp yang terdaftar pada akunnya.
                            Silakan masukkan nomor telepon agar sistem dapat mengirimkan notifikasi penugasan pekerjaan ini.
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            Nomor WhatsApp Teknisi:
                        </label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input
                                type="text"
                                placeholder="Contoh: 081234567890 atau 6281234567890"
                                value={phoneInput}
                                onChange={(e) => setPhoneInput(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 font-mono"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                        <Button
                            variant="secondary"
                            type="button"
                            onClick={() => setIsPhoneModalOpen(false)}
                            disabled={savingPhone}
                            className="text-xs"
                        >
                            Batal
                        </Button>

                        <Button
                            variant="primary"
                            type="button"
                            onClick={handleSaveTechnicianPhone}
                            disabled={savingPhone || !phoneInput.trim()}
                            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                        >
                            {savingPhone ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Simpan & Lanjutkan
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ================= MODAL RESOLVE (SELESAIKAN PEKERJAAN) ================= */}
            <Modal
                isOpen={resolveModal.open}
                onClose={() => setResolveModal({ open: false, job: null, notes: '', proofFile: null, proofPreview: null, submitting: false })}
                title={isSuperAdminOrAdmin ? 'Konfirmasi Pekerjaan Selesai' : 'Selesaikan Tugas & Upload Bukti'}
                maxWidth="md"
            >
                <div className="space-y-4">
                    {/* Admin Mode: Simple Confirmation */}
                    {isSuperAdminOrAdmin ? (
                        <div className="space-y-3">
                            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
                                <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold">Konfirmasi Penyelesaian oleh Admin:</p>
                                    <p className="mt-0.5 text-blue-800">
                                        Sebagai Admin / Super Admin, Anda dapat langsung mengonfirmasi bahwa tiket pekerjaan <strong>#{resolveModal.job?.job_number}</strong> telah selesai tanpa melampirkan foto bukti.
                                    </p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Catatan Konfirmasi (Opsional):
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Contoh: Dikonfirmasi via telepon pelanggan sudah normal kembali."
                                    value={resolveModal.notes}
                                    onChange={(e) => setResolveModal((prev) => ({ ...prev, notes: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    ) : (
                        /* Technician Mode: Photo Proof & Notes MANDATORY! */
                        <div className="space-y-3">
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                                <p className="font-bold">Persyaratan Teknisi:</p>
                                <p className="mt-0.5 text-amber-800">
                                    Untuk menyelesaikan tugas, Anda <strong>wajib melampirkan foto bukti pengerjaan</strong> dan mengisi catatan hasil pengerjaan. Jika tidak selesai, pengingat WA akan terus terkirim tiap pagi jam 08.00 WIB.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Foto Bukti Pengerjaan (Wajib):
                                </label>
                                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:bg-gray-50 transition relative cursor-pointer">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setResolveModal((prev) => ({
                                                    ...prev,
                                                    proofFile: file,
                                                    proofPreview: URL.createObjectURL(file),
                                                }));
                                            }
                                        }}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    {resolveModal.proofPreview ? (
                                        <div className="space-y-2">
                                            <img
                                                src={resolveModal.proofPreview}
                                                alt="Preview Bukti"
                                                className="w-full h-36 object-cover rounded-lg border border-gray-200 mx-auto"
                                            />
                                            <p className="text-[11px] text-blue-600 font-semibold">Klik untuk mengganti foto</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                                            <p className="text-xs font-semibold text-gray-700">Ambil Foto / Unggah Bukti</p>
                                            <p className="text-[10px] text-gray-400">JPG, PNG, maksimal 10MB</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Catatan Hasil Pengerjaan (Wajib):
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Contoh: Redaman sudah normal kembali (-19 dBm), kabel dropcore disambung ulang dengan splicing."
                                    value={resolveModal.notes}
                                    onChange={(e) => setResolveModal((prev) => ({ ...prev, notes: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    )}

                    <div className="pt-2 flex justify-end gap-2">
                        <Button
                            variant="secondary"
                            type="button"
                            onClick={() => setResolveModal({ open: false, job: null, notes: '', proofFile: null, proofPreview: null, submitting: false })}
                            disabled={resolveModal.submitting}
                            className="text-xs"
                        >
                            Batal
                        </Button>

                        <Button
                            variant="primary"
                            type="button"
                            onClick={handleSubmitResolve}
                            disabled={resolveModal.submitting}
                            className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                        >
                            {resolveModal.submitting ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Menyelesaikan...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={14} />
                                    Ya, Selesaikan Pekerjaan
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ================= MODAL DETAIL PEKERJAAN ================= */}
            <Modal
                isOpen={detailModal.open}
                onClose={() => setDetailModal({ open: false, job: null })}
                title={`Detail Pekerjaan #${detailModal.job?.job_number || ''}`}
                maxWidth="lg"
            >
                {detailModal.job && (
                    <div className="space-y-4 text-xs">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                            <div>
                                <p className="text-[11px] text-gray-500 uppercase font-semibold">Jenis Pekerjaan</p>
                                <p className="font-bold text-gray-900 mt-0.5">{detailModal.job.type_label}</p>
                            </div>
                            <div>
                                {renderStatusBadge(detailModal.job.status)}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="font-bold text-gray-800 text-sm">{detailModal.job.title}</p>
                            <p className="text-gray-600 leading-relaxed bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                {detailModal.job.description || 'Tidak ada catatan tambahan.'}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 rounded-lg border border-gray-100 bg-white">
                                <span className="text-gray-400 block text-[10px]">Target / Lokasi</span>
                                <span className="font-bold text-gray-800">{detailModal.job.target_summary}</span>
                            </div>
                            <div className="p-2.5 rounded-lg border border-gray-100 bg-white">
                                <span className="text-gray-400 block text-[10px]">Prioritas</span>
                                <span className="font-bold uppercase text-gray-800">{detailModal.job.priority}</span>
                            </div>
                        </div>

                        {/* Foto Bukti Selesai */}
                        {detailModal.job.completion_proof_url && (
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Foto Bukti Pengerjaan:</label>
                                <a
                                    href={detailModal.job.completion_proof_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block border border-gray-200 rounded-xl overflow-hidden group relative"
                                >
                                    <img
                                        src={detailModal.job.completion_proof_url}
                                        alt="Bukti Selesai"
                                        className="w-full h-48 object-cover group-hover:scale-102 transition"
                                    />
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition">
                                        <ExternalLink size={16} className="mr-1" /> Buka Foto Ukuran Penuh
                                    </div>
                                </a>
                            </div>
                        )}

                        <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
                            <button
                                type="button"
                                onClick={() => handleCopyJobText(detailModal.job)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-blue-50 hover:text-blue-700 transition"
                            >
                                <Copy size={13} />
                                Salin Teks WA
                            </button>

                            <Button
                                variant="secondary"
                                onClick={() => setDetailModal({ open: false, job: null })}
                                className="text-xs"
                            >
                                Tutup
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ================= MODAL BATALKAN ================= */}
            <Modal
                isOpen={cancelModal.open}
                onClose={() => setCancelModal({ open: false, job: null, notes: '', submitting: false })}
                title="Batalkan Pekerjaan"
                maxWidth="sm"
            >
                <div className="space-y-4">
                    <p className="text-xs text-gray-600">
                        Apakah Anda yakin ingin membatalkan pekerjaan <strong>#{cancelModal.job?.job_number}</strong>?
                    </p>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Alasan Pembatalan:
                        </label>
                        <input
                            type="text"
                            placeholder="Contoh: Dibatalkan pelanggan / salah input"
                            value={cancelModal.notes}
                            onChange={(e) => setCancelModal((prev) => ({ ...prev, notes: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-red-500"
                        />
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => setCancelModal({ open: false, job: null, notes: '', submitting: false })}
                            disabled={cancelModal.submitting}
                            className="text-xs"
                        >
                            Batal
                        </Button>

                        <Button
                            variant="danger"
                            onClick={handleSubmitCancel}
                            disabled={cancelModal.submitting}
                            className="text-xs font-bold"
                        >
                            {cancelModal.submitting ? 'Membatalkan...' : 'Ya, Batalkan'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
