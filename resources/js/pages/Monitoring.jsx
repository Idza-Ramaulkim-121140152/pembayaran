import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { FaServer, FaUsers, FaCheckCircle, FaTimesCircle, FaSpinner, FaSyncAlt, FaNetworkWired, FaExclamationTriangle, FaSearch } from 'react-icons/fa';
import ResponsiveDataView from '../components/common/ResponsiveDataView';

export default function Monitoring() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState({
        serverInfo: null,
        customers: [],
        summary: null,
    });
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showAreaModal, setShowAreaModal] = useState(false);
    const [selectedArea, setSelectedArea] = useState(null);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            setError(null);
            const response = await axios.get('/api/monitoring');
            if (response.data.success) {
                setData(response.data.data);
            } else {
                setError(response.data.error);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchData();
    };

    const getFilteredCustomers = () => {
        let filtered = data.customers;

        if (filter === 'online') filtered = filtered.filter(c => c.is_online);
        else if (filter === 'offline') filtered = filtered.filter(c => !c.is_online);

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(c =>
                c.pppoe_username?.toLowerCase().includes(term) ||
                c.customer_name?.toLowerCase().includes(term) ||
                c.ip_address?.toLowerCase().includes(term) ||
                c.caller_id?.toLowerCase().includes(term) ||
                c.customer_phone?.toLowerCase().includes(term) ||
                c.customer_address?.toLowerCase().includes(term) ||
                c.package_type?.toLowerCase().includes(term)
            );
        }

        return filtered;
    };

    const getStatusColor = (customer) => (customer.is_online ? 'text-green-600' : 'text-red-600');

    const getStatusBadge = (customer) => {
        if (customer.is_online) {
            return <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">Online</span>;
        }
        return <span className="px-2 py-1 text-xs font-semibold text-red-800 bg-red-100 rounded-full">Offline</span>;
    };

    const getAreaSummary = () => {
        const areas = {};

        data.customers.forEach(customer => {
            const areaCode = customer.pppoe_username?.substring(0, 3).toUpperCase() || 'N/A';

            if (!areas[areaCode]) {
                areas[areaCode] = { total: 0, online: 0 };
            }

            areas[areaCode].total++;
            if (customer.is_online) {
                areas[areaCode].online++;
            }
        });

        return Object.entries(areas)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([code, stats]) => ({ code, ...stats }));
    };

    const getCustomersByArea = (areaCode) => {
        return data.customers.filter(customer => {
            const customerArea = customer.pppoe_username?.substring(0, 3).toUpperCase() || 'N/A';
            return customerArea === areaCode;
        });
    };

    const handleAreaClick = (area) => {
        setSelectedArea(area);
        setShowAreaModal(true);
    };

    const filteredCustomersList = useMemo(() => getFilteredCustomers(), [data.customers, filter, searchTerm]);

    const customerColumns = [
        {
            key: 'pppoe_username',
            label: 'Username PPPoE',
            render: (customer) => (
                <span className={`font-medium ${getStatusColor(customer)}`}>
                    {customer.pppoe_username || '-'}
                </span>
            ),
        },
        { key: 'status', label: 'Status', render: (customer) => getStatusBadge(customer) },
        { key: 'customer_name', label: 'Nama', render: (customer) => customer.customer_name || '-' },
        { key: 'package_type', label: 'Paket', render: (customer) => customer.package_type || '-' },
        { key: 'ip_address', label: 'IP Address', render: (customer) => customer.ip_address || '-' },
        { key: 'customer_phone', label: 'Telepon', render: (customer) => customer.customer_phone || '-' },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <FaSpinner className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="container px-4 py-8 mx-auto">
            <div className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Monitoring Server & Client</h1>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="w-full sm:w-auto flex items-center justify-center px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        <FaSyncAlt className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Memuat...' : 'Refresh'}
                    </button>
                </div>
                <p className="mt-2 text-gray-600">Monitoring perangkat client yang aktif dari MikroTik PPPoE</p>
            </div>

            {error && (
                <div className="p-4 mb-6 text-red-800 bg-red-100 border border-red-200 rounded-lg">
                    <div className="flex items-center">
                        <FaExclamationTriangle className="mr-2" />
                        <span className="font-semibold">Error Koneksi ke MikroTik:</span>
                    </div>
                    <p className="mt-1">{error}</p>
                    <div className="mt-2 text-sm">
                        <p>Pastikan:</p>
                        <ul className="mt-1 ml-4 list-disc">
                            <li>Server MikroTik (103.195.65.216:8728) dapat diakses</li>
                            <li>Username dan password benar (admin / rumahkita69)</li>
                            <li>API Service aktif di MikroTik</li>
                            <li>Port 8728 tidak diblock firewall</li>
                        </ul>
                    </div>
                </div>
            )}

            {data.error && !error && (
                <div className="p-4 mb-6 text-yellow-800 bg-yellow-100 border border-yellow-200 rounded-lg">
                    <div className="flex items-center">
                        <FaExclamationTriangle className="mr-2" />
                        <span className="font-semibold">Peringatan:</span>
                    </div>
                    <p className="mt-1">{data.error}</p>
                </div>
            )}

            {data.customers.length > 0 && (
                <div className="mb-6 bg-white rounded-lg shadow-md">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="flex items-center text-xl font-semibold text-gray-800">
                            <FaNetworkWired className="mr-2" />
                            Summary Per Daerah
                        </h2>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                            {getAreaSummary().map((area) => (
                                <div
                                    key={area.code}
                                    onClick={() => handleAreaClick(area)}
                                    className="p-3 border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer hover:border-blue-500"
                                >
                                    <p className="text-xs font-medium text-gray-600 mb-1">{area.code}</p>
                                    <p className="text-lg font-bold">
                                        <span className={area.online === area.total ? 'text-green-600' : area.online === 0 ? 'text-red-600' : 'text-yellow-600'}>
                                            {area.online}
                                        </span>
                                        <span className="text-gray-400 text-sm">/{area.total}</span>
                                    </p>
                                    <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                                        <div
                                            className={`h-1.5 rounded-full ${area.online === area.total ? 'bg-green-600' : area.online === 0 ? 'bg-red-600' : 'bg-yellow-600'}`}
                                            style={{ width: `${(area.online / area.total) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {data.serverInfo && (
                <div className="p-6 mb-6 bg-white rounded-lg shadow-md">
                    <h2 className="flex items-center mb-4 text-xl font-semibold text-gray-800">
                        <FaServer className="mr-2" />
                        Informasi Server MikroTik
                    </h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">Identity</p>
                            <p className="text-lg font-semibold text-gray-800">{data.serverInfo.identity}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">Platform</p>
                            <p className="text-lg font-semibold text-gray-800">{data.serverInfo.board_name}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">Version</p>
                            <p className="text-lg font-semibold text-gray-800">{data.serverInfo.version}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">Uptime</p>
                            <p className="text-lg font-semibold text-gray-800">{data.serverInfo.uptime}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">CPU</p>
                            <p className="text-lg font-semibold text-gray-800">{data.serverInfo.cpu}</p>
                            <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${data.serverInfo.cpu_load}%` }}></div>
                                </div>
                                <p className="mt-1 text-xs text-gray-600">Load: {data.serverInfo.cpu_load}%</p>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">Memory</p>
                            <p className="text-lg font-semibold text-gray-800">{data.serverInfo.used_memory} / {data.serverInfo.total_memory}</p>
                            <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full ${data.serverInfo.memory_percentage > 80 ? 'bg-red-600' : 'bg-green-600'}`}
                                        style={{ width: `${data.serverInfo.memory_percentage}%` }}
                                    ></div>
                                </div>
                                <p className="mt-1 text-xs text-gray-600">{data.serverInfo.memory_percentage}% Used</p>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">Storage</p>
                            <p className="text-lg font-semibold text-gray-800">{data.serverInfo.used_hdd} / {data.serverInfo.total_hdd}</p>
                            <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full ${data.serverInfo.hdd_percentage > 80 ? 'bg-red-600' : 'bg-green-600'}`}
                                        style={{ width: `${data.serverInfo.hdd_percentage}%` }}
                                    ></div>
                                </div>
                                <p className="mt-1 text-xs text-gray-600">{data.serverInfo.hdd_percentage}% Used</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {data.summary && (
                <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 lg:grid-cols-5">
                    <div className="p-6 bg-white rounded-lg shadow-md">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total Customer</p>
                                <p className="text-3xl font-bold text-blue-600">{data.summary.total_customers}</p>
                                <p className="text-xs text-gray-500">dengan PPPoE</p>
                            </div>
                            <FaUsers className="w-12 h-12 text-blue-600 opacity-20" />
                        </div>
                    </div>

                    <div className="p-6 bg-white rounded-lg shadow-md">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Customer Online</p>
                                <p className="text-3xl font-bold text-green-600">{data.summary.online_customers}</p>
                                <p className="text-xs text-gray-500">{data.summary.online_percentage}%</p>
                            </div>
                            <FaCheckCircle className="w-12 h-12 text-green-600 opacity-20" />
                        </div>
                    </div>

                    <div className="p-6 bg-white rounded-lg shadow-md">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Customer Offline</p>
                                <p className="text-3xl font-bold text-red-600">{data.summary.offline_customers}</p>
                                <p className="text-xs text-gray-500">tidak terkoneksi</p>
                            </div>
                            <FaTimesCircle className="w-12 h-12 text-red-600 opacity-20" />
                        </div>
                    </div>

                    <div className="p-6 bg-white rounded-lg shadow-md">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Total MikroTik</p>
                                <p className="text-3xl font-bold text-purple-600">{data.summary.total_mikrotik_connections}</p>
                                <p className="text-xs text-gray-500">koneksi aktif</p>
                            </div>
                            <FaNetworkWired className="w-12 h-12 text-purple-600 opacity-20" />
                        </div>
                    </div>

                    <div className="p-6 bg-white rounded-lg shadow-md">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-600">Tidak Terdaftar</p>
                                <p className="text-3xl font-bold text-yellow-600">{data.summary.unmatched_connections || 0}</p>
                                <p className="text-xs text-gray-500">online di MikroTik</p>
                            </div>
                            <FaExclamationTriangle className="w-12 h-12 text-yellow-600 opacity-20" />
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-lg shadow-md">
                <div className="p-6 border-b border-gray-200">
                    <h2 className="flex items-center mb-4 text-xl font-semibold text-gray-800">
                        <FaNetworkWired className="mr-2" />
                        Koneksi PPPoE Aktif
                    </h2>

                    <div className="mb-4">
                        <div className="relative">
                            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Cari username, nama, alamat, MAC, telepon, paket..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    X
                                </button>
                            )}
                        </div>
                        {searchTerm && (
                            <p className="mt-2 text-sm text-gray-600">
                                Ditemukan <span className="font-semibold">{filteredCustomersList.length}</span> hasil dari {data.customers.length} customer
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                        <button
                            onClick={() => setFilter('all')}
                            className={`w-full sm:w-auto px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                        >
                            Semua ({data.customers.length})
                        </button>
                        <button
                            onClick={() => setFilter('online')}
                            className={`w-full sm:w-auto px-4 py-2 rounded-lg ${filter === 'online' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                        >
                            Online ({data.summary?.online_customers || 0})
                        </button>
                        <button
                            onClick={() => setFilter('offline')}
                            className={`w-full sm:w-auto px-4 py-2 rounded-lg ${filter === 'offline' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                        >
                            Offline ({data.summary?.offline_customers || 0})
                        </button>
                    </div>
                </div>

                <div className="p-4 md:p-0">
                    <ResponsiveDataView
                        rows={filteredCustomersList}
                        columns={customerColumns}
                        keyField="id"
                        priorityFields={['pppoe_username', 'status', 'customer_name']}
                        emptyMessage="Tidak ada data customer"
                        tableClassName="w-full md:min-w-[980px]"
                    />
                </div>
            </div>

            {showAreaModal && selectedArea && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50 p-2 sm:p-4" onClick={() => setShowAreaModal(false)}>
                    <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-4 sm:p-6 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl sm:text-2xl font-bold text-gray-800">Daerah {selectedArea.code}</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        <span className={selectedArea.online === selectedArea.total ? 'text-green-600 font-semibold' : selectedArea.online === 0 ? 'text-red-600 font-semibold' : 'text-yellow-600 font-semibold'}>
                                            {selectedArea.online} Online
                                        </span>
                                        <span className="text-gray-400"> / {selectedArea.total} Total Customer</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowAreaModal(false)}
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                            <ResponsiveDataView
                                rows={getCustomersByArea(selectedArea.code)}
                                columns={customerColumns}
                                keyField="id"
                                priorityFields={['pppoe_username', 'status', 'customer_name']}
                                emptyMessage="Tidak ada customer di daerah ini"
                                tableClassName="w-full md:min-w-[920px]"
                            />
                        </div>

                        <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setShowAreaModal(false)}
                                className="w-full sm:w-auto px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
