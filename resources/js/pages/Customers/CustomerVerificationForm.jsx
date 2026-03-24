import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, MapPin, ExternalLink, AlertCircle } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import { HOME_ROUTER_OPTIONS, getHomeRouterPreset } from '../../constants/homeRouterPresets';
import odpService from '../../services/odpService';

const DEFAULT_FORM_DATA = {
    google_sheets_timestamp: '',
    name: '',
    area_code: '',
    email: '',
    phone: '',
    address: '',
    gender: '',
    package_type: '',
    custom_package: '',
    activation_date: '',
    due_date: '',
    pppoe_username: '',
    home_router_type: 'mikrotik',
    home_router_host: '',
    home_router_port: '8728',
    home_router_username: '',
    home_router_password: '',
    home_router_wan_interface: '',
    home_router_monitoring_enabled: false,
    odp: '',
    installation_fee: '',
    is_active: true,
    latitude: '',
    longitude: '',
};

function CustomerVerificationForm() {
    const { timestamp } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [odpList, setOdpList] = useState([]);
    const [packageList, setPackageList] = useState([]);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [sheetsReference, setSheetsReference] = useState(null);
    const [secretInfo, setSecretInfo] = useState(null);
    const [showSecretModal, setShowSecretModal] = useState(false);

    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const selectedRouterPreset = getHomeRouterPreset(formData.home_router_type);

    useEffect(() => {
        fetchOdpList();
        fetchPackageList();
        fetchCustomerData();
    }, [timestamp]);

    const fetchPackageList = async () => {
        try {
            const response = await fetch('/api/packages/active');
            const data = await response.json();
            setPackageList(data.data || []);
        } catch (err) {
            console.error('Failed to load package list', err);
        }
    };

    const fetchOdpList = async () => {
        try {
            const response = await odpService.getAll();
            setOdpList(response.data.data || []);
        } catch (err) {
            console.error('Failed to load ODP list', err);
        }
    };

    const fetchCustomerData = async () => {
        try {
            // Decode base64 timestamp
            const decodedTimestamp = atob(timestamp);
            
            const response = await fetch(`/api/customer-verification/get/${timestamp}`, {
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch customer data');
            }

            const data = await response.json();
            
            // Ensure all values are not null (convert null to empty string)
            const sanitizedData = {};
            for (const key in data.customer_data) {
                sanitizedData[key] = data.customer_data[key] ?? '';
            }
            
            setFormData({
                ...DEFAULT_FORM_DATA,
                ...sanitizedData,
            });
            setSheetsReference(data.sheets_reference);
        } catch (err) {
            setError(err.message || 'Gagal memuat data pelanggan');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        // Auto-calculate due_date when activation_date changes (+30 days)
        if (name === 'activation_date' && value) {
            const activationDate = new Date(value);
            activationDate.setDate(activationDate.getDate() + 30);
            const dueDate = activationDate.toISOString().split('T')[0];
            setFormData((prev) => ({
                ...prev,
                [name]: value,
                due_date: dueDate,
            }));
            return;
        }

        if (name === 'home_router_type') {
            const nextPreset = getHomeRouterPreset(value);

            setFormData((prev) => {
                const currentPreset = getHomeRouterPreset(prev.home_router_type);
                const shouldReplacePort = !prev.home_router_port || prev.home_router_port === currentPreset.defaultPort;
                const shouldReplaceUsername = !prev.home_router_username || prev.home_router_username === currentPreset.defaultUsername;
                const shouldReplacePassword = !prev.home_router_password || prev.home_router_password === currentPreset.defaultPassword;

                return {
                    ...prev,
                    home_router_type: value,
                    home_router_port: shouldReplacePort ? nextPreset.defaultPort : prev.home_router_port,
                    home_router_username: shouldReplaceUsername ? nextPreset.defaultUsername : prev.home_router_username,
                    home_router_password: shouldReplacePassword ? nextPreset.defaultPassword : prev.home_router_password,
                };
            });

            return;
        }
        
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Geolocation tidak didukung oleh browser Anda');
            return;
        }
        setGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setFormData((prev) => ({
                    ...prev,
                    latitude: position.coords.latitude.toString(),
                    longitude: position.coords.longitude.toString(),
                }));
                setGettingLocation(false);
            },
            (err) => {
                setError('Gagal mendapatkan lokasi: ' + err.message);
                setGettingLocation(false);
            },
            { enableHighAccuracy: true }
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/customer-verification/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                    'Accept': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to verify customer');
            }

            const result = await response.json();
            
            // Check if secret was created
            if (result.secret && !result.secret.error) {
                setSecretInfo(result.secret);
                setShowSecretModal(true);
                setSuccess(true);
            } else if (result.secret && result.secret.error) {
                setSuccess(true);
                const errorMsg = result.secret.error;
                const userFriendlyMsg = errorMsg.includes('Profile') 
                    ? 'Pelanggan berhasil diverifikasi, tapi gagal membuat secret PPPoE. ' + errorMsg
                    : 'Pelanggan berhasil diverifikasi, tapi gagal membuat secret PPPoE: ' + errorMsg;
                setError(userFriendlyMsg);
                setTimeout(() => navigate('/customer-verification'), 5000);
            } else {
                setSuccess(true);
                setTimeout(() => navigate('/customer-verification'), 1500);
            }
        } catch (err) {
            setError(err.message || 'Gagal memverifikasi pelanggan');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner text="Memuat data pelanggan..." />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={() => navigate('/customer-verification')}
                        className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
                    >
                        <ArrowLeft size={20} className="mr-2" />
                        Kembali ke Daftar
                    </button>
                    <h1 className="text-3xl font-bold text-gray-900">Verifikasi Pelanggan</h1>
                    <p className="text-gray-600 mt-1">Lengkapi data dan verifikasi pelanggan baru</p>
                </div>

                {error && (
                    <Alert variant="error" className="mb-6">
                        {error}
                    </Alert>
                )}

                {success && !showSecretModal && (
                    <Alert variant="success" className="mb-6">
                        Pelanggan berhasil diverifikasi dan disimpan!
                    </Alert>
                )}

                {/* Google Sheets Reference - Read Only Info */}
                {sheetsReference && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                        <div className="flex items-start gap-3 mb-4">
                            <AlertCircle className="text-blue-600 mt-1" size={20} />
                            <div>
                                <h3 className="font-semibold text-blue-900 mb-2">Data dari Google Sheets (Referensi)</h3>
                                <p className="text-sm text-blue-800 mb-3">
                                    Data sensitif berikut tersimpan aman di Google Sheets dan TIDAK disimpan di database aplikasi:
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    {sheetsReference.nik && (
                                        <div>
                                            <span className="font-medium text-blue-900">NIK:</span>{' '}
                                            <span className="text-blue-700">{sheetsReference.nik}</span>
                                        </div>
                                    )}
                                    {sheetsReference.photo_ktp_url && (
                                        <div>
                                            <a 
                                                href={sheetsReference.photo_ktp_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                Lihat Foto KTP <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                    {sheetsReference.photo_front_url && (
                                        <div>
                                            <a 
                                                href={sheetsReference.photo_front_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                Lihat Foto Depan <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                    {sheetsReference.photo_modem_url && (
                                        <div>
                                            <a 
                                                href={sheetsReference.photo_modem_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                Lihat Foto Modem <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                    {sheetsReference.photo_opm_url && (
                                        <div>
                                            <a 
                                                href={sheetsReference.photo_opm_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                Lihat Foto OPM <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-8">
                    {/* Personal Information */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Informasi Pribadi</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nama <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Masukkan nama lengkap"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Kode Wilayah <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="area_code"
                                    value={formData.area_code}
                                    onChange={handleChange}
                                    required
                                    maxLength={3}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Contoh: CJA"
                                />
                                <p className="text-xs text-gray-500 mt-1">Kode wilayah untuk username PPPoE (3 huruf)</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="email@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nomor Telepon <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="08xxxxxxxxxx"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Jenis Kelamin
                                </label>
                                <select
                                    name="gender"
                                    value={formData.gender}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Pilih</option>
                                    <option value="male">Laki-laki</option>
                                    <option value="female">Perempuan</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Alamat
                                </label>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Alamat lengkap"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Service Information */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Informasi Layanan</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tipe Paket
                                </label>
                                <select
                                    name="package_type"
                                    value={formData.package_type}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Pilih Paket</option>
                                    {packageList.map(pkg => (
                                        <option key={pkg.id} value={pkg.name}>
                                            {pkg.name} - {pkg.speed} (Rp {Number(pkg.price).toLocaleString('id-ID')})
                                        </option>
                                    ))}
                                    <option value="Custom">Custom</option>
                                </select>
                            </div>
                            {formData.package_type === 'Custom' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Detail Paket Custom
                                    </label>
                                    <input
                                        type="text"
                                        name="custom_package"
                                        value={formData.custom_package}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Jelaskan paket custom"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    ODP
                                </label>
                                <select
                                    name="odp"
                                    value={formData.odp}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Pilih ODP</option>
                                    {odpList.map((odp) => (
                                        <option key={odp.id} value={odp.nama}>
                                            {odp.nama} {odp.rasio_distribusi ? `(${odp.rasio_distribusi})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Biaya Pemasangan
                                </label>
                                <input
                                    type="number"
                                    name="installation_fee"
                                    value={formData.installation_fee}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tanggal Aktivasi
                                </label>
                                <input
                                    type="date"
                                    name="activation_date"
                                    value={formData.activation_date}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <p className="text-xs text-gray-500 mt-1">Tanggal jatuh tempo otomatis +30 hari dari tanggal aktivasi</p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Router Rumah Pelanggan</h2>
                                <p className="mt-1 text-sm text-gray-600">
                                    Opsional, tapi disarankan jika portal pelanggan ingin menampilkan traffic WAN dan jumlah perangkat langsung dari rumah.
                                </p>
                            </div>
                            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                                <input
                                    type="checkbox"
                                    name="home_router_monitoring_enabled"
                                    checked={formData.home_router_monitoring_enabled}
                                    onChange={handleChange}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-gray-700">Monitoring router rumah aktif</span>
                            </label>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tipe Router
                                </label>
                                <select
                                    name="home_router_type"
                                    value={formData.home_router_type}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    {HOME_ROUTER_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-1 text-xs text-gray-500">{selectedRouterPreset.helper}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Host / IP Router
                                </label>
                                <input
                                    type="text"
                                    name="home_router_host"
                                    value={formData.home_router_host}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="192.168.88.1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Port API
                                </label>
                                <input
                                    type="number"
                                    name="home_router_port"
                                    value={formData.home_router_port}
                                    onChange={handleChange}
                                    min="1"
                                    max="65535"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="8728"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Username API
                                </label>
                                <input
                                    type="text"
                                    name="home_router_username"
                                    value={formData.home_router_username}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="admin"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Password API
                                </label>
                                <input
                                    type="password"
                                    name="home_router_password"
                                    value={formData.home_router_password}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Password router"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Interface WAN
                                </label>
                                <input
                                    type="text"
                                    name="home_router_wan_interface"
                                    value={formData.home_router_wan_interface}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="pppoe-out1"
                                />
                                <p className="mt-1 text-xs text-gray-500">Opsional. Kosongkan jika ingin dideteksi otomatis.</p>
                            </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                            {selectedRouterPreset.managementMode === 'api'
                                ? 'Monitoring langsung dari router rumah paling akurat jika pelanggan memakai MikroTik dengan API port 8728 yang bisa dijangkau server.'
                                : 'Untuk router web-managed seperti VSOL/GL-01, portal akan probe panel admin dan menyiapkan pembacaan status model-specific.'}
                        </div>
                    </div>

                    {/* Location */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Lokasi Rumah</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Latitude
                                </label>
                                <input
                                    type="text"
                                    name="latitude"
                                    value={formData.latitude}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="-6.xxxxxx"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Longitude
                                </label>
                                <input
                                    type="text"
                                    name="longitude"
                                    value={formData.longitude}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="106.xxxxxx"
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={getCurrentLocation}
                            disabled={gettingLocation}
                            className="mt-3 flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                        >
                            {gettingLocation ? (
                                <Loader size={18} className="animate-spin" />
                            ) : (
                                <MapPin size={18} />
                            )}
                            {gettingLocation ? 'Mendapatkan lokasi...' : 'Gunakan Lokasi Saat Ini'}
                        </button>
                        {formData.latitude && formData.longitude && (
                            <a
                                href={`https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                            >
                                Lihat di Google Maps →
                            </a>
                        )}
                    </div>

                    {/* Status */}
                    <div>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                name="is_active"
                                checked={formData.is_active}
                                onChange={handleChange}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Pelanggan Aktif</span>
                        </label>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-6 border-t">
                        <Button
                            variant="secondary"
                            onClick={() => navigate('/customer-verification')}
                            disabled={submitting}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            disabled={submitting}
                        >
                            {submitting ? (
                                <>
                                    <Loader className="inline mr-2 animate-spin" size={18} />
                                    Memverifikasi...
                                </>
                            ) : (
                                'Verifikasi & Simpan'
                            )}
                        </Button>
                    </div>
                </form>

                {/* Secret Info Modal */}
                {showSecretModal && secretInfo && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Verifikasi Berhasil!</h3>
                                    <p className="text-sm text-gray-500">PPPoE user telah dibuat</p>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 space-y-3 mb-4">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Username PPPoE</p>
                                    <p className="text-lg font-mono font-bold text-gray-900">{secretInfo.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Password</p>
                                    <p className="text-lg font-mono font-bold text-gray-900">{secretInfo.password}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Profile/Paket</p>
                                    <p className="text-sm font-medium text-gray-900">{secretInfo.profile}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">IP Address</p>
                                    <p className="text-sm font-mono font-medium text-gray-900">{secretInfo.remote_address}</p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowSecretModal(false);
                                        navigate('/customer-verification');
                                    }}
                                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                >
                                    Tutup & Lanjutkan
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default CustomerVerificationForm;
