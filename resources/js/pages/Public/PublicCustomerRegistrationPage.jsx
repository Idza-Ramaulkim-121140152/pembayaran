import { useEffect, useState } from 'react';
import { 
    Wifi, User, Phone, MapPin, Camera, CheckCircle2, 
    AlertCircle, Loader2, Sparkles, Shield, ArrowRight, 
    Send, Info, ChevronRight, HelpCircle, Zap, Trash2
} from 'lucide-react';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import { compressImage, formatFileSize } from '../../utils/imageCompressor';

function PublicCustomerRegistrationPage() {
    const [formData, setFormData] = useState({
        nama: '',
        no_telp: '',
        nik: '',
        jenis_kelamin: 'Laki-laki',
        kecamatan_id: '',
        desa_id: '',
        dusun_id: '',
        alamat: '',
        latitude: '',
        longitude: '',
        paket: '',
        paket_custom: '',
        catatan: '',
    });

    const [packageList, setPackageList] = useState([]);
    const [kecamatanList, setKecamatanList] = useState([]);
    const [desaList, setDesaList] = useState([]);
    const [dusunList, setDusunList] = useState([]);
    
    const [fotoDepanRumah, setFotoDepanRumah] = useState(null);
    const [fotoDepanRumahPreview, setFotoDepanRumahPreview] = useState(null);
    const [compressingPhoto, setCompressingPhoto] = useState(false);
    const [compressionInfo, setCompressionInfo] = useState(null);

    const [fotoKtp, setFotoKtp] = useState(null);
    const [fotoKtpPreview, setFotoKtpPreview] = useState(null);

    const [gettingLocation, setGettingLocation] = useState(false);
    const [locationSuccess, setLocationSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [registeredResult, setRegisteredResult] = useState(null);

    useEffect(() => {
        fetchPackages();
        fetchKecamatan();
    }, []);

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

    const fetchPackages = async () => {
        try {
            const res = await fetch('/api/public/packages');
            const json = await res.json();
            setPackageList(json.data || []);
        } catch (e) {
            console.error('Failed to fetch packages', e);
        }
    };

    const fetchKecamatan = async () => {
        try {
            const res = await fetch('/api/public/wilayah/kecamatan');
            const json = await res.json();
            setKecamatanList(json.data || []);
        } catch (e) {
            console.error('Failed to fetch kecamatan', e);
        }
    };

    const fetchDesa = async (kecamatanId) => {
        try {
            const res = await fetch(`/api/public/wilayah/desa?kecamatan_id=${encodeURIComponent(kecamatanId)}`);
            const json = await res.json();
            setDesaList(json.data || []);
        } catch (e) {
            console.error('Failed to fetch desa', e);
        }
    };

    const fetchDusun = async (desaId) => {
        try {
            const res = await fetch(`/api/public/wilayah/dusun?desa_id=${encodeURIComponent(desaId)}`);
            const json = await res.json();
            setDusunList(json.data || []);
        } catch (e) {
            console.error('Failed to fetch dusun', e);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handlePhotoChange = async (e, type) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (type === 'depan_rumah') {
            setCompressingPhoto(true);
            setFotoDepanRumahPreview(URL.createObjectURL(file));

            try {
                const result = await compressImage(file, {
                    maxWidth: 1600,
                    maxHeight: 1600,
                    quality: 0.8,
                });
                setFotoDepanRumah(result.file);
                setFotoDepanRumahPreview(result.previewUrl);
                setCompressionInfo({
                    originalSize: result.originalSize,
                    compressedSize: result.compressedSize,
                    ratio: result.ratio,
                });
            } catch (err) {
                console.error('Compression failed, using raw:', err);
                setFotoDepanRumah(file);
            } finally {
                setCompressingPhoto(false);
            }
        } else {
            setFotoKtp(file);
            setFotoKtpPreview(URL.createObjectURL(file));
        }
    };

    const handleGetCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Browser Anda tidak mendukung deteksi lokasi otomatis.');
            return;
        }

        setGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setFormData((prev) => ({
                    ...prev,
                    latitude: String(pos.coords.latitude),
                    longitude: String(pos.coords.longitude),
                }));
                setLocationSuccess(true);
                setGettingLocation(false);
            },
            (err) => {
                console.warn('GPS location error:', err);
                setGettingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (compressingPhoto) {
            setError('Mohon tunggu, foto sedang dikompresi otomatis...');
            return;
        }

        if (!formData.nama.trim()) {
            setError('Nama lengkap wajib diisi.');
            return;
        }
        if (!formData.no_telp.trim()) {
            setError('Nomor WhatsApp wajib diisi agar tim kami bisa menghubungi Anda.');
            return;
        }
        if (!formData.kecamatan_id || !formData.desa_id || !formData.dusun_id) {
            setError('Silakan pilih wilayah Kecamatan, Desa, dan Dusun.');
            return;
        }
        if (!formData.paket) {
            setError('Silakan pilih salah satu Paket Internet.');
            return;
        }
        if (!fotoDepanRumah) {
            setError('Mohon lampirkan Foto Depan Rumah untuk memudahkan tim teknisi survey & pasang.');
            return;
        }

        setSubmitting(true);

        const postData = new FormData();
        Object.entries(formData).forEach(([key, val]) => {
            postData.append(key, val ?? '');
        });

        if (fotoDepanRumah) postData.append('foto_depan_rumah', fotoDepanRumah);
        if (fotoKtp) postData.append('foto_ktp', fotoKtp);
        postData.append('source', 'public');

        try {
            const res = await fetch('/api/public/register-prospect', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: postData,
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.message || Object.values(json.errors || {}).flat().join(', ') || 'Gagal mengirim pendaftaran.');
            }

            setRegisteredResult(json);
        } catch (err) {
            setError(err.message || 'Terjadi kendala saat mengirim pendaftaran. Silakan coba lagi.');
        } finally {
            setSubmitting(false);
        }
    };

    if (registeredResult) {
        const regNo = registeredResult.registration_no || 'REGISTRASI-BERHASIL';

        return (
            <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 sm:p-6">
                <div className="max-w-lg w-full bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md text-center space-y-6 animate-in fade-in zoom-in duration-200">
                    <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/40">
                        <CheckCircle2 size={44} />
                    </div>

                    <div className="space-y-2">
                        <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
                            Pendaftaran Terkirim
                        </span>
                        <h1 className="text-2xl font-black text-white">Terima Kasih!</h1>
                        <p className="text-sm text-slate-300">
                            Permintaan pasang baru Anda telah kami terima dan langsung diteruskan ke tim teknisi lapangan kami.
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-700 text-left space-y-2">
                        <div className="flex justify-between items-center text-xs text-slate-400">
                            <span>Nomor Registrasi</span>
                            <span className="font-mono text-emerald-400 font-bold">{regNo}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-slate-400">
                            <span>Nama Pemohon</span>
                            <span className="text-white font-semibold">{formData.nama}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-slate-400">
                            <span>Paket Layanan</span>
                            <span className="text-indigo-400 font-bold">{formData.paket}</span>
                        </div>
                    </div>

                    <div className="text-xs text-slate-400 bg-slate-900/40 p-3.5 rounded-xl border border-slate-700/60 flex items-start gap-2 text-left">
                        <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                        <span>
                            Tim teknisi kami akan segera menghubungi nomor WhatsApp Anda (<strong>{formData.no_telp}</strong>) untuk konfirmasi jadwal survey dan instalasi kabel ke rumah Anda.
                        </span>
                    </div>

                    <Button
                        variant="primary"
                        onClick={() => {
                            setRegisteredResult(null);
                            setFormData({
                                nama: '',
                                no_telp: '',
                                nik: '',
                                jenis_kelamin: 'Laki-laki',
                                kecamatan_id: '',
                                desa_id: '',
                                dusun_id: '',
                                alamat: '',
                                latitude: '',
                                longitude: '',
                                paket: '',
                                paket_custom: '',
                                catatan: '',
                            });
                            setFotoDepanRumah(null);
                            setFotoDepanRumahPreview(null);
                            setCompressionInfo(null);
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-emerald-600/30"
                    >
                        Daftar Pemasangan Baru Lainnya
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 rounded-3xl p-6 sm:p-8 border border-indigo-500/30 shadow-2xl relative overflow-hidden">
                    <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="flex items-center gap-3 text-indigo-300 text-xs font-bold uppercase tracking-widest mb-2">
                        <Wifi size={16} />
                        <span>Rumah Kita Network · Pendaftaran Online</span>
                    </div>
                    
                    <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                        Formulir Registrasi Pemasangan Internet
                    </h1>
                    <p className="mt-2 text-sm text-indigo-200 max-w-xl">
                        Nikmati koneksi internet fiber optik unlimited super cepat, stabil, dan tanpa batas kuota langsung ke rumah Anda.
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-3xl shadow-xl text-gray-900 overflow-hidden border border-gray-100">
                    <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
                        {error && (
                            <Alert
                                type="error"
                                message={error}
                                onClose={() => setError(null)}
                            />
                        )}

                        {/* Section 1: Data Pemohon */}
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2 border-b border-gray-100 pb-2">
                                <User size={16} /> 1. Identitas Pemohon
                            </h2>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Nama Lengkap Sesuai KTP <span className="text-red-500">*</span>
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
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Nomor WhatsApp / HP Aktif <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        name="no_telp"
                                        required
                                        value={formData.no_telp}
                                        onChange={handleInputChange}
                                        placeholder="08xxxxxxxxxx"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        Nomor ini akan digunakan tim teknisi untuk konfirmasi kedatangan survey.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        NIK (Nomor KTP) (Opsional)
                                    </label>
                                    <input
                                        type="text"
                                        name="nik"
                                        maxLength={20}
                                        value={formData.nik}
                                        onChange={handleInputChange}
                                        placeholder="16 digit NIK"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Wilayah & Lokasi */}
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-2 border-b border-gray-100 pb-2">
                                <MapPin size={16} /> 2. Lokasi Pemasangan
                            </h2>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Kecamatan <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="kecamatan_id"
                                        required
                                        value={formData.kecamatan_id}
                                        onChange={handleInputChange}
                                        className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="">Pilih Kecamatan</option>
                                        {kecamatanList.map((k) => (
                                            <option key={k.id} value={k.id}>
                                                {k.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Desa / Kelurahan <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="desa_id"
                                        required
                                        disabled={!formData.kecamatan_id}
                                        value={formData.desa_id}
                                        onChange={handleInputChange}
                                        className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    >
                                        <option value="">Pilih Desa</option>
                                        {desaList.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Dusun / RT / RW <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="dusun_id"
                                        required
                                        disabled={!formData.desa_id}
                                        value={formData.dusun_id}
                                        onChange={handleInputChange}
                                        className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    >
                                        <option value="">Pilih Dusun</option>
                                        {dusunList.map((du) => (
                                            <option key={du.id} value={du.id}>
                                                {du.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Detail Alamat / Patokan Rumah
                                </label>
                                <textarea
                                    name="alamat"
                                    rows={2}
                                    value={formData.alamat}
                                    onChange={handleInputChange}
                                    placeholder="Contoh: Samping Toko Sembako Bu Siti, pagar warna hijau"
                                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* GPS Button */}
                            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                                <div className="text-xs text-emerald-900">
                                    <span className="font-bold flex items-center gap-1.5">
                                        <MapPin size={14} className="text-emerald-600" />
                                        Titik Koordinat Lokasi Rumah
                                    </span>
                                    <span className="text-emerald-700 text-[11px] block mt-0.5">
                                        {locationSuccess 
                                            ? `Koordinat terkunci: ${formData.latitude}, ${formData.longitude}` 
                                            : 'Bantu teknisi menemukan titik rumah Anda secara presisi.'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGetCurrentLocation}
                                    disabled={gettingLocation}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
                                >
                                    {gettingLocation ? (
                                        <>
                                            <Loader2 size={13} className="animate-spin" />
                                            Mendeteksi...
                                        </>
                                    ) : locationSuccess ? (
                                        <>
                                            <CheckCircle2 size={13} />
                                            Perbarui GPS
                                        </>
                                    ) : (
                                        <>
                                            <MapPin size={13} />
                                            Ambil GPS Otomatis
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Section 3: Pilihan Paket */}
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2 border-b border-gray-100 pb-2">
                                <Wifi size={16} /> 3. Pilihan Paket Internet
                            </h2>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {packageList.map((pkg) => {
                                    const isSelected = formData.paket === pkg.name;
                                    return (
                                        <label
                                            key={pkg.id}
                                            className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                                                isSelected
                                                    ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
                                                    : 'border-gray-200 hover:border-indigo-300 bg-white'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="paket"
                                                value={pkg.name}
                                                checked={isSelected}
                                                onChange={handleInputChange}
                                                className="sr-only"
                                            />
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-gray-900 text-sm">{pkg.name}</span>
                                                {pkg.speed && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                                        {pkg.speed}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-base font-black text-indigo-600">
                                                Rp {Number(pkg.price || 0).toLocaleString('id-ID')}
                                                <span className="text-xs font-normal text-gray-500"> /bulan</span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 4: Foto Depan Rumah dengan Auto Compression */}
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-purple-600 flex items-center gap-2 border-b border-gray-100 pb-2">
                                <Camera size={16} /> 4. Foto Depan Rumah
                            </h2>

                            <div className="border border-purple-200 rounded-2xl p-4 bg-purple-50/30 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-purple-950">
                                        Foto Tampak Depan Rumah <span className="text-red-500">*</span>
                                    </label>
                                    {compressionInfo && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                            <Zap size={12} />
                                            Hemat {compressionInfo.ratio}%
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    required={!fotoDepanRumah}
                                    disabled={compressingPhoto}
                                    onChange={(e) => handlePhotoChange(e, 'depan_rumah')}
                                    className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer disabled:opacity-60"
                                />

                                {compressingPhoto && (
                                    <div className="flex items-center gap-2 py-2 text-xs text-purple-600">
                                        <Loader2 size={14} className="animate-spin" />
                                        <span>Mengompresi foto otomatis agar upload cepat...</span>
                                    </div>
                                )}

                                {fotoDepanRumahPreview && !compressingPhoto && (
                                    <div className="space-y-1.5">
                                        <div className="relative group rounded-xl overflow-hidden border border-purple-200 bg-black/5 h-36 flex items-center justify-center">
                                            <img src={fotoDepanRumahPreview} alt="Depan Rumah" className="h-full w-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFotoDepanRumah(null);
                                                    setFotoDepanRumahPreview(null);
                                                    setCompressionInfo(null);
                                                }}
                                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600 transition"
                                                title="Hapus foto"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        {compressionInfo && (
                                            <p className="text-[11px] text-gray-500">
                                                Ukuran: <span className="line-through text-gray-400">{formatFileSize(compressionInfo.originalSize)}</span> ➔ <strong className="text-emerald-600">{formatFileSize(compressionInfo.compressedSize)}</strong>
                                            </p>
                                        )}
                                    </div>
                                )}

                                <p className="text-[11px] text-gray-500">
                                    Foto tampak depan rumah memudahkan teknisi menemukan tiang fiber terdekat dan jalur penarikan kabel.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Catatan / Permintaan Khusus (Opsional)
                                </label>
                                <input
                                    type="text"
                                    name="catatan"
                                    value={formData.catatan}
                                    onChange={handleInputChange}
                                    placeholder="Contoh: Mohon pasang hari Sabtu / router ditaruh di lantai 2"
                                    className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-4 border-t border-gray-100">
                            <Button
                                type="submit"
                                variant="primary"
                                disabled={submitting || compressingPhoto}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-2xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Mengirim Pendaftaran...
                                    </>
                                ) : compressingPhoto ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Mengompresi Foto...
                                    </>
                                ) : (
                                    <>
                                        <Send size={18} />
                                        Kirim Pendaftaran Pemasangan
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default PublicCustomerRegistrationPage;
