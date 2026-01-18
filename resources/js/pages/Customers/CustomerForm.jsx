import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, MapPin } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import customerService from '../../services/customerService';
import odpService from '../../services/odpService';

function CustomerForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(!!id);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [odpList, setOdpList] = useState([]);
    const [gettingLocation, setGettingLocation] = useState(false);

    const [secretInfo, setSecretInfo] = useState(null);
    const [showSecretModal, setShowSecretModal] = useState(false);

    const [formData, setFormData] = useState({
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
        odp: '',
        installation_fee: '',
        is_active: true,
        latitude: '',
        longitude: '',
        last_payment_date: '',
        active_until: '',
    });

    // Remove photos state completely - no longer needed

    useEffect(() => {
        fetchOdpList();
        if (id) {
            fetchCustomer();
        }
    }, [id]);

    const fetchOdpList = async () => {
        try {
            const response = await odpService.getAll();
            setOdpList(response.data.data || []);
        } catch (err) {
            console.error('Failed to load ODP list', err);
        }
    };

    const fetchCustomer = async () => {
        try {
            const response = await customerService.getById(id);
            const data = response.data.data;
            setFormData({
                name: data.name || '',
                area_code: data.area_code || '',
                email: data.email || '',
                phone: data.phone || '',
                address: data.address || '',
                gender: data.gender || '',
                package_type: data.package_type || '',
                custom_package: data.custom_package || '',
                activation_date: data.activation_date || '',
                due_date: data.due_date || '',
                pppoe_username: data.pppoe_username || '',
                odp: data.odp || '',
                installation_fee: data.installation_fee || '',
                is_active: data.is_active ?? true,
                latitude: data.latitude || '',
                longitude: data.longitude || '',
                last_payment_date: data.last_payment_date || '',
                active_until: data.active_until || '',
            });
        } catch (err) {
            setError('Gagal memuat data pelanggan');
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
            // Use FormData for file uploads
            const data = new FormData();
            Object.keys(formData).forEach((key) => {
                if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
                    if (key === 'is_active') {
                        data.append(key, formData[key] ? '1' : '0');
                    } else {
                        data.append(key, formData[key]);
                    }
                }
            });

            if (id) {
                await customerService.updateWithFiles(id, data);
                setSuccess(true);
                setTimeout(() => navigate('/customers'), 1500);
            } else {
                const response = await customerService.createWithFiles(data);
                console.log('Create customer response:', response.data);
                
                // Check if secret was created
                if (response.data.secret && !response.data.secret.error) {
                    console.log('Secret created successfully:', response.data.secret);
                    setSecretInfo(response.data.secret);
                    setShowSecretModal(true);
                    setSuccess(true);
                    // Don't auto-redirect when secret modal is shown
                } else if (response.data.secret && response.data.secret.error) {
                    console.error('Secret creation error:', response.data.secret.error);
                    setSuccess(true);
                    const errorMsg = response.data.secret.error;
                    const userFriendlyMsg = errorMsg.includes('Profile') 
                        ? 'Pelanggan berhasil ditambahkan, tapi gagal membuat secret PPPoE. ' + errorMsg
                        : 'Pelanggan berhasil ditambahkan, tapi gagal membuat secret PPPoE: ' + errorMsg;
                    setError(userFriendlyMsg);
                    setTimeout(() => navigate('/customers'), 5000);
                } else {
                    console.log('No secret created (probably custom package)');
                    setSuccess(true);
                    setTimeout(() => navigate('/customers'), 1500);
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan data pelanggan');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner text="Memuat formulir..." />
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/customers')}
                    className="text-gray-600 hover:text-gray-900"
                >
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                        {id ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}
                    </h1>
                </div>
            </div>

            {error && (
                <Alert
                    type="error"
                    title="Error"
                    message={error}
                    onClose={() => setError(null)}
                />
            )}

            {success && (
                <Alert
                    type="success"
                    title="Berhasil"
                    message={id ? 'Data pelanggan berhasil diperbarui' : 'Pelanggan baru berhasil ditambahkan'}
                />
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
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
                        {!id && (
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
                                    maxLength="10"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Contoh: CJA, KBS, CNS"
                                />
                                <p className="text-xs text-gray-500 mt-1">Kode wilayah untuk username PPPoE (3 huruf)</p>
                            </div>
                        )}
                        {id && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Username PPPoE
                                    </label>
                                    <input
                                        type="text"
                                        name="pppoe_username"
                                        value={formData.pppoe_username}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Username PPPoE"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Edit username PPPoE (hanya update database, tidak mengubah MikroTik)</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tanggal Pembayaran Terakhir
                                    </label>
                                    <input
                                        type="date"
                                        name="last_payment_date"
                                        value={formData.last_payment_date}
                                        readOnly
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tanggal Aktif Sampai
                                    </label>
                                    <input
                                        type="date"
                                        name="active_until"
                                        value={formData.active_until}
                                        readOnly
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                                    />
                                </div>
                            </>
                        )}
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
                                <option value="Paket 150k">Paket 150k</option>
                                <option value="Paket 175k">Paket 175k</option>
                                <option value="Paket 200k">Paket 200k</option>
                                <option value="Paket 250k">Paket 250k</option>
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
                        onClick={() => navigate('/customers')}
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
                                Menyimpan...
                            </>
                        ) : (
                            'Simpan'
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
                                <h3 className="text-xl font-bold text-gray-900">PPPoE Secret Berhasil Dibuat</h3>
                                <p className="text-sm text-gray-500">Simpan informasi berikut untuk pelanggan</p>
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
                                <p className="text-xs text-gray-500 mb-1">Service</p>
                                <p className="text-sm font-medium text-gray-900">{secretInfo.service}</p>
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
                                    navigate('/customers');
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
    );
}

export default CustomerForm;
