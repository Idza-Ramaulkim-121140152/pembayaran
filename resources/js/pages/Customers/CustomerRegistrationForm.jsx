import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
    ArrowLeft, User, Phone, CreditCard, Calendar, MapPin, 
    Wifi, DollarSign, Upload, CheckCircle2, AlertCircle, 
    Scan, Sparkles, Loader2, Image as ImageIcon, Check, X,
    Star, Clock, Eye, XCircle, ChevronDown, ChevronUp, UserCheck
} from 'lucide-react';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const INITIAL_FORM = {
    nama: '',
    tanggal_aktivasi: new Date().toISOString().split('T')[0],
    no_telp: '',
    nik: '',
    jenis_kelamin: 'Laki-laki',
    kecamatan_id: '',
    desa_id: '',
    dusun_id: '',
    alamat: '',
    paket: '',
    paket_custom: '',
    biaya_pemasangan: '250000',
    odp: '',
    mac_address: '',
};

function CustomerRegistrationForm() {
    const navigate = useNavigate();
    const location = useLocation();
    const [formData, setFormData] = useState(INITIAL_FORM);
    const [packageList, setPackageList] = useState([]);
    const [kecamatanList, setKecamatanList] = useState([]);
    const [desaList, setDesaList] = useState([]);
    const [dusunList, setDusunList] = useState([]);
    const [odpList, setOdpList] = useState([]);
    const [loadingOdp, setLoadingOdp] = useState(false);

    // Recommendations state
    const [recommendations, setRecommendations] = useState([]);
    const [loadingRecs, setLoadingRecs] = useState(false);
    const [selectedProspectId, setSelectedProspectId] = useState(null);
    const [showRecsPanel, setShowRecsPanel] = useState(true);

    // Photos state
    const [photos, setPhotos] = useState({
        foto_depan_rumah: null,
        foto_ktp: null,
        foto_modem: null,
        foto_opm: null,
    });
    const [photoPreviews, setPhotoPreviews] = useState({
        foto_depan_rumah: null,
        foto_ktp: null,
        foto_modem: null,
        foto_opm: null,
    });

    // MAC OCR state
    const [analyzingMac, setAnalyzingMac] = useState(false);
    const [detectedMac, setDetectedMac] = useState(null);
    const [macAnalysisMeta, setMacAnalysisMeta] = useState(null);

    // Form submission state
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [successModal, setSuccessModal] = useState({
        open: false,
        message: '',
        encodedTimestamp: '',
    });

    useEffect(() => {
        fetchPackages();
        fetchKecamatan();
        fetchRecommendations();
    }, []);

    const fetchRecommendations = async () => {
        setLoadingRecs(true);
        try {
            const res = await fetch('/api/customer-prospects/recommendations');
            const json = await res.json();
            if (json.success) {
                setRecommendations(json.data || []);

                // Check if URL has prospect_id query param
                const searchParams = new URLSearchParams(location.search);
                const prospectIdParam = searchParams.get('prospect_id');
                if (prospectIdParam) {
                    const match = (json.data || []).find((p) => String(p.id) === String(prospectIdParam));
                    if (match) {
                        applyProspectData(match);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch recommendations', e);
        } finally {
            setLoadingRecs(false);
        }
    };

    const applyProspectData = (prospect) => {
        setSelectedProspectId(prospect.id);
        setFormData((prev) => ({
            ...prev,
            nama: prospect.nama || '',
            no_telp: prospect.no_telp || '',
            nik: prospect.nik || '',
            jenis_kelamin: prospect.jenis_kelamin || 'Laki-laki',
            kecamatan_id: prospect.kecamatan_id ? String(prospect.kecamatan_id) : prev.kecamatan_id,
            desa_id: prospect.desa_id ? String(prospect.desa_id) : '',
            dusun_id: prospect.dusun_id ? String(prospect.dusun_id) : '',
            alamat: prospect.alamat || '',
            paket: prospect.paket || prev.paket,
            paket_custom: prospect.paket_custom || '',
        }));

        if (prospect.kecamatan_id) {
            fetchDesa(prospect.kecamatan_id);
            if (prospect.desa_id) {
                fetchDusun(prospect.desa_id);
            }
        }

        if (prospect.foto_depan_rumah) {
            setPhotoPreviews((prev) => ({ ...prev, foto_depan_rumah: prospect.foto_depan_rumah }));
        }
        if (prospect.foto_ktp) {
            setPhotoPreviews((prev) => ({ ...prev, foto_ktp: prospect.foto_ktp }));
        }

        window.scrollTo({ top: 380, behavior: 'smooth' });
    };

    const handleDismissRecommendation = async (prospectId) => {
        try {
            await fetch(`/api/customer-prospects/${prospectId}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: JSON.stringify({ status: 'rejected', rejection_reason: 'Dibatalkan oleh teknisi saat pendaftaran' }),
            });

            setRecommendations((prev) => prev.filter((p) => p.id !== prospectId));
            if (selectedProspectId === prospectId) {
                setSelectedProspectId(null);
            }
        } catch (e) {
            console.error('Failed to dismiss recommendation', e);
        }
    };

    useEffect(() => {
        if (!formData.kecamatan_id) {
            setDesaList([]);
            setDusunList([]);
            setFormData((prev) => ({ ...prev, desa_id: '', dusun_id: '' }));
            return;
        }
        fetchDesa(formData.kecamatan_id);
    }, [formData.kecamatan_id]);

    useEffect(() => {
        if (!formData.desa_id) {
            setDusunList([]);
            setFormData((prev) => ({ ...prev, dusun_id: '' }));
            return;
        }
        fetchDusun(formData.desa_id);
    }, [formData.desa_id]);

    useEffect(() => {
        if (!formData.desa_id || !formData.dusun_id) {
            setOdpList([]);
            setFormData((prev) => ({ ...prev, odp: '' }));
            return;
        }
        fetchOdps(formData.desa_id, formData.dusun_id);
    }, [formData.desa_id, formData.dusun_id]);

    const fetchPackages = async () => {
        try {
            const res = await fetch('/api/packages/active');
            const json = await res.json();
            setPackageList(json.data || []);
            if (json.data?.length > 0 && !formData.paket) {
                setFormData((prev) => ({ ...prev, paket: json.data[0].name }));
            }
        } catch (e) {
            console.error('Failed to fetch packages', e);
        }
    };

    const fetchKecamatan = async () => {
        try {
            const res = await fetch('/api/master-wilayah/kecamatan');
            const json = await res.json();
            setKecamatanList(json.data || []);
            if (json.data?.length > 0 && !formData.kecamatan_id) {
                setFormData((prev) => ({ ...prev, kecamatan_id: String(json.data[0].id) }));
            }
        } catch (e) {
            console.error('Failed to fetch kecamatan', e);
        }
    };

    const fetchDesa = async (kecamatanId) => {
        try {
            const res = await fetch(`/api/master-wilayah/desa?kecamatan_id=${encodeURIComponent(kecamatanId)}`);
            const json = await res.json();
            setDesaList(json.data || []);
            if (json.data?.length > 0 && !formData.desa_id) {
                setFormData((prev) => ({ ...prev, desa_id: String(json.data[0].id) }));
            }
        } catch (e) {
            console.error('Failed to fetch desa', e);
        }
    };

    const fetchDusun = async (desaId) => {
        try {
            const res = await fetch(`/api/master-wilayah/dusun?desa_id=${encodeURIComponent(desaId)}`);
            const json = await res.json();
            setDusunList(json.data || []);
            if (json.data?.length > 0 && !formData.dusun_id) {
                setFormData((prev) => ({ ...prev, dusun_id: String(json.data[0].id) }));
            }
        } catch (e) {
            console.error('Failed to fetch dusun', e);
        }
    };

    const fetchOdps = async (desaId, dusunId) => {
        try {
            setLoadingOdp(true);
            const res = await fetch(`/api/customer-verification/odps/options?desa_id=${encodeURIComponent(desaId)}&dusun_id=${encodeURIComponent(dusunId)}&scope=dusun`);
            const json = await res.json();
            setOdpList(json.data || []);
        } catch (e) {
            console.error('Failed to fetch ODPs', e);
        } finally {
            setLoadingOdp(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handlePhotoChange = async (e, fieldName) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setPhotos((prev) => ({ ...prev, [fieldName]: file }));
        const previewUrl = URL.createObjectURL(file);
        setPhotoPreviews((prev) => ({ ...prev, [fieldName]: previewUrl }));

        if (fieldName === 'foto_modem') {
            analyzeMacAddressPhoto(file);
        }
    };

    const analyzeMacAddressPhoto = async (file) => {
        setAnalyzingMac(true);
        setDetectedMac(null);
        setMacAnalysisMeta(null);

        const body = new FormData();
        body.append('photo', file);

        try {
            const res = await fetch('/api/customer-verification/analyze-mac', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body,
            });

            const json = await res.json();
            if (json.mac_address) {
                setDetectedMac(json.mac_address);
                setMacAnalysisMeta(json);
            }
        } catch (err) {
            console.error('MAC analysis failed', err);
        } finally {
            setAnalyzingMac(false);
        }
    };

    const handleApplyDetectedMac = () => {
        if (detectedMac) {
            setFormData((prev) => ({ ...prev, mac_address: detectedMac }));
            setDetectedMac(null);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!formData.nama.trim()) {
            setError('Nama pelanggan wajib diisi.');
            return;
        }
        if (!formData.nik.trim()) {
            setError('NIK pelanggan wajib diisi.');
            return;
        }
        if (!formData.no_telp.trim()) {
            setError('Nomor WhatsApp pelanggan wajib diisi.');
            return;
        }
        if (!formData.mac_address.trim()) {
            setError('MAC Address modem/router wajib diisi.');
            return;
        }

        setSubmitting(true);

        const postData = new FormData();
        Object.entries(formData).forEach(([key, val]) => {
            postData.append(key, val ?? '');
        });

        Object.entries(photos).forEach(([key, file]) => {
            if (file) {
                postData.append(key, file);
            }
        });

        // Pass photo URL references if chosen from recommendation
        if (!photos.foto_depan_rumah && photoPreviews.foto_depan_rumah?.startsWith('http')) {
            postData.append('foto_depan_rumah_url', photoPreviews.foto_depan_rumah);
        }
        if (!photos.foto_ktp && photoPreviews.foto_ktp?.startsWith('http')) {
            postData.append('foto_ktp_url', photoPreviews.foto_ktp);
        }

        try {
            const res = await fetch('/api/customer-verification/register', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: postData,
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.message || Object.values(json.errors || {}).flat().join(', ') || 'Gagal mendaftarkan pelanggan');
            }

            // If this customer was created from an approved prospect, mark prospect as installed
            if (selectedProspectId) {
                fetch(`/api/customer-prospects/${selectedProspectId}/status`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                    },
                    body: JSON.stringify({ status: 'installed' }),
                }).catch(() => {});
            }

            setSuccessModal({
                open: true,
                message: json.message || 'Pelanggan berhasil didaftarkan!',
                encodedTimestamp: json.encoded_timestamp || '',
            });
        } catch (err) {
            setError(err.message || 'Terjadi kesalahan saat pendaftaran.');
        } finally {
            setSubmitting(false);
        }
    };

    const isCustomPackage = formData.paket?.toLowerCase().includes('custom');

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Top Nav Header */}
                <div className="flex items-center justify-between">
                    <Link
                        to="/customer-verification"
                        className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-blue-600 transition"
                    >
                        <ArrowLeft size={18} className="mr-2" />
                        Kembali ke Verifikasi Pelanggan
                    </Link>

                    <Link
                        to="/customer-prospects"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition"
                    >
                        <UserCheck size={14} />
                        Kelola Calon Pelanggan ({recommendations.length})
                    </Link>
                </div>

                {/* 🌟 TOP RECOMMENDATION BANNER WIDGET 🌟 */}
                {recommendations.length > 0 && (
                    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-5 shadow-lg text-white space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                                    <Sparkles size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                                        Rekomendasi Calon Pelanggan Terverifikasi (Siap Pemasangan)
                                        <span className="px-2 py-0.5 rounded-full bg-white text-orange-700 font-bold text-xs">
                                            {recommendations.length} Siap
                                        </span>
                                    </h3>
                                    <p className="text-xs text-amber-100">
                                        Pilih calon pelanggan untuk mengisi otomatis seluruh data formulir di bawah ini.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowRecsPanel(!showRecsPanel)}
                                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition text-xs font-semibold"
                            >
                                {showRecsPanel ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                        </div>

                        {showRecsPanel && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                                {recommendations.map((rec) => {
                                    const isSelected = selectedProspectId === rec.id;
                                    return (
                                        <div
                                            key={rec.id}
                                            className={`p-3.5 rounded-2xl bg-white text-gray-900 border-2 transition shadow-sm flex flex-col justify-between space-y-2.5 ${
                                                isSelected ? 'border-amber-400 ring-2 ring-white/80' : 'border-transparent hover:border-amber-200'
                                            }`}
                                        >
                                            <div className="space-y-1">
                                                <div className="flex justify-between items-start gap-1">
                                                    <span className="font-mono text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded">
                                                        {rec.registration_no}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-medium">{rec.paket || 'Standar'}</span>
                                                </div>
                                                <h4 className="font-bold text-sm text-gray-900 line-clamp-1">{rec.nama}</h4>
                                                <p className="text-xs text-gray-600 flex items-center gap-1">
                                                    <Phone size={12} className="text-gray-400" />
                                                    {rec.no_telp}
                                                </p>
                                                <p className="text-[11px] text-gray-500 line-clamp-1">
                                                    <MapPin size={11} className="inline mr-1 text-gray-400" />
                                                    {rec.desa?.name ? `Desa ${rec.desa.name}, ` : ''}{rec.kecamatan?.name || ''}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                                                <button
                                                    type="button"
                                                    onClick={() => applyProspectData(rec)}
                                                    className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                                                        isSelected
                                                            ? 'bg-amber-500 text-white shadow-sm'
                                                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                                                    }`}
                                                >
                                                    <Check size={13} />
                                                    {isSelected ? 'Data Terpilih' : 'Gunakan Data Ini'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissRecommendation(rec.id)}
                                                    className="p-1.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                                                    title="Batal Pasang / Tolak"
                                                >
                                                    <XCircle size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Form Card */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-white/15 backdrop-blur-sm rounded-xl">
                                <User size={24} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">Formulir Pendaftaran Pelanggan Baru</h1>
                                <p className="text-blue-100 text-sm">
                                    Data otomatis tersimpan ke sistem dan disinkronkan langsung ke Google Sheets.
                                </p>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-6 pb-0">
                            <Alert variant="error">{error}</Alert>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
                        {/* 1. DATA PRIBADI */}
                        <div>
                            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
                                <User size={18} className="text-blue-600" />
                                1. Data Pribadi Pelanggan
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Nama Lengkap Pelanggan <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="nama"
                                        required
                                        value={formData.nama}
                                        onChange={handleInputChange}
                                        placeholder="Contoh: Budi Santoso"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        NIK Pelanggan (16 Digit) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="nik"
                                        required
                                        maxLength={20}
                                        value={formData.nik}
                                        onChange={handleInputChange}
                                        placeholder="180XXXXXXXXXXXXX"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Nomor WhatsApp <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="no_telp"
                                        required
                                        value={formData.no_telp}
                                        onChange={handleInputChange}
                                        placeholder="081234567890"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Jenis Kelamin <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="jenis_kelamin"
                                        value={formData.jenis_kelamin}
                                        onChange={handleInputChange}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="Laki-laki">Laki-laki</option>
                                        <option value="Perempuan">Perempuan</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Tanggal Aktivasi <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        name="tanggal_aktivasi"
                                        required
                                        value={formData.tanggal_aktivasi}
                                        onChange={handleInputChange}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 2. WILAYAH & ALAMAT */}
                        <div>
                            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
                                <MapPin size={18} className="text-green-600" />
                                2. Alamat & Master Wilayah
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Kecamatan <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="kecamatan_id"
                                        required
                                        value={formData.kecamatan_id}
                                        onChange={handleInputChange}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="">Pilih Kecamatan</option>
                                        {kecamatanList.map((k) => (
                                            <option key={k.id} value={k.id}>{k.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Desa <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="desa_id"
                                        required
                                        value={formData.desa_id}
                                        onChange={handleInputChange}
                                        disabled={!formData.kecamatan_id}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    >
                                        <option value="">Pilih Desa</option>
                                        {desaList.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Dusun <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="dusun_id"
                                        required
                                        value={formData.dusun_id}
                                        onChange={handleInputChange}
                                        disabled={!formData.desa_id}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    >
                                        <option value="">Pilih Dusun</option>
                                        {dusunList.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-3">
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Alamat Lengkap / Patokan Rumah
                                    </label>
                                    <input
                                        type="text"
                                        name="alamat"
                                        value={formData.alamat}
                                        onChange={handleInputChange}
                                        placeholder="Contoh: RT 02 RW 01, samping pos ronda"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 3. PAKET & BIAYA */}
                        <div>
                            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
                                <Wifi size={18} className="text-indigo-600" />
                                3. Paket Layanan & ODP
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className={isCustomPackage ? 'sm:col-span-1' : 'sm:col-span-2'}>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Jenis Paket <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="paket"
                                        required
                                        value={formData.paket}
                                        onChange={handleInputChange}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    >
                                        {packageList.map((p) => (
                                            <option key={p.id} value={p.name}>
                                                {p.name} {p.speed ? `(${p.speed})` : ''} - Rp {Number(p.price || 0).toLocaleString('id-ID')}
                                            </option>
                                        ))}
                                        <option value="Paket Custom">Paket Custom</option>
                                    </select>
                                </div>

                                {isCustomPackage && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                            Nama Paket Custom <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="paket_custom"
                                            required
                                            value={formData.paket_custom}
                                            onChange={handleInputChange}
                                            placeholder="Contoh: Paket Kantor 50M"
                                            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        Biaya Pemasangan (Rp) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        name="biaya_pemasangan"
                                        required
                                        min={0}
                                        value={formData.biaya_pemasangan}
                                        onChange={handleInputChange}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>

                                <div className="sm:col-span-3">
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                                        ODP (Optical Distribution Point)
                                    </label>
                                    <select
                                        name="odp"
                                        value={formData.odp}
                                        onChange={handleInputChange}
                                        disabled={loadingOdp || !formData.dusun_id}
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    >
                                        <option value="">Pilih ODP (Opsional)</option>
                                        {odpList.map((odp) => (
                                            <option key={odp.id} value={odp.nama}>
                                                {odp.nama} {odp.rasio_distribusi ? `(${odp.rasio_distribusi})` : ''} - {odp.alamat_detail || ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 4. MAC ADDRESS & FOTO MODEM DENGAN SCANNER */}
                        <div>
                            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
                                <Scan size={18} className="text-purple-600" />
                                4. Perangkat & MAC Address Modem (Wajib)
                            </h2>

                            <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-5 mb-4 space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-purple-900 uppercase tracking-wider mb-1.5">
                                        MAC Address Modem / Router <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            name="mac_address"
                                            required
                                            value={formData.mac_address}
                                            onChange={handleInputChange}
                                            placeholder="Contoh: BC:54:51:7A:B2:90"
                                            className="flex-1 rounded-xl border border-purple-300 bg-white font-mono text-sm px-4 py-2.5 uppercase tracking-wider focus:border-purple-600 focus:ring-1 focus:ring-purple-600"
                                        />
                                    </div>
                                    <p className="text-xs text-purple-700 mt-1">
                                        Format MAC standar 12 digit heksadesimal dipisahkan tanda titik dua (:).
                                    </p>
                                </div>

                                {/* OCR Detection Prompt Banner */}
                                {analyzingMac && (
                                    <div className="flex items-center gap-2 p-3 bg-white rounded-xl border border-purple-200 text-purple-700 text-xs">
                                        <Loader2 size={16} className="animate-spin text-purple-600" />
                                        Menganalisis stiker modem dari foto...
                                    </div>
                                )}

                                {detectedMac && (
                                    <div className="p-3.5 bg-white rounded-xl border-2 border-purple-400 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <Sparkles size={20} className="text-purple-600 shrink-0" />
                                            <div>
                                                <p className="text-xs text-gray-500 font-medium">MAC Address Terdeteksi dari Foto:</p>
                                                <p className="text-sm font-bold font-mono text-purple-900">{detectedMac}</p>
                                                {macAnalysisMeta?.device_model && (
                                                    <p className="text-xs text-gray-500">Model: {macAnalysisMeta.device_model}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <button
                                                type="button"
                                                onClick={handleApplyDetectedMac}
                                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition"
                                            >
                                                <Check size={14} />
                                                Gunakan MAC Ini
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDetectedMac(null)}
                                                className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600"
                                                title="Abaikan"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 5. UPLOAD FOTO PELANGGAN & PERANGKAT */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Foto Depan Rumah */}
                                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                                        Foto Depan Rumah
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handlePhotoChange(e, 'foto_depan_rumah')}
                                        className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                                    />
                                    {photoPreviews.foto_depan_rumah && (
                                        <img src={photoPreviews.foto_depan_rumah} alt="Depan Rumah" className="mt-2 h-24 w-full object-cover rounded-lg border border-gray-200" />
                                    )}
                                </div>

                                {/* Foto KTP */}
                                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                                        Foto KTP Pelanggan
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handlePhotoChange(e, 'foto_ktp')}
                                        className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                                    />
                                    {photoPreviews.foto_ktp && (
                                        <img src={photoPreviews.foto_ktp} alt="KTP" className="mt-2 h-24 w-full object-cover rounded-lg border border-gray-200" />
                                    )}
                                </div>

                                {/* Foto Modem (Dengan Auto Scanner) */}
                                <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/30">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-xs font-semibold text-purple-900">
                                            Foto Stiker / Label Modem (Auto Scan MAC)
                                        </label>
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handlePhotoChange(e, 'foto_modem')}
                                        className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-100 file:text-purple-800 hover:file:bg-purple-200 cursor-pointer"
                                    />
                                    {photoPreviews.foto_modem && (
                                        <img src={photoPreviews.foto_modem} alt="Modem" className="mt-2 h-24 w-full object-cover rounded-lg border border-gray-200" />
                                    )}
                                </div>

                                {/* Foto Redaman OPM */}
                                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                                        Foto Redaman OPM
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handlePhotoChange(e, 'foto_opm')}
                                        className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                                    />
                                    {photoPreviews.foto_opm && (
                                        <img src={photoPreviews.foto_opm} alt="Redaman OPM" className="mt-2 h-24 w-full object-cover rounded-lg border border-gray-200" />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-end gap-3">
                            <Link to="/customer-verification" className="w-full sm:w-auto">
                                <Button variant="secondary" type="button" className="w-full">
                                    Batal
                                </Button>
                            </Link>
                            <Button
                                type="submit"
                                variant="primary"
                                disabled={submitting}
                                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 px-6 py-2.5 font-semibold"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin mr-2" />
                                        Mendaftarkan & Sinkronisasi...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={16} className="mr-2" />
                                        Simpan Pendaftaran Pelanggan
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* SUCCESS MODAL */}
            {successModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center space-y-4 animate-in fade-in zoom-in duration-150">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 size={36} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">Pendaftaran Berhasil!</h3>
                            <p className="text-sm text-gray-600 mt-1.5">{successModal.message}</p>
                            <p className="text-xs text-gray-400 mt-1">Data telah disinkronkan dan siap diverifikasi.</p>
                        </div>
                        <div className="pt-3 space-y-2">
                            <Button
                                variant="primary"
                                onClick={() => navigate(`/customer-verification/verify/${successModal.encodedTimestamp}`)}
                                className="w-full bg-green-600 hover:bg-green-700 py-2.5 font-semibold"
                            >
                                Lanjut ke Verifikasi & Aktivasi →
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setSuccessModal({ open: false, message: '', encodedTimestamp: '' });
                                    setFormData(INITIAL_FORM);
                                    setPhotos({ foto_depan_rumah: null, foto_ktp: null, foto_modem: null, foto_opm: null });
                                    setPhotoPreviews({ foto_depan_rumah: null, foto_ktp: null, foto_modem: null, foto_opm: null });
                                    setSelectedProspectId(null);
                                }}
                                className="w-full"
                            >
                                Daftarkan Pelanggan Lain
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => navigate('/customer-verification')}
                                className="w-full text-gray-500 text-xs border-transparent hover:bg-gray-100"
                            >
                                Kembali ke Daftar Verifikasi
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerRegistrationForm;
