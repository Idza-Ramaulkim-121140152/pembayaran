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
    kecamatan_id: '',
    desa_id: '',
    dusun_id: '',
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
    enable_home_router: false,
    enable_installation_team: false,
    odp: '',
    installation_fee: '',
    is_active: true,
    latitude: '',
    longitude: '',
    installer_member_ids: [],
    installation_router_item_id: '',
    installation_cable_item_id: '',
    installation_cable_used: '',
    installation_labor_fee: '',
    installation_cable_rate: '',
    installation_notes: '',
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
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorModalMessage, setErrorModalMessage] = useState('');
    const [payrollMembers, setPayrollMembers] = useState([]);
    const [kecamatanOptions, setKecamatanOptions] = useState([]);
    const [desaOptions, setDesaOptions] = useState([]);
    const [dusunOptions, setDusunOptions] = useState([]);
    const [installInventoryOptions, setInstallInventoryOptions] = useState({
        all_items: [],
        router_items: [],
        cable_items: [],
        default_pricing: {
            installation_labor_fee_default: 0,
            installation_cable_rate_default: 0,
        },
    });

    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const selectedRouterPreset = getHomeRouterPreset(formData.home_router_type);

    const routerStockOptions = installInventoryOptions.router_items?.length > 0
        ? installInventoryOptions.router_items
        : installInventoryOptions.all_items;
    const cableStockOptions = installInventoryOptions.cable_items?.length > 0
        ? installInventoryOptions.cable_items
        : installInventoryOptions.all_items;

    useEffect(() => {
        fetchOdpList();
        fetchPackageList();
        fetchPayrollMembers();
        fetchInstallInventoryOptions();
        fetchKecamatanOptions();
        fetchCustomerData();
    }, [timestamp]);

    useEffect(() => {
        if (!formData.kecamatan_id) {
            setDesaOptions([]);
            setDusunOptions([]);
            setFormData((prev) => ({ ...prev, desa_id: '', dusun_id: '' }));
            return;
        }

        fetchDesaOptions(formData.kecamatan_id);
    }, [formData.kecamatan_id]);

    useEffect(() => {
        if (!formData.desa_id) {
            setDusunOptions([]);
            setFormData((prev) => ({ ...prev, dusun_id: '' }));
            return;
        }

        fetchDusunOptions(formData.desa_id);
    }, [formData.desa_id]);

    const fetchPackageList = async () => {
        try {
            const response = await fetch('/api/packages/active');
            const data = await response.json();
            setPackageList(data.data || []);
        } catch (err) {
            console.error('Failed to load package list', err);
        }
    };

    const fetchKecamatanOptions = async () => {
        try {
            const response = await fetch('/api/master-wilayah/kecamatan', {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat master kecamatan');
            }

            const data = await response.json();
            setKecamatanOptions(data.data || []);
        } catch (err) {
            console.error('Failed to load kecamatan options', err);
        }
    };

    const fetchDesaOptions = async (kecamatanId) => {
        try {
            const response = await fetch(`/api/master-wilayah/desa?kecamatan_id=${encodeURIComponent(kecamatanId)}`, {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat master desa');
            }

            const data = await response.json();
            setDesaOptions(data.data || []);
        } catch (err) {
            console.error('Failed to load desa options', err);
        }
    };

    const fetchDusunOptions = async (desaId) => {
        try {
            const response = await fetch(`/api/master-wilayah/dusun?desa_id=${encodeURIComponent(desaId)}`, {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat master dusun');
            }

            const data = await response.json();
            setDusunOptions(data.data || []);
        } catch (err) {
            console.error('Failed to load dusun options', err);
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

    const fetchPayrollMembers = async () => {
        try {
            const response = await fetch('/api/payroll/members-lite', {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat data pelaksana payroll');
            }

            const data = await response.json();
            setPayrollMembers(data.data || []);
        } catch (err) {
            console.error('Failed to load payroll members', err);
        }
    };

    const fetchInstallInventoryOptions = async () => {
        try {
            const response = await fetch('/api/inventory/items/install-options', {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat opsi stok inventori instalasi');
            }

            const data = await response.json();
            const defaultPricing = {
                installation_labor_fee_default: data?.default_pricing?.installation_labor_fee_default ?? 0,
                installation_cable_rate_default: data?.default_pricing?.installation_cable_rate_default ?? 0,
            };

            setInstallInventoryOptions({
                all_items: data.all_items || [],
                router_items: data.router_items || [],
                cable_items: data.cable_items || [],
                default_pricing: defaultPricing,
            });

            setFormData((prev) => {
                const hasLaborFee = prev.installation_labor_fee !== ''
                    && prev.installation_labor_fee !== null
                    && prev.installation_labor_fee !== undefined;
                const hasCableRate = prev.installation_cable_rate !== ''
                    && prev.installation_cable_rate !== null
                    && prev.installation_cable_rate !== undefined;

                return {
                    ...prev,
                    installation_labor_fee: hasLaborFee
                        ? prev.installation_labor_fee
                        : String(defaultPricing.installation_labor_fee_default ?? 0),
                    installation_cable_rate: hasCableRate
                        ? prev.installation_cable_rate
                        : String(defaultPricing.installation_cable_rate_default ?? 0),
                };
            });
        } catch (err) {
            console.error('Failed to load inventory install options', err);
        }
    };

    const fetchCustomerData = async () => {
        try {
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

            const hasSanitizedLaborFee = sanitizedData.installation_labor_fee !== ''
                && sanitizedData.installation_labor_fee !== null
                && sanitizedData.installation_labor_fee !== undefined;
            const hasSanitizedCableRate = sanitizedData.installation_cable_rate !== ''
                && sanitizedData.installation_cable_rate !== null
                && sanitizedData.installation_cable_rate !== undefined;
            
            setFormData((prev) => ({
                ...DEFAULT_FORM_DATA,
                ...sanitizedData,
                installation_labor_fee: hasSanitizedLaborFee
                    ? sanitizedData.installation_labor_fee
                    : prev.installation_labor_fee,
                installation_cable_rate: hasSanitizedCableRate
                    ? sanitizedData.installation_cable_rate
                    : prev.installation_cable_rate,
            }));
            setSheetsReference(data.sheets_reference);
        } catch (err) {
            setError(err.message || 'Gagal memuat data pelanggan');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const composeAddressFromSelection = (dusunId, desaId, kecamatanId) => {
        const selectedDusun = dusunOptions.find((item) => String(item.id) === String(dusunId));
        const selectedDesa = desaOptions.find((item) => String(item.id) === String(desaId));
        const selectedKecamatan = kecamatanOptions.find((item) => String(item.id) === String(kecamatanId));
        const parts = [
            selectedDusun?.name,
            selectedDesa?.name,
            selectedKecamatan?.name,
        ].filter(Boolean);
        return parts.join(', ');
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

        if (name === 'enable_home_router') {
            setFormData((prev) => {
                if (checked) {
                    return {
                        ...prev,
                        enable_home_router: true,
                    };
                }

                return {
                    ...prev,
                    enable_home_router: false,
                    home_router_monitoring_enabled: false,
                    home_router_type: 'mikrotik',
                    home_router_host: '',
                    home_router_port: '8728',
                    home_router_username: '',
                    home_router_password: '',
                    home_router_wan_interface: '',
                };
            });

            return;
        }

        if (name === 'enable_installation_team') {
            setFormData((prev) => {
                if (checked) {
                    return {
                        ...prev,
                        enable_installation_team: true,
                    };
                }

                return {
                    ...prev,
                    enable_installation_team: false,
                    installer_member_ids: [],
                    installation_router_item_id: '',
                    installation_cable_item_id: '',
                    installation_cable_used: '',
                    installation_labor_fee: '',
                    installation_cable_rate: '',
                    installation_notes: '',
                };
            });

            return;
        }

        if (name === 'kecamatan_id') {
            setFormData((prev) => ({
                ...prev,
                kecamatan_id: value,
                desa_id: '',
                dusun_id: '',
            }));
            return;
        }

        if (name === 'desa_id') {
            setFormData((prev) => ({
                ...prev,
                desa_id: value,
                dusun_id: '',
            }));
            return;
        }

        if (name === 'dusun_id') {
            setFormData((prev) => ({
                ...prev,
                dusun_id: value,
                address: composeAddressFromSelection(value, prev.desa_id, prev.kecamatan_id),
            }));
            return;
        }
        
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleInstallerToggle = (memberId) => {
        setFormData((prev) => {
            const current = Array.isArray(prev.installer_member_ids) ? prev.installer_member_ids : [];
            const numericMemberId = Number(memberId);

            if (current.includes(numericMemberId)) {
                return {
                    ...prev,
                    installer_member_ids: current.filter((id) => id !== numericMemberId),
                };
            }

            return {
                ...prev,
                installer_member_ids: [...current, numericMemberId],
            };
        });
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
        setShowErrorModal(false);
        setErrorModalMessage('');

        try {
            const payload = {
                ...formData,
                kecamatan_id: formData.kecamatan_id ? Number(formData.kecamatan_id) : null,
                desa_id: formData.desa_id ? Number(formData.desa_id) : null,
                dusun_id: formData.dusun_id ? Number(formData.dusun_id) : null,
                enable_home_router: Boolean(formData.enable_home_router),
                enable_installation_team: Boolean(formData.enable_installation_team),
                installer_member_ids: Array.isArray(formData.installer_member_ids)
                    ? formData.installer_member_ids
                    : [],
                installation_router_item_id: formData.installation_router_item_id || null,
                installation_cable_item_id: formData.installation_cable_item_id || null,
                installation_cable_used: formData.installation_cable_used === '' ? null : formData.installation_cable_used,
                installation_labor_fee: formData.installation_labor_fee === '' ? null : formData.installation_labor_fee,
                installation_cable_rate: formData.installation_cable_rate === '' ? null : formData.installation_cable_rate,
                installation_notes: formData.installation_notes || null,
            };

            if (!payload.enable_home_router) {
                payload.home_router_type = null;
                payload.home_router_host = null;
                payload.home_router_port = null;
                payload.home_router_username = null;
                payload.home_router_password = null;
                payload.home_router_wan_interface = null;
                payload.home_router_monitoring_enabled = false;
            }

            if (!payload.enable_installation_team) {
                payload.installer_member_ids = [];
                payload.installation_router_item_id = null;
                payload.installation_cable_item_id = null;
                payload.installation_cable_used = null;
                payload.installation_labor_fee = null;
                payload.installation_cable_rate = null;
                payload.installation_notes = null;
            }

            const response = await fetch('/api/customer-verification/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                    'Accept': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                const message = errorData.message || 'Failed to verify customer';
                throw new Error(message);
            }

            const result = await response.json();

            if (!result?.secret?.name || !result?.secret?.password) {
                throw new Error('Secret PPPoE tidak tersedia pada respons verifikasi.');
            }

            setSecretInfo(result.secret || null);
            setShowSecretModal(true);
            setSuccess(true);
        } catch (err) {
            const message = err.message || 'Gagal memverifikasi pelanggan';
            setError(message);
            setErrorModalMessage(message);
            setShowErrorModal(true);
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
                                    Kecamatan <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="kecamatan_id"
                                    value={formData.kecamatan_id}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Pilih Kecamatan</option>
                                    {kecamatanOptions.map((kecamatan) => (
                                        <option key={kecamatan.id} value={kecamatan.id}>
                                            {kecamatan.name} ({kecamatan.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Desa <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="desa_id"
                                    value={formData.desa_id}
                                    onChange={handleChange}
                                    required
                                    disabled={!formData.kecamatan_id}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                                >
                                    <option value="">Pilih Desa</option>
                                    {desaOptions.map((desa) => (
                                        <option key={desa.id} value={desa.id}>
                                            {desa.name} ({desa.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Dusun <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="dusun_id"
                                    value={formData.dusun_id}
                                    onChange={handleChange}
                                    required
                                    disabled={!formData.desa_id}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                                >
                                    <option value="">Pilih Dusun</option>
                                    {dusunOptions.map((dusun) => (
                                        <option key={dusun.id} value={dusun.id}>
                                            {dusun.name} ({dusun.code})
                                        </option>
                                    ))}
                                </select>
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
                                    readOnly
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                                    placeholder="Alamat otomatis dari master wilayah"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Format username otomatis: KODEKEC+KODEDES+KODEDUS-namadepan003.
                        </p>
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
                        <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                            <input
                                type="checkbox"
                                name="enable_home_router"
                                checked={formData.enable_home_router}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Aktifkan Router Rumah Pelanggan</span>
                        </label>

                        {formData.enable_home_router && (
                            <div className="mt-4">
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
                        )}
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

                    {/* Installation Team & Material Details */}
                    <div>
                        <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                            <input
                                type="checkbox"
                                name="enable_installation_team"
                                checked={formData.enable_installation_team}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Aktifkan Pelaksana Pemasangan</span>
                        </label>

                        {formData.enable_installation_team && (
                            <div className="mt-4">
                                <h2 className="text-xl font-bold text-gray-900 mb-4">Pelaksana Pemasangan</h2>

                                <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                                    Pilih teknisi pelaksana dan detail material instalasi. Saat verifikasi disimpan, data ini otomatis masuk ke payroll proyek pemasangan dan inventori (stok router/kabel berkurang sesuai pemakaian).
                                </div>

                                <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Checklist Pelaksana (Teknisi)
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                                    {payrollMembers.length === 0 ? (
                                        <p className="text-sm text-gray-500">Belum ada data anggota payroll. Tambahkan anggota di menu Payroll terlebih dahulu.</p>
                                    ) : payrollMembers.map((member) => {
                                        const checked = Array.isArray(formData.installer_member_ids)
                                            ? formData.installer_member_ids.includes(Number(member.id))
                                            : false;

                                        return (
                                            <label key={member.id} className="flex items-center gap-2 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => handleInstallerToggle(member.id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                                />
                                                <span>{member.nama}</span>
                                                {member.telepon && (
                                                    <span className="text-xs text-gray-400">({member.telepon})</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Router dari Stok Inventori
                                    </label>
                                    <select
                                        name="installation_router_item_id"
                                        value={formData.installation_router_item_id}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">Tidak dipilih</option>
                                        {routerStockOptions.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({item.type_name || 'Tanpa jenis'}) - stok {Number(item.current_stock || 0).toLocaleString('id-ID')} {item.unit || ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">Saat verifikasi, stok router ini akan berkurang 1 unit.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Kabel dari Stok Inventori
                                    </label>
                                    <select
                                        name="installation_cable_item_id"
                                        value={formData.installation_cable_item_id}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">Tidak dipilih</option>
                                        {cableStockOptions.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({item.type_name || 'Tanpa jenis'}) - stok {Number(item.current_stock || 0).toLocaleString('id-ID')} {item.unit || ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Habis Kabel
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        name="installation_cable_used"
                                        value={formData.installation_cable_used}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Contoh: 35"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Jika diisi, stok kabel terpilih otomatis berkurang sesuai angka ini.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Biaya Pasang (Payroll)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        name="installation_labor_fee"
                                        value={formData.installation_labor_fee}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Nilai default diambil dari master data inventori, tetap bisa diubah.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Harga Kabel (Payroll)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        name="installation_cable_rate"
                                        value={formData.installation_cable_rate}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Nilai default diambil dari master data inventori, tetap bisa diubah.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Catatan Pemasangan
                                </label>
                                <textarea
                                    name="installation_notes"
                                    value={formData.installation_notes}
                                    onChange={handleChange}
                                    rows={2}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Catatan tambahan instalasi"
                                />
                            </div>
                                </div>
                            </div>
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

                {showErrorModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                            <h3 className="text-xl font-bold text-red-700 mb-2">Verifikasi Gagal</h3>
                            <p className="text-sm text-gray-700 mb-4">
                                {errorModalMessage || 'Terjadi kesalahan saat verifikasi pelanggan.'}
                            </p>
                            <button
                                onClick={() => setShowErrorModal(false)}
                                className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium"
                                type="button"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default CustomerVerificationForm;
