import { useState, useEffect } from 'react';
import {
    Send, Users, MapPin, UserCheck, X, Check, AlertTriangle,
    RefreshCw, Phone, Search, ChevronDown, Wifi, WifiOff,
    MessageSquare, CheckCircle, XCircle, Clock, Filter, AlertCircle
} from 'lucide-react';

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

    // Mode: 'all', 'area', 'select'
    const [mode, setMode] = useState('all');
    const [selectedNotice, setSelectedNotice] = useState(null);
    const [selectedArea, setSelectedArea] = useState('');
    const [selectedCustomers, setSelectedCustomers] = useState([]);
    const [searchCustomer, setSearchCustomer] = useState('');
    const [customMessage, setCustomMessage] = useState('');
    const [useCustomMessage, setUseCustomMessage] = useState(false);

    const FASTAPI_URL = 'http://localhost:8001';

    useEffect(() => {
        fetchData();
        checkWhatsAppStatus();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch notices
            const noticesRes = await fetch('/api/network-notices?status=active', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
            const noticesData = await noticesRes.json();
            if (noticesData.success) {
                setNotices(noticesData.data.data || []);
            }

            // Fetch customers
            const customersRes = await fetch('/api/customers', {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
            });
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
            const res = await fetch(`${FASTAPI_URL}/api/whatsapp/status`);
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

    const getTargetCustomers = () => {
        if (mode === 'all') {
            return customers.filter(c => c.is_active);
        } else if (mode === 'area' && selectedArea) {
            return getCustomersByArea(selectedArea).filter(c => c.is_active);
        } else if (mode === 'select') {
            return customers.filter(c => selectedCustomers.includes(c.id));
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

            const res = await fetch(`${FASTAPI_URL}/api/send/notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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
        <div className="p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Kirim Informasi Gangguan</h1>
                <p className="text-gray-600">Kirim notifikasi gangguan ke pelanggan via WhatsApp</p>
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
                    <button
                        onClick={checkWhatsAppStatus}
                        className="p-2 hover:bg-white/50 rounded-lg transition"
                        title="Refresh status"
                    >
                        <RefreshCw size={18} className={waStatus?.connected ? 'text-green-600' : 'text-red-600'} />
                    </button>
                </div>
                {!waStatus?.connected && (
                    <div className="mt-3 p-3 bg-white/50 rounded-lg">
                        <p className="text-sm text-red-700">
                            Pastikan WhatsApp Gateway sudah berjalan dan scan QR code jika belum login.
                        </p>
                        <a 
                            href={`${FASTAPI_URL}/api/whatsapp/qr`}
                            target="_blank"
                            className="text-sm text-blue-600 hover:underline"
                        >
                            Lihat QR Code →
                        </a>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Settings */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Select Notice */}
                    <div className="bg-white rounded-xl shadow-sm border p-5">
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
                    <div className="bg-white rounded-xl shadow-sm border p-5">
                        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Users size={18} className="text-orange-500" />
                            Pilih Penerima
                        </h3>

                        {/* Mode Tabs */}
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setMode('all')}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition ${
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
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition ${
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
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition ${
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
                                            <span className="font-medium">{getCustomersByArea(selectedArea).filter(c => c.is_active).length}</span> pelanggan aktif di area {selectedArea}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Mode: Select */}
                        {mode === 'select' && (
                            <div>
                                <div className="flex gap-2 mb-3">
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
                                        className="px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-lg border border-orange-200"
                                    >
                                        Pilih Semua
                                    </button>
                                    <button
                                        onClick={deselectAll}
                                        className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border"
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
                    <div className="bg-white rounded-xl shadow-sm border p-5">
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
                    <div className="flex min-h-full items-center justify-center p-4">
                        {/* Backdrop */}
                        <div 
                            className="fixed inset-0 bg-black/50 transition-opacity" 
                            onClick={() => setShowConfirmModal(false)}
                        ></div>
                        
                        {/* Modal */}
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 transform transition-all">
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
                    <div className="flex min-h-full items-center justify-center p-4">
                        {/* Backdrop */}
                        <div 
                            className="fixed inset-0 bg-black/50 transition-opacity" 
                            onClick={() => setShowAlertModal(false)}
                        ></div>
                        
                        {/* Modal */}
                        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all">
                            {/* Icon */}
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 mb-4">
                                <AlertCircle className="h-7 w-7 text-yellow-600" />
                            </div>
                            
                            {/* Content */}
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Perhatian
                                </h3>
                                <p className="text-gray-600">
                                    {alertMessage}
                                </p>
                            </div>
                            
                            {/* Action */}
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
        </div>
    );
}

export default SendNotificationPage;
