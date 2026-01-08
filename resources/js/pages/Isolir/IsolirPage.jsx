import { useEffect, useState } from 'react';
import { Users, Wifi, Phone, MapPin, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import axios from 'axios';

function IsolirPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [isolatedDevices, setIsolatedDevices] = useState([]);

    useEffect(() => {
        fetchIsolatedDevices();
    }, []);

    const fetchIsolatedDevices = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get('/api/isolir', {
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            setIsolatedDevices(response.data.data || []);
        } catch (err) {
            console.error('Failed to fetch isolated devices:', err);
            setError(err.response?.data?.message || 'Gagal mengambil data perangkat isolir');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchIsolatedDevices();
        setRefreshing(false);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
        });
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner text="Memuat data perangkat isolir..." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Perangkat Isolir</h1>
                    <p className="text-gray-600 mt-1">
                        Daftar perangkat yang dibatasi karena lewat tanggal pembayaran
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Memuat...' : 'Refresh'}
                </button>
            </div>

            {error && (
                <Alert
                    type="error"
                    title="Error"
                    message={error}
                    onClose={() => setError(null)}
                />
            )}

            {/* Stats Card */}
            <div className="bg-gradient-to-r from-red-500 to-orange-600 rounded-lg shadow-lg p-6 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-red-100 text-sm font-medium">Total Perangkat Isolir</p>
                        <p className="text-4xl font-bold mt-2">{isolatedDevices.length}</p>
                        <p className="text-red-100 text-sm mt-1">Perangkat dengan profile isolir di MikroTik</p>
                    </div>
                    <div className="bg-white/20 p-4 rounded-full">
                        <AlertCircle size={48} />
                    </div>
                </div>
            </div>

            {/* Devices List */}
            {isolatedDevices.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-full mb-4">
                        <Wifi size={32} />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        Tidak Ada Perangkat Isolir
                    </h3>
                    <p className="text-gray-600">
                        Saat ini tidak ada perangkat yang menggunakan profile isolir di MikroTik.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {isolatedDevices.map((device, index) => (
                        <div
                            key={index}
                            className="bg-white rounded-lg shadow-lg border-l-4 border-red-500 hover:shadow-xl transition-shadow"
                        >
                            <div className="p-6">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                                            <Wifi size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">
                                                {device.customer?.name || 'Pelanggan Tidak Dikenal'}
                                            </h3>
                                            <p className="text-sm text-gray-500">Username: {device.username}</p>
                                        </div>
                                    </div>
                                    <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                                        ISOLIR
                                    </span>
                                </div>

                                {/* Customer Info */}
                                {device.customer ? (
                                    <div className="space-y-3 mb-4 bg-gray-50 rounded-lg p-4">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Phone size={16} className="text-gray-400" />
                                            <span className="text-gray-600">Telepon:</span>
                                            <span className="font-medium text-gray-900">
                                                {device.customer.phone || '-'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <MapPin size={16} className="text-gray-400" />
                                            <span className="text-gray-600">Alamat:</span>
                                            <span className="font-medium text-gray-900">
                                                {device.customer.address || '-'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Calendar size={16} className="text-gray-400" />
                                            <span className="text-gray-600">Jatuh Tempo:</span>
                                            <span className="font-medium text-red-600">
                                                {formatDate(device.customer.due_date)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Users size={16} className="text-gray-400" />
                                            <span className="text-gray-600">Paket:</span>
                                            <span className="font-medium text-gray-900">
                                                {device.customer.package_type || '-'}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                                        <p className="text-sm text-yellow-800">
                                            ⚠️ Data pelanggan tidak ditemukan di database
                                        </p>
                                    </div>
                                )}

                                {/* MikroTik Info */}
                                <div className="border-t pt-4">
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                                        Info MikroTik
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-gray-600">IP Address</p>
                                            <p className="font-mono font-medium text-gray-900">
                                                {device.remote_address || '-'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-gray-600">Service</p>
                                            <p className="font-medium text-gray-900">
                                                {device.service || '-'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-gray-600">Profile</p>
                                            <span className="inline-block px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
                                                {device.profile}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-gray-600">Status</p>
                                            <p className="font-medium text-gray-900">
                                                {device.disabled === 'true' ? (
                                                    <span className="text-gray-500">Disabled</span>
                                                ) : (
                                                    <span className="text-green-600">Active</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default IsolirPage;
