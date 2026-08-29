import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FileCheck, ExternalLink, Loader, Calendar, MapPin, Phone, User as UserIcon } from 'lucide-react';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import LoadingSpinner from '../../components/common/LoadingSpinner';

function CustomerVerificationPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pendingCustomers, setPendingCustomers] = useState([]);
    const [formUrl, setFormUrl] = useState('');
    const [showList, setShowList] = useState(false);

    useEffect(() => {
        fetchFormUrl();
    }, []);

    const fetchFormUrl = async () => {
        try {
            const response = await fetch('/api/customer-verification/form-url', {
                headers: {
                    'Accept': 'application/json',
                }
            });
            const data = await response.json();
            setFormUrl(data.form_url);
        } catch (err) {
            console.error('Failed to fetch form URL', err);
        }
    };

    const fetchPendingCustomers = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const response = await fetch('/api/customer-verification/pending', {
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                const detail = errorData.details ? ` (${errorData.details})` : '';
                throw new Error((errorData.message || 'Failed to fetch pending customers') + detail);
            }

            const data = await response.json();
            setPendingCustomers(data.data || []);
            setShowList(true);

            if (data.data.length === 0) {
                setError('Tidak ada pelanggan yang menunggu verifikasi');
            }
        } catch (err) {
            setError(err.message || 'Gagal mengambil data pelanggan dari Google Sheets');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleRegisterClick = () => {
        navigate('/customer-verification/register');
    };

    const handleVerifyClick = () => {
        fetchPendingCustomers();
    };

    const handleSelectCustomer = (timestamp) => {
        // Use base64 encoding to safely pass timestamp in URL
        const encodedTimestamp = btoa(timestamp);
        navigate(`/customer-verification/verify/${encodedTimestamp}`);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    if (loading && !showList) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner text="Memuat data dari Google Sheets..." />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        Verifikasi Pelanggan
                    </h1>
                    <p className="text-gray-600">
                        Pilih untuk mendaftarkan pelanggan baru atau verifikasi pelanggan yang sudah terdaftar
                    </p>
                </div>

                {error && (
                    <Alert variant="error" className="mb-6">
                        {error}
                    </Alert>
                )}

                {/* Action Cards - Only show if list not displayed */}
                {/* Action Cards - Only show if list not displayed */}
                {!showList && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        {/* Daftarkan Pelanggan Card */}
                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 bg-white/20 rounded-xl">
                                        <Users size={26} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">Daftarkan Pelanggan</h2>
                                        <p className="text-blue-100 text-xs">Formulir pendaftaran baru</p>
                                    </div>
                                </div>
                                
                                <p className="text-blue-50 text-xs mb-6 leading-relaxed">
                                    Formulir pendaftaran baru native dalam sistem. Data (Nama, NIK, foto KTP, foto Modem, MAC Address) otomatis tersimpan dan disinkronkan ke Google Sheets.
                                </p>
                            </div>

                            <Button
                                variant="secondary"
                                onClick={handleRegisterClick}
                                className="w-full bg-white text-blue-600 hover:bg-blue-50 font-semibold text-xs py-2.5"
                            >
                                <Users className="mr-2" size={16} />
                                Buka Form Pendaftaran
                            </Button>
                        </div>

                        {/* Verifikasi Calon Pelanggan Card */}
                        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 bg-white/20 rounded-xl">
                                        <UserCheck size={26} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">Calon Pelanggan</h2>
                                        <p className="text-amber-100 text-xs">Registrasi publik & lapangan</p>
                                    </div>
                                </div>
                                
                                <p className="text-amber-50 text-xs mb-6 leading-relaxed">
                                    Verifikasi pendaftaran calon pelanggan dari website publik / teknisi lapangan. Setujui untuk siap pasang atau batalkan agar antrean tidak menumpuk.
                                </p>
                            </div>

                            <Button
                                variant="secondary"
                                onClick={() => navigate('/customer-prospects')}
                                className="w-full bg-white text-orange-600 hover:bg-orange-50 font-semibold text-xs py-2.5"
                            >
                                <UserCheck className="mr-2" size={16} />
                                Kelola Calon Pelanggan
                            </Button>
                        </div>

                        {/* Verifikasi User Card */}
                        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 bg-white/20 rounded-xl">
                                        <FileCheck size={26} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">Verifikasi User</h2>
                                        <p className="text-green-100 text-xs">Verifikasi & aktivasi</p>
                                    </div>
                                </div>
                                
                                <p className="text-green-50 text-xs mb-6 leading-relaxed">
                                    Lihat daftar pelanggan yang sudah mendaftar dan belum diverifikasi. Lengkapi konfigurasi teknis (PPPoE / tim) dan buat surat kontrak berlangganan.
                                </p>
                            </div>

                            <Button
                                variant="secondary"
                                onClick={handleVerifyClick}
                                disabled={loading}
                                className="w-full bg-white text-green-600 hover:bg-green-50 font-semibold text-xs py-2.5"
                            >
                                {loading ? (
                                    <>
                                        <Loader className="mr-2 animate-spin" size={16} />
                                        Memuat...
                                    </>
                                ) : (
                                    <>
                                        <FileCheck className="mr-2" size={16} />
                                        Lihat Pelanggan Pending
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Pending Customers List */}
                {showList && (
                    <div className="bg-white rounded-lg shadow-sm">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">
                                        Pelanggan Menunggu Verifikasi
                                    </h2>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {pendingCustomers.length} pelanggan belum diverifikasi
                                    </p>
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowList(false)}
                                >
                                    Kembali
                                </Button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-12 text-center">
                                <Loader className="animate-spin mx-auto mb-4" size={32} />
                                <p className="text-gray-600">Memuat data...</p>
                            </div>
                        ) : pendingCustomers.length === 0 ? (
                            <div className="p-12 text-center">
                                <FileCheck size={64} className="mx-auto text-gray-300 mb-4" />
                                <p className="text-gray-600 text-lg">Tidak ada pelanggan yang menunggu verifikasi</p>
                                <p className="text-gray-500 text-sm mt-2">Semua pelanggan sudah diverifikasi</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200">
                                {pendingCustomers.map((customer, index) => (
                                    <div
                                        key={customer.timestamp || index}
                                        className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                                        onClick={() => handleSelectCustomer(customer.timestamp)}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="p-2 bg-blue-100 rounded-lg">
                                                        <UserIcon size={20} className="text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-gray-900">
                                                            {customer.nama || 'Nama tidak tersedia'}
                                                        </h3>
                                                        <p className="text-sm text-gray-500">
                                                            {customer.timestamp}
                                                            {customer._row_number && (
                                                                <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded">
                                                                    Row {customer._row_number}
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Phone size={16} className="text-gray-400" />
                                                        <span className="text-gray-700">
                                                            {customer.no_telp || '-'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Calendar size={16} className="text-gray-400" />
                                                        <span className="text-gray-700">
                                                            Aktivasi: {formatDate(customer.tanggal_aktivasi)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <MapPin size={16} className="text-gray-400" />
                                                        <span className="text-gray-700">
                                                            ODP: {customer.odp || '-'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-3 flex gap-2 flex-wrap">
                                                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                                        {customer.paket || 'Paket tidak tersedia'}
                                                    </span>
                                                    {customer.user_pppoe && (
                                                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-mono rounded-full">
                                                            {customer.user_pppoe}
                                                        </span>
                                                    )}
                                                    {customer.desa && (
                                                        <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                                            {customer.dusun ? `${customer.dusun}, ` : ''}{customer.desa}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelectCustomer(customer.timestamp);
                                                }}
                                            >
                                                Verifikasi →
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                    <div className="flex items-start gap-3">
                        <div className="text-blue-600 mt-1">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <h4 className="font-semibold text-blue-900 mb-1">Alur Verifikasi Pelanggan</h4>
                            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                                <li>Klik <strong>"Daftarkan Pelanggan"</strong> untuk membuka Google Form</li>
                                <li>Pelanggan/Teknisi mengisi data lengkap (NIK, foto KTP, dll) di Google Form</li>
                                <li>Data tersimpan aman di Google Sheets (private, tidak di database aplikasi)</li>
                                <li>Admin klik <strong>"Verifikasi User"</strong> untuk melihat daftar pelanggan pending</li>
                                <li>Pilih pelanggan → lengkapi data operasional (koordinat, dll) → simpan</li>
                                <li>Sistem otomatis membuat PPPoE user di MikroTik</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CustomerVerificationPage;
