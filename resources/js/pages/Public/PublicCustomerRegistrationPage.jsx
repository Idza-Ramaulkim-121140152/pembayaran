import { useEffect, useState } from 'react';
import { 
    Wifi, User, Phone, MapPin, Camera, CheckCircle2, 
    AlertCircle, Loader2, Sparkles, Shield, ArrowRight, 
    Send, Info, ChevronRight, HelpCircle
} from 'lucide-react';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';

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

    const handlePhotoChange = (e, type) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (type === 'depan_rumah') {
            setFotoDepanRumah(file);
            setFotoDepanRumahPreview(URL.createObjectURL(file));
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
        const waText = encodeURIComponent(`Halo Admin Rumah Kita Net, saya baru saja mendaftar pemasangan internet baru dengan Nomor Pendaftaran: ${regNo} atas nama ${formData.nama}. Mohon info jadwal survey/pemasangan.`);
        const adminWaUrl = `https://wa.me/6285158025553?text=${waText}`;

        return (
            <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-50/50 py-12 px-4 sm:px-6 flex items-center justify-center">
                <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-blue-100 p-8 text-center space-y-6 animate-in fade-in zoom-in duration-200">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                        <CheckCircle2 size={48} />
                    </div>

                    <div className="space-y-2">
                        <span className="inline-block px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full uppercase tracking-wider">
                            Pendaftaran Diterima
                        </span>
                        <h1 className="text-2xl font-black text-gray-900">Terima Kasih!</h1>
                        <p className="text-gray-600 text-sm">
                            Pendaftaran Anda telah berhasil dicatat ke sistem kami. Tim teknisi dan admin akan segera memverifikasi data dan menghubungi nomor WhatsApp Anda.
                        </p>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-left space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-medium">Nomor Registrasi:</span>
                            <span className="font-mono font-bold text-blue-700 text-sm">{regNo}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-medium">Nama Pelanggan:</span>
                            <span className="font-semibold text-gray-800">{formData.nama}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-medium">Nomor WhatsApp:</span>
                            <span className="font-semibold text-gray-800">{formData.no_telp}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 font-medium">Paket Dipilih:</span>
                            <span className="font-semibold text-indigo-700">{formData.paket || '-'}</span>
                        </div>
                    </div>

                    <div className="space-y-3 pt-2">
                        <a
                            href={adminWaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-600/20 transition"
                        >
                            <Send size={18} />
                            Konfirmasi Cepat via WhatsApp
                        </a>

                        <button
                            type="button"
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
                                setFotoKtp(null);
                                setFotoKtpPreview(null);
                            }}
                            className="w-full py-2.5 text-xs text-gray-500 hover:text-gray-700 font-medium"
                        >
                            Daftarkan Alamat / Pelanggan Baru Lainnya
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-gray-50 py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Brand Header */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100/80 text-blue-800 text-xs font-semibold">
                        <Wifi size={14} className="text-blue-600" />
                        Pendaftaran Pasang Baru Internet Fiber Optic
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                        Formulir Registrasi Pelanggan
                    </h1>
                    <p className="text-sm text-gray-600 max-w-md mx-auto">
                        Nikmati koneksi internet rumah super cepat & stabil tanpa batas kuota (unlimited).
                    </p>
                </div>

                {error && <Alert variant="error">{error}</Alert>}

                {/* Form Card */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-200/80 overflow-hidden">
                    <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-7">
                        {/* Section 1: Data Diri */}
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2 border-b border-gray-100 pb-2">
                                <User size={16} /> 1. Data Diri Calon Pelanggan
                            </h2>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Nama Lengkap <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="nama"
                                        required
                                        value={formData.nama}
                                        onChange={handleInputChange}
                                        placeholder="Nama sesuai KTP / panggilan"
                                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                                            Nomor WhatsApp / HP <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            name="no_telp"
                                            required
                                            value={formData.no_telp}
                                            onChange={handleInputChange}
                                            placeholder="Contoh: 08123456789"
                                            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
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
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Wilayah & Alamat */}
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-green-600 flex items-center gap-2 border-b border-gray-100 pb-2">
                                <MapPin size={16} /> 2. Lokasi & Alamat Pemasangan
                            </h2>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                                            <option key={k.id} value={k.id}>{k.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Desa <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="desa_id"
                                        required
                                        value={formData.desa_id}
                                        onChange={handleInputChange}
                                        disabled={!formData.kecamatan_id}
                                        className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    >
                                        <option value="">Pilih Desa</option>
                                        {desaList.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Dusun <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        name="dusun_id"
                                        required
                                        value={formData.dusun_id}
                                        onChange={handleInputChange}
                                        disabled={!formData.desa_id}
                                        className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                    >
                                        <option value="">Pilih Dusun</option>
                                        {dusunList.map((d) => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Alamat Lengkap / Patokan Rumah
                                </label>
                                <textarea
                                    name="alamat"
                                    rows={2}
                                    value={formData.alamat}
                                    onChange={handleInputChange}
                                    placeholder="Contoh: Depan Masjid Nurul Huda, RT 01 RW 02, pagar warna hitam"
                                    className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            {/* GPS Location Button */}
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <div className="flex items-center gap-2">
                                    <MapPin size={16} className={locationSuccess ? 'text-green-600' : 'text-gray-400'} />
                                    <span className="text-xs text-gray-700">
                                        {locationSuccess ? (
                                            <span className="text-green-700 font-semibold">Titik Koordinat GPS Terkunci ({Number(formData.latitude).toFixed(4)}, {Number(formData.longitude).toFixed(4)})</span>
                                        ) : (
                                            'Kunci titik koordinat rumah (memudahkan pencarian lokasi)'
                                        )}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGetCurrentLocation}
                                    disabled={gettingLocation}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shrink-0"
                                >
                                    {gettingLocation ? <Loader2 size={14} className="animate-spin" /> : 'Kunci Titik GPS'}
                                </button>
                            </div>
                        </div>

                        {/* Section 3: Pilihan Paket */}
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-2 border-b border-gray-100 pb-2">
                                <Wifi size={16} /> 3. Pilihan Paket Internet
                            </h2>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {packageList.map((pkg) => {
                                    const isSelected = formData.paket === pkg.name;
                                    return (
                                        <label
                                            key={pkg.id}
                                            className={`relative flex flex-col p-4 rounded-2xl border-2 cursor-pointer transition ${
                                                isSelected
                                                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                                                    : 'border-gray-200 bg-white hover:border-gray-300'
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

                        {/* Section 4: Foto Depan Rumah */}
                        <div className="space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-purple-600 flex items-center gap-2 border-b border-gray-100 pb-2">
                                <Camera size={16} /> 4. Foto Depan Rumah
                            </h2>

                            <div className="border border-purple-200 rounded-2xl p-4 bg-purple-50/30 space-y-2">
                                <label className="block text-xs font-semibold text-purple-950">
                                    Foto Tampak Depan Rumah <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    required
                                    onChange={(e) => handlePhotoChange(e, 'depan_rumah')}
                                    className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
                                />
                                {fotoDepanRumahPreview && (
                                    <img src={fotoDepanRumahPreview} alt="Depan Rumah" className="mt-2 h-36 w-full object-cover rounded-xl border border-purple-200" />
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
                                disabled={submitting}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-2xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Mengirim Pendaftaran...
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
