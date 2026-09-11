import { useState, useEffect } from 'react';
import {
    Send, Users, MapPin, UserCheck, X, Check, AlertTriangle,
    RefreshCw, Phone, Search, ChevronDown, Wifi, WifiOff,
    MessageSquare, CheckCircle, XCircle, Clock, Filter, AlertCircle,
    TestTube, History, ShieldAlert, CheckCircle2, Settings
} from 'lucide-react';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

function SendNotificationPage() {
    const [notices, setNotices] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [waStatus, setWaStatus] = useState(null);
    const [sendResult, setSendResult] = useState(null);

    // Modal states
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showAlertModal, setShowAlertModal] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [confirmData, setConfirmData] = useState({ validCount: 0, invalidCount: 0 });

    // Test message state
    const [showTestModal, setShowTestModal] = useState(false);
    const [testPhone, setTestPhone] = useState('');
    const [testMessage, setTestMessage] = useState('Halo, ini pesan test dari RumahKitaNet.');
    const [testSending, setTestSending] = useState(false);
    const [testResult, setTestResult] = useState(null);

    // Logs state
    const [showLogsModal, setShowLogsModal] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);

    // Area Outage Alert state
    const [showAreaAlertModal, setShowAreaAlertModal] = useState(false);
    const [waGroups, setWaGroups] = useState([]);
    const [waGroupsLoading, setWaGroupsLoading] = useState(false);
    const [areaSettings, setAreaSettings] = useState({
        enabled: true,
        threshold_percent: 50,
        min_customers: 3,
        cooldown_minutes: 30,
        target_group_id: '',
        target_group_name: '',
    });
    const [areaSettingsLoading, setAreaSettingsLoading] = useState(false);
    const [areaSettingsSaving, setAreaSettingsSaving] = useState(false);
    const [areaScanning, setAreaScanning] = useState(false);
    const [areaScanResult, setAreaScanResult] = useState(null);

    // Mode: 'all', 'area', 'select'
    const [mode, setMode] = useState('all');
    const [selectedNotice, setSelectedNotice] = useState(null);
    const [selectedArea, setSelectedArea] = useState('');
    const [selectedCustomers, setSelectedCustomers] = useState([]);
    const [searchCustomer, setSearchCustomer] = useState('');
    const [customMessage, setCustomMessage] = useState('');
    const [useCustomMessage, setUseCustomMessage] = useState(false);

    useEffect(() => {
        fetchData();
        checkWhatsAppStatus();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const headers = {
                'Accept': 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
            };

            // Fetch notices and customers in parallel
            const [noticesRes, customersRes] = await Promise.all([
                fetch('/api/network-notices?status=active', { headers }),
                fetch('/api/customers', { headers }),
            ]);

            const noticesData = await noticesRes.json();
            if (noticesData.success) {
                setNotices(noticesData.data.data || []);
            }
            const customersData = await customersRes.json();
            if (customersData.data) {
                setCustomers(customersData.data);
                
                // Extract unique areas from pppoe_username
                const areaSet = new Set();
                customersData.data.forEach(customer => {
                    if (customer.pppoe_username) {
                        const parts = customer.pppoe_username.split('-');
                        if (parts.length > 1) {
                            areaSet.add(parts[0]);
                        }
                    }
                });
                setAreas(Array.from(areaSet).sort());
            }
        } catch (err) {
            console.error('Failed to fetch data', err);
        } finally {
            setLoading(false);
        }
    };

    const checkWhatsAppStatus = async () => {
        try {
            const res = await fetch('/api/whatsapp/status', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
            });
            const data = await res.json();
            setWaStatus(data);
        } catch (err) {
            console.error('Failed to check WA status', err);
            setWaStatus({ connected: false, message: 'Tidak dapat terhubung ke server WhatsApp' });
        }
    };

    const getCustomersByArea = (area) => {
        return customers.filter(c => {
            if (!c.pppoe_username) return false;
            const customerArea = c.pppoe_username.split('-')[0];
            return customerArea === area;
        });
    };

    const filteredCustomers = customers.filter(c => {
        if (!searchCustomer) return true;
        const search = searchCustomer.toLowerCase();
        return (
            c.name?.toLowerCase().includes(search) ||
            c.phone?.toLowerCase().includes(search) ||
            c.pppoe_username?.toLowerCase().includes(search)
        );
    });

    const isCustomerServiceActive = (customer) => {
        if (typeof customer?.is_service_active === 'boolean') {
            return customer.is_service_active;
        }

        const todayString = new Date().toISOString().split('T')[0];
        const dueDate = customer?.due_date ? String(customer.due_date).slice(0, 10) : null;
        const isOverdue = !!dueDate && dueDate < todayString;
        const isIsolated = customer?.is_service_isolated === true;

        if (typeof customer?.is_service_inactive === 'boolean') {
            return !customer.is_service_inactive;
        }

        return !isOverdue && !isIsolated;
    };

    const getTargetCustomers = () => {
        if (mode === 'all') {
            return customers.filter(c => isCustomerServiceActive(c));
        } else if (mode === 'area' && selectedArea) {
            return getCustomersByArea(selectedArea).filter(c => isCustomerServiceActive(c));
        } else if (mode === 'select') {
            return customers.filter(c => selectedCustomers.includes(c.id) && isCustomerServiceActive(c));
        }
        return [];
    };

    // Show alert modal
    const showAlert = (message) => {
        setAlertMessage(message);
        setShowAlertModal(true);
    };

    // Handle send button click - show confirmation
    const handleSendClick = () => {
        if (!selectedNotice && !useCustomMessage) {
            showAlert('Pilih informasi gangguan atau gunakan pesan kustom');
            return;
        }

        const targetCustomers = getTargetCustomers();
        if (targetCustomers.length === 0) {
            showAlert('Tidak ada pelanggan yang dipilih');
            return;
        }

        const validCustomers = targetCustomers.filter(c => c.phone && c.phone !== '0' && c.phone !== '');
        const invalidCount = targetCustomers.length - validCustomers.length;

        if (validCustomers.length === 0) {
            showAlert('Tidak ada pelanggan dengan nomor telepon valid');
            return;
        }

        setConfirmData({ validCount: validCustomers.length, invalidCount });
        setShowConfirmModal(true);
    };

    // Actually send the notification
    const handleConfirmSend = async () => {
        setShowConfirmModal(false);
        
        const targetCustomers = getTargetCustomers();
        const validCustomers = targetCustomers.filter(c => c.phone && c.phone !== '0' && c.phone !== '');

        setSending(true);
        setSendResult(null);

        try {
            const payload = {
                customer_ids: validCustomers.map(c => c.id),
            };

            if (useCustomMessage && customMessage) {
                payload.custom_message = customMessage;
            }

            if (selectedNotice) {
                payload.notice_id = selectedNotice.id;
            }

            const res = await fetch('/api/whatsapp/send-notification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify(payload),
            });

            const result = await res.json();
            setSendResult(result);

        } catch (err) {
            console.error('Failed to send notification', err);
            setSendResult({
                success: false,
                message: 'Gagal mengirim notifikasi: ' + err.message,
            });
        } finally {
            setSending(false);
        }
    };

    const toggleCustomerSelection = (customerId) => {
        setSelectedCustomers(prev => {
            if (prev.includes(customerId)) {
                return prev.filter(id => id !== customerId);
            } else {
                return [...prev, customerId];
            }
        });
    };

    // QR Code handler
    const [showQRModal, setShowQRModal] = useState(false);
    const [qrData, setQrData] = useState(null);
    const [qrLoading, setQrLoading] = useState(false);

    const handleShowQR = async () => {
        setShowQRModal(true);
        setQrLoading(true);
        try {
            const res = await fetch('/api/whatsapp/qr', {
                headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
            });
            const data = await res.json();
            setQrData(data);
        } catch (err) {
            setQrData({ success: false, message: 'Gagal mengambil QR code' });
        } finally {
            setQrLoading(false);
        }
    };

    // Restart WA handler
    const handleRestart = async () => {
        try {
            await fetch('/api/whatsapp/restart', {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
            });
            showAlert('WhatsApp sedang direstart. Tunggu beberapa detik lalu refresh status.');
            setTimeout(checkWhatsAppStatus, 5000);
        } catch (err) {
            showAlert('Gagal restart WhatsApp');
        }
    };

    // Send test message
    const handleSendTest = async () => {
        if (!testPhone || !testMessage) return;
        setTestSending(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/whatsapp/send-test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify({ phone: testPhone, message: testMessage }),
            });
            setTestResult(await res.json());
        } catch (err) {
            setTestResult({ success: false, error: err.message });
        } finally {
            setTestSending(false);
        }
    };

    // Area Outage Alert handlers
    const fetchAreaAlertSettings = async () => {
        setAreaSettingsLoading(true);
        try {
            const res = await fetch('/api/whatsapp/area-alert/settings', {
                headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
            });
            const data = await res.json();
            if (data.success && data.settings) {
                setAreaSettings(data.settings);
            }
        } catch (err) {
            console.error('Failed to fetch area alert settings', err);
        } finally {
            setAreaSettingsLoading(false);
        }
    };

    const fetchWaGroups = async () => {
        setWaGroupsLoading(true);
        try {
            const res = await fetch('/api/whatsapp/groups', {
                headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.groups)) {
                setWaGroups(data.groups);
            }
        } catch (err) {
            console.error('Failed to fetch WA groups', err);
        } finally {
            setWaGroupsLoading(false);
        }
    };

    const handleSaveAreaSettings = async () => {
        setAreaSettingsSaving(true);
        try {
            const res = await fetch('/api/whatsapp/area-alert/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
                body: JSON.stringify(areaSettings),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Gagal menyimpan pengaturan');
            }
            alert('Pengaturan peringatan gangguan area berhasil disimpan!');
            if (data.settings) {
                setAreaSettings(data.settings);
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setAreaSettingsSaving(false);
        }
    };

    const handleScanAreaOutagesNow = async () => {
        setAreaScanning(true);
        setAreaScanResult(null);
        try {
            const res = await fetch('/api/whatsapp/area-alert/check-now', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken(),
                },
            });
            const data = await res.json();
            setAreaScanResult(data);
        } catch (err) {
            setAreaScanResult({
                status: 'error',
                message: 'Gagal melakukan pemindaian: ' + err.message,
            });
        } finally {
            setAreaScanning(false);
        }
    };

    // Fetch logs
    const fetchLogs = async () => {
        setLogsLoading(true);
        try {
            const res = await fetch('/api/whatsapp/logs', {
                headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() },
            });
            const data = await res.json();
            setLogs(data.data?.data || []);
        } catch (err) {
            console.error('Failed to fetch logs', err);
        } finally {
            setLogsLoading(false);
        }
    };
    const logColumns = [
        {
            key: 'created_at',
            label: 'Waktu',
            render: (log) => new Date(log.created_at).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        },
        { key: 'customer.nama', label: 'Pelanggan', render: (log) => log.customer?.nama || '-' },
        { key: 'phone', label: 'Nomor', render: (log) => log.phone || '-' },
        {
            key: 'status',
            label: 'Status',
            render: (log) => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    log.status === 'sent' ? 'bg-green-100 text-green-700' :
                    log.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                }`}>
                    {log.status === 'sent' ? 'Terkirim' : log.status === 'failed' ? 'Gagal' : 'Dilewati'}
                </span>
            ),
        },
        {
            key: 'error',
            label: 'Error',
            render: (log) => <span className="text-red-500 text-xs whitespace-normal break-words">{log.error || '-'}</span>,
        },
    ];

    const selectAllFiltered = () => {
        const filteredIds = filteredCustomers.map(c => c.id);
        setSelectedCustomers(prev => {
            const newSelection = [...new Set([...prev, ...filteredIds])];
            return newSelection;
        });
    };

    const deselectAll = () => {
        setSelectedCustomers([]);
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-gray-500">Memuat data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 space-y-6 min-w-0">
            {/* Header */}
            <div className="app-section-header mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Kirim Informasi Gangguan</h1>
                    <p className="text-gray-600">Kirim notifikasi gangguan ke pelanggan via WhatsApp</p>
                </div>
                <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                    <button
                        onClick={() => { setShowAreaAlertModal(true); fetchAreaAlertSettings(); fetchWaGroups(); }}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 text-sm bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 border border-orange-200 transition font-medium"
                    >
                        <ShieldAlert size={16} />
                        Peringatan Gangguan Area (Grup WA)
                    </button>
                    <button
                        onClick={() => { setShowTestModal(true); setTestResult(null); }}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 transition"
                    >
                        <TestTube size={16} />
                        Test Pesan
                    </button>
                    <button
                        onClick={() => { setShowLogsModal(true); fetchLogs(); }}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 border border-gray-200 transition"
                    >
                        <History size={16} />
                        Log Pengiriman
                    </button>
                </div>
            </div>

            {/* WhatsApp Status */}
            <div className={`mb-6 p-4 rounded-xl border ${waStatus?.connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {waStatus?.connected ? (
                            <Wifi className="text-green-600" size={24} />
                        ) : (
                            <WifiOff className="text-red-600" size={24} />
                        )}
                        <div>
                            <p className={`font-medium ${waStatus?.connected ? 'text-green-800' : 'text-red-800'}`}>
                                {waStatus?.connected ? 'WhatsApp Terhubung' : 'WhatsApp Tidak Terhubung'}
                            </p>
                            <p className={`text-sm ${waStatus?.connected ? 'text-green-600' : 'text-red-600'}`}>
                                {waStatus?.message || 'Mengecek status...'}
                            </p>
                            {waStatus?.phone_number && (
                                <p className="text-sm text-green-600">Nomor: {waStatus.phone_number}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRestart}
                            className="px-3 py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition"
                            title="Restart WhatsApp"
                        >
                            Restart
                        </button>
                        <button
                            onClick={checkWhatsAppStatus}
                            className="p-2 hover:bg-white/50 rounded-lg transition"
                            title="Refresh status"
                        >
                            <RefreshCw size={18} className={waStatus?.connected ? 'text-green-600' : 'text-red-600'} />
                        </button>
                    </div>
                </div>
                {!waStatus?.connected && (
                    <div className="mt-3 p-3 bg-white/50 rounded-lg">
                        <p className="text-sm text-red-700">
                            Pastikan WhatsApp Gateway sudah berjalan dan scan QR code jika belum login.
                        </p>
                        <button 
                            onClick={handleShowQR}
                            className="text-sm text-blue-600 hover:underline"
                        >
                            Lihat QR Code {'->'}
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Settings */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Select Notice */}
                    <div className="app-card p-5">
                        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <AlertTriangle size={18} className="text-orange-500" />
                            Pilih Informasi Gangguan
                        </h3>
                        
                        {notices.length === 0 ? (
                            <p className="text-gray-500 text-sm">Tidak ada informasi gangguan aktif</p>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {notices.map(notice => (
                                    <label
                                        key={notice.id}
                                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                                            selectedNotice?.id === notice.id 
                                                ? 'border-orange-500 bg-orange-50' 
                                                : 'border-gray-200 hover:border-orange-300'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="notice"
                                            checked={selectedNotice?.id === notice.id}
                                            onChange={() => setSelectedNotice(notice)}
                                            className="mt-1 text-orange-500 focus:ring-orange-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    notice.type === 'gangguan' 
                                                        ? 'bg-red-100 text-red-700' 
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {notice.type === 'gangguan' ? 'Gangguan' : 'Maintenance'}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    notice.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                                    notice.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                                                    notice.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {notice.severity}
                                                </span>
                                            </div>
                                            <p className="font-medium text-gray-900 text-sm">{notice.title}</p>
                                            <p className="text-xs text-gray-500 truncate">{notice.message}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}

                        {/* Custom Message Option */}
                        <div className="mt-4 pt-4 border-t">
                            <label className="flex items-center gap-2 mb-3">
                                <input
                                    type="checkbox"
                                    checked={useCustomMessage}
                                    onChange={(e) => setUseCustomMessage(e.target.checked)}
                                    className="text-orange-500 focus:ring-orange-500 rounded"
                                />
                                <span className="text-sm font-medium text-gray-700">Gunakan pesan kustom</span>
                            </label>
                            {useCustomMessage && (
                                <textarea
                                    value={customMessage}
                                    onChange={(e) => setCustomMessage(e.target.value)}
                                    placeholder="Tulis pesan kustom... Gunakan {nama} untuk nama pelanggan"
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    rows={4}
                                />
                            )}
                        </div>
                    </div>

                    {/* Select Mode */}
                    <div className="app-card p-5">
                        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Users size={18} className="text-orange-500" />
                            Pilih Penerima
                        </h3>

                        {/* Mode Tabs */}
                        <div className="flex flex-col md:flex-row gap-2 mb-4">
                            <button
                                onClick={() => setMode('all')}
                                className={`w-full md:flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition ${
                                    mode === 'all' 
                                        ? 'border-orange-500 bg-orange-50 text-orange-700' 
                                        : 'border-gray-200 hover:border-orange-300'
                                }`}
                            >
                                <Users size={18} />
                                <span className="font-medium">Semua Pelanggan</span>
                            </button>
                            <button
                                onClick={() => setMode('area')}
                                className={`w-full md:flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition ${
                                    mode === 'area' 
                                        ? 'border-orange-500 bg-orange-50 text-orange-700' 
                                        : 'border-gray-200 hover:border-orange-300'
                                }`}
                            >
                                <MapPin size={18} />
                                <span className="font-medium">Per Area</span>
                            </button>
                            <button
                                onClick={() => setMode('select')}
                                className={`w-full md:flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition ${
                                    mode === 'select' 
                                        ? 'border-orange-500 bg-orange-50 text-orange-700' 
                                        : 'border-gray-200 hover:border-orange-300'
                                }`}
                            >
                                <UserCheck size={18} />
                                <span className="font-medium">Pilih Manual</span>
                            </button>
                        </div>

                        {/* Mode: Area */}
                        {mode === 'area' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Pilih Area</label>
                                <select
                                    value={selectedArea}
                                    onChange={(e) => setSelectedArea(e.target.value)}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                >
                                    <option value="">-- Pilih Area --</option>
                                    {areas.map(area => (
                                        <option key={area} value={area}>
                                            {area} ({getCustomersByArea(area).length} pelanggan)
                                        </option>
                                    ))}
                                </select>
                                {selectedArea && (
                                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">{getCustomersByArea(selectedArea).filter(c => isCustomerServiceActive(c)).length}</span> pelanggan aktif layanan di area {selectedArea}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Mode: Select */}
                        {mode === 'select' && (
                            <div>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    <div className="flex-1 relative">
                                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={searchCustomer}
                                            onChange={(e) => setSearchCustomer(e.target.value)}
                                            placeholder="Cari pelanggan..."
                                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        />
                                    </div>
                                    <button
                                        onClick={selectAllFiltered}
                                        className="w-full sm:w-auto px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-lg border border-orange-200"
                                    >
                                        Pilih Semua
                                    </button>
                                    <button
                                        onClick={deselectAll}
                                        className="w-full sm:w-auto px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border"
                                    >
                                        Reset
                                    </button>
                                </div>
                                <div className="max-h-60 overflow-y-auto border rounded-lg">
                                    {filteredCustomers.length === 0 ? (
                                        <p className="p-4 text-center text-gray-500 text-sm">Tidak ada pelanggan</p>
                                    ) : (
                                        filteredCustomers.map(customer => (
                                            <label
                                                key={customer.id}
                                                className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${
                                                    selectedCustomers.includes(customer.id) ? 'bg-orange-50' : ''
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCustomers.includes(customer.id)}
                                                    onChange={() => toggleCustomerSelection(customer.id)}
                                                    className="text-orange-500 focus:ring-orange-500 rounded"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 text-sm">{customer.name}</p>
                                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                                        <span className="flex items-center gap-1">
                                                            <Phone size={12} />
                                                            {customer.phone || '(Tidak ada)'}
                                                        </span>
                                                        {customer.pppoe_username && (
                                                            <span>{customer.pppoe_username}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {(!customer.phone || customer.phone === '0') && (
                                                    <span className="text-xs text-red-500">No. tidak valid</span>
                                                )}
                                            </label>
                                        ))
                                    )}
                                </div>
                                {selectedCustomers.length > 0 && (
                                    <p className="mt-2 text-sm text-orange-600">
                                        {selectedCustomers.length} pelanggan dipilih
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Summary & Send */}
                <div className="space-y-6">
                    {/* Summary */}
                    <div className="app-card p-5">
                        <h3 className="font-semibold text-gray-900 mb-4">Ringkasan</h3>
                        
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Mode Kirim:</span>
                                <span className="font-medium">
                                    {mode === 'all' ? 'Semua Pelanggan' : mode === 'area' ? 'Per Area' : 'Pilih Manual'}
                                </span>
                            </div>
                            
                            {mode === 'area' && selectedArea && (
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Area:</span>
                                    <span className="font-medium">{selectedArea}</span>
                                </div>
                            )}
                            
                            <div className="flex justify-between">
                                <span className="text-gray-600">Target Penerima:</span>
                                <span className="font-medium">{getTargetCustomers().length} pelanggan</span>
                            </div>
                            
                            <div className="flex justify-between">
                                <span className="text-gray-600">Nomor Valid:</span>
                                <span className="font-medium text-green-600">
                                    {getTargetCustomers().filter(c => c.phone && c.phone !== '0').length}
                                </span>
                            </div>
                            
                            <div className="flex justify-between">
                                <span className="text-gray-600">Dilewati (No. Invalid):</span>
                                <span className="font-medium text-red-600">
                                    {getTargetCustomers().filter(c => !c.phone || c.phone === '0').length}
                                </span>
                            </div>

                            {selectedNotice && (
                                <div className="pt-3 border-t">
                                    <p className="text-gray-600 mb-1">Informasi:</p>
                                    <p className="font-medium text-gray-900">{selectedNotice.title}</p>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleSendClick}
                            disabled={sending || !waStatus?.connected || (getTargetCustomers().filter(c => c.phone && c.phone !== '0').length === 0)}
                            className={`w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition ${
                                sending || !waStatus?.connected 
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                            }`}
                        >
                            {sending ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Mengirim...</span>
                                </>
                            ) : (
                                <>
                                    <Send size={18} />
                                    <span>Kirim Notifikasi</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Result */}
                    {sendResult && (
                        <div className={`rounded-xl border p-5 ${sendResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <h3 className={`font-semibold mb-3 flex items-center gap-2 ${sendResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                {sendResult.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                Hasil Pengiriman
                            </h3>
                            
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span>Total:</span>
                                    <span className="font-medium">{sendResult.total_customers || 0}</span>
                                </div>
                                <div className="flex justify-between text-green-700">
                                    <span>Terkirim:</span>
                                    <span className="font-medium">{sendResult.sent_count || 0}</span>
                                </div>
                                <div className="flex justify-between text-red-700">
                                    <span>Gagal:</span>
                                    <span className="font-medium">{sendResult.failed_count || 0}</span>
                                </div>
                                <div className="flex justify-between text-yellow-700">
                                    <span>Dilewati:</span>
                                    <span className="font-medium">{sendResult.skipped_count || 0}</span>
                                </div>
                            </div>

                            {sendResult.results && sendResult.results.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-green-200">
                                    <p className="text-xs font-medium mb-2">Detail:</p>
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {sendResult.results.slice(0, 20).map((r, i) => (
                                            <div key={i} className={`flex items-center gap-2 text-xs ${r.success ? 'text-green-700' : 'text-red-700'}`}>
                                                {r.success ? <Check size={12} /> : <X size={12} />}
                                                <span>{r.customer_name}</span>
                                                {r.error && <span className="text-gray-500">- {r.error}</span>}
                                            </div>
                                        ))}
                                        {sendResult.results.length > 20 && (
                                            <p className="text-xs text-gray-500">...dan {sendResult.results.length - 20} lainnya</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
                        {/* Backdrop */}
                        <div 
                            className="fixed inset-0 bg-black/50 transition-opacity" 
                            onClick={() => setShowConfirmModal(false)}
                        ></div>
                        
                        {/* Modal */}
                        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md p-6 transform transition-all max-h-[90vh] overflow-y-auto">
                            {/* Icon */}
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 mb-4">
                                <Send className="h-8 w-8 text-orange-600" />
                            </div>
                            
                            {/* Content */}
                            <div className="text-center">
                                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                    Konfirmasi Pengiriman
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    Anda akan mengirim notifikasi WhatsApp ke:
                                </p>
                                
                                {/* Stats */}
                                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                                    <div className="flex justify-center gap-8">
                                        <div className="text-center">
                                            <div className="text-3xl font-bold text-green-600">{confirmData.validCount}</div>
                                            <div className="text-sm text-gray-500">Pelanggan</div>
                                        </div>
                                        {confirmData.invalidCount > 0 && (
                                            <div className="text-center">
                                                <div className="text-3xl font-bold text-red-500">{confirmData.invalidCount}</div>
                                                <div className="text-sm text-gray-500">Dilewati</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {confirmData.invalidCount > 0 && (
                                    <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 rounded-lg p-3 mb-4">
                                        <AlertTriangle size={16} />
                                        <span>{confirmData.invalidCount} pelanggan dilewati karena nomor tidak valid</span>
                                    </div>
                                )}
                                
                                {/* Selected Notice */}
                                {selectedNotice && (
                                    <div className="text-left bg-blue-50 rounded-lg p-3 mb-4">
                                        <p className="text-xs text-blue-600 font-medium mb-1">Informasi yang dikirim:</p>
                                        <p className="text-sm text-blue-900 font-medium">{selectedNotice.title}</p>
                                    </div>
                                )}
                            </div>
                            
                            {/* Actions */}
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleConfirmSend}
                                    className="flex-1 px-4 py-3 text-white bg-orange-500 hover:bg-orange-600 rounded-xl font-medium transition flex items-center justify-center gap-2"
                                >
                                    <Send size={18} />
                                    Ya, Kirim
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Alert Modal */}
            {showAlertModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
                        <div 
                            className="fixed inset-0 bg-black/50 transition-opacity" 
                            onClick={() => setShowAlertModal(false)}
                        ></div>
                        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all max-h-[90vh] overflow-y-auto">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 mb-4">
                                <AlertCircle className="h-7 w-7 text-yellow-600" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Perhatian</h3>
                                <p className="text-gray-600">{alertMessage}</p>
                            </div>
                            <button
                                onClick={() => setShowAlertModal(false)}
                                className="w-full mt-6 px-4 py-3 text-white bg-orange-500 hover:bg-orange-600 rounded-xl font-medium transition"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QR Code Modal */}
            {showQRModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
                        <div className="fixed inset-0 bg-black/50" onClick={() => setShowQRModal(false)}></div>
                        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">QR Code WhatsApp</h3>
                                <button onClick={() => setShowQRModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                    <X size={20} className="text-gray-500" />
                                </button>
                            </div>
                            {qrLoading ? (
                                <div className="flex justify-center py-8">
                                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : qrData?.qr ? (
                                <div className="text-center">
                                    <img src={qrData.qr} alt="QR Code" className="mx-auto w-64 h-64" />
                                    <p className="mt-3 text-sm text-gray-600">Scan QR code ini dengan WhatsApp di HP Anda</p>
                                </div>
                            ) : qrData?.phone ? (
                                <div className="text-center py-4">
                                    <CheckCircle className="mx-auto mb-3 text-green-500" size={48} />
                                    <p className="font-medium text-green-700">WhatsApp sudah terhubung</p>
                                    <p className="text-sm text-gray-500">Nomor: {qrData.phone}</p>
                                </div>
                            ) : (
                                <div className="text-center py-4">
                                    <AlertCircle className="mx-auto mb-3 text-yellow-500" size={48} />
                                    <p className="text-sm text-gray-600">{qrData?.message || 'QR Code belum tersedia. Coba restart WhatsApp.'}</p>
                                </div>
                            )}
                            <button
                                onClick={handleShowQR}
                                className="w-full mt-4 px-4 py-2 text-sm text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl font-medium transition flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={16} /> Refresh QR
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Test Message Modal */}
            {showTestModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
                        <div className="fixed inset-0 bg-black/50" onClick={() => setShowTestModal(false)}></div>
                        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">Test Kirim Pesan</h3>
                                <button onClick={() => setShowTestModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                    <X size={20} className="text-gray-500" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Telepon</label>
                                    <input
                                        type="text"
                                        value={testPhone}
                                        onChange={(e) => setTestPhone(e.target.value)}
                                        placeholder="08xxxxxxxxxx"
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Pesan</label>
                                    <textarea
                                        value={testMessage}
                                        onChange={(e) => setTestMessage(e.target.value)}
                                        rows={3}
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>
                                {testResult && (
                                    <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                        {testResult.success ? 'Pesan berhasil terkirim!' : `Gagal: ${testResult.error || 'Unknown error'}`}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowTestModal(false)}
                                    className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition"
                                >
                                    Tutup
                                </button>
                                <button
                                    onClick={handleSendTest}
                                    disabled={testSending || !testPhone || !testMessage || !waStatus?.connected}
                                    className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition flex items-center justify-center gap-2 ${
                                        testSending || !waStatus?.connected
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                                    }`}
                                >
                                    {testSending ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <Send size={16} />
                                    )}
                                    Kirim Test
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Logs Modal */}
            {showLogsModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
                        <div className="fixed inset-0 bg-black/50" onClick={() => setShowLogsModal(false)}></div>
                        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-gray-100 bg-white">
                                <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900">Log Pengiriman Notifikasi</h3>
                                <button onClick={() => setShowLogsModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                    <X size={20} className="text-gray-500" />
                                </button>
                                </div>
                            </div>
                            {logsLoading ? (
                                <div className="flex justify-center py-8 px-4 sm:px-6 flex-1 overflow-y-auto">
                                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : logs.length === 0 ? (
                                <p className="text-center text-gray-500 py-8 px-4 sm:px-6 flex-1 overflow-y-auto">Belum ada log pengiriman</p>
                            ) : (
                                <div className="px-4 sm:px-6 py-3 overflow-y-auto flex-1">
                                    <ResponsiveDataView
                                        rows={logs}
                                        columns={logColumns}
                                        keyField="id"
                                        priorityFields={['created_at', 'status', 'customer.nama']}
                                        tableClassName="w-full text-sm md:min-w-[680px]"
                                    />
                                </div>
                            )}
                            <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-gray-100 bg-white flex justify-end">
                                <button
                                    onClick={() => setShowLogsModal(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Area Outage Alert Modal */}
            {showAreaAlertModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-full items-end sm:items-center justify-center p-2 sm:p-4">
                        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setShowAreaAlertModal(false)}></div>
                        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
                            {/* Modal Header */}
                            <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                                        <ShieldAlert size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900">
                                            Pengaturan Peringatan Gangguan Area
                                        </h3>
                                        <p className="text-xs text-gray-500">
                                            Kirim peringatan otomatis ke grup WhatsApp teknisi jika koneksi area nonaktif &ge; 50%
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowAreaAlertModal(false)}
                                    className="p-1 hover:bg-gray-100 rounded-lg transition"
                                >
                                    <X size={20} className="text-gray-500" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-5 space-y-5 overflow-y-auto flex-1">
                                {areaSettingsLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Status Aktif / Nonaktif Toggle */}
                                        <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                                            <div>
                                                <div className="text-sm font-semibold text-gray-900">
                                                    Status Monitoring Otomatis
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    Pemeriksaan otomatis berjalan tiap 5 menit via scheduler background
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={areaSettings.enabled}
                                                    onChange={(e) => setAreaSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                            </label>
                                        </div>

                                        {/* Target Grup WhatsApp */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                                    Pilih Grup WhatsApp Tujuan Notifikasi
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={fetchWaGroups}
                                                    disabled={waGroupsLoading}
                                                    className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1 font-medium"
                                                >
                                                    <RefreshCw size={12} className={waGroupsLoading ? 'animate-spin' : ''} />
                                                    Muat Ulang Daftar Grup
                                                </button>
                                            </div>

                                            <select
                                                value={areaSettings.target_group_id || ''}
                                                onChange={(e) => {
                                                    const gId = e.target.value;
                                                    const grp = waGroups.find(g => g.id === gId);
                                                    setAreaSettings(prev => ({
                                                        ...prev,
                                                        target_group_id: gId,
                                                        target_group_name: grp ? grp.name : prev.target_group_name,
                                                    }));
                                                }}
                                                className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                                            >
                                                <option value="">-- Pilih Grup WhatsApp dari Gateway --</option>
                                                {waGroups.map(grp => (
                                                    <option key={grp.id} value={grp.id}>
                                                        👥 {grp.name} ({grp.id})
                                                    </option>
                                                ))}
                                            </select>

                                            {areaSettings.target_group_id ? (
                                                <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800">
                                                    <span>Grup Terpilih: <strong>{areaSettings.target_group_name || areaSettings.target_group_id}</strong></span>
                                                    <span className="font-mono text-2xs opacity-75">{areaSettings.target_group_id}</span>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-amber-600 mt-1">
                                                    * Silakan pilih grup WhatsApp teknisi/admin agar notifikasi peringatan dapat terkirim.
                                                </p>
                                            )}
                                        </div>

                                        {/* Parameter Ambang Batas */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                                    Ambang Batas Offline (%)
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="10"
                                                        max="100"
                                                        value={areaSettings.threshold_percent}
                                                        onChange={(e) => setAreaSettings(prev => ({ ...prev, threshold_percent: Number(e.target.value) }))}
                                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                                                    />
                                                    <span className="absolute right-3 top-2 text-xs text-gray-400 font-bold">%</span>
                                                </div>
                                                <p className="text-2xs text-gray-500 mt-0.5">Default 50% nonaktif</p>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                                    Min. Pelanggan Area
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="500"
                                                    value={areaSettings.min_customers}
                                                    onChange={(e) => setAreaSettings(prev => ({ ...prev, min_customers: Number(e.target.value) }))}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                                                />
                                                <p className="text-2xs text-gray-500 mt-0.5">Abaikan area &lt; N user</p>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                                    Cooldown Alert (Menit)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="5"
                                                    max="1440"
                                                    value={areaSettings.cooldown_minutes}
                                                    onChange={(e) => setAreaSettings(prev => ({ ...prev, cooldown_minutes: Number(e.target.value) }))}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                                                />
                                                <p className="text-2xs text-gray-500 mt-0.5">Jeda alert per area</p>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-2">
                                            <button
                                                type="button"
                                                onClick={handleSaveAreaSettings}
                                                disabled={areaSettingsSaving}
                                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold shadow-xs transition disabled:opacity-50"
                                            >
                                                {areaSettingsSaving ? (
                                                    <>
                                                        <RefreshCw size={15} className="animate-spin" />
                                                        Menyimpan...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Check size={15} />
                                                        Simpan Pengaturan Peringatan
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {/* Divider: Manual Trigger & Testing */}
                                        <div className="pt-4 border-t border-gray-200">
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-900">
                                                        Uji Pemindaian & Deteksi Gangguan Sekarang
                                                    </h4>
                                                    <p className="text-xs text-gray-500">
                                                        Jalankan scan instan ke sesi MikroTik PPPoE aktif dan hitung persentase pelanggan offline tiap dusun.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleScanAreaOutagesNow}
                                                    disabled={areaScanning}
                                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 shrink-0"
                                                >
                                                    {areaScanning ? (
                                                        <>
                                                            <RefreshCw size={13} className="animate-spin" />
                                                            Scanning...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Radio size={13} />
                                                            Scan Sekarang
                                                        </>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Scan Results Display */}
                                            {areaScanResult && (
                                                <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="font-semibold text-slate-800">
                                                            Hasil Scan: {areaScanResult.status === 'success' ? 'Sukses' : areaScanResult.message}
                                                        </span>
                                                        <span className="text-slate-500">
                                                            {areaScanResult.scanned_at ? new Date(areaScanResult.scanned_at).toLocaleTimeString('id-ID') : ''}
                                                        </span>
                                                    </div>

                                                    {areaScanResult.status === 'success' && (
                                                        <>
                                                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                                                <div className="p-2 bg-white rounded-lg border border-slate-100">
                                                                    <div className="text-slate-400 font-medium">Total Area</div>
                                                                    <div className="text-base font-bold text-slate-800">{areaScanResult.total_areas || 0}</div>
                                                                </div>
                                                                <div className="p-2 bg-white rounded-lg border border-slate-100">
                                                                    <div className="text-slate-400 font-medium">Area Gangguan</div>
                                                                    <div className="text-base font-bold text-red-600">{areaScanResult.outage_areas_count || 0}</div>
                                                                </div>
                                                                <div className="p-2 bg-white rounded-lg border border-slate-100">
                                                                    <div className="text-slate-400 font-medium">Alert Dikirim</div>
                                                                    <div className="text-base font-bold text-emerald-600">{areaScanResult.new_incidents_created || 0}</div>
                                                                </div>
                                                            </div>

                                                            {Array.isArray(areaScanResult.incidents) && areaScanResult.incidents.length > 0 && (
                                                                <div className="space-y-1.5 mt-2">
                                                                    <div className="text-2xs font-bold text-slate-500 uppercase">Insiden Terdeteksi:</div>
                                                                    {areaScanResult.incidents.map(inc => (
                                                                        <div key={inc.id || inc.token} className="p-2 bg-red-50 border border-red-100 rounded-lg flex items-center justify-between text-xs text-red-900">
                                                                            <div>
                                                                                <strong>Area {inc.area_code}</strong>: {inc.inactive_customers_count}/{inc.total_customers} offline
                                                                            </div>
                                                                            <a
                                                                                href={`/area-incident/${inc.token}`}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="text-xs text-blue-600 hover:underline font-semibold"
                                                                            >
                                                                                Buka Aksi {'->'}
                                                                            </a>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
                                <button
                                    onClick={() => setShowAreaAlertModal(false)}
                                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-xl transition"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default SendNotificationPage;
