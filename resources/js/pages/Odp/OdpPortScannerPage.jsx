import { useEffect, useState, useRef } from 'react';
import {
    QrCode,
    Camera,
    CameraOff,
    Search,
    Printer,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    X,
    UserCheck,
    Phone,
    Sliders,
    ArrowRightLeft,
    Plus,
    Trash2,
    ShieldAlert,
    ExternalLink,
    MapPin,
    Network,
    Cpu,
    Radio,
    Layers,
    Info,
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import odpPortService from '../../services/odpPortService';

export default function OdpPortScannerPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const initialOdpId = urlParams.get('odp_id') || '';

    const [odps, setOdps] = useState([]);
    const [selectedOdpId, setSelectedOdpId] = useState(initialOdpId);
    const [odpData, setOdpData] = useState(null);
    const [ports, setPorts] = useState([]);
    const [unallocated, setUnallocated] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // QR Camera Scanner state
    const [isScanning, setIsScanning] = useState(false);
    const [cameraFacing, setCameraFacing] = useState('environment'); // 'environment' | 'user'
    const [manualCode, setManualCode] = useState('');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);

    // Modal: Assign Port
    const [assignModal, setAssignModal] = useState({ open: false, portNumber: null });
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerResults, setCustomerResults] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [dropcoreMeters, setDropcoreMeters] = useState('');
    const [searchingCustomer, setSearchingCustomer] = useState(false);
    const [assigning, setAssigning] = useState(false);

    // Modal: Swap Port
    const [swapModal, setSwapModal] = useState({ open: false, fromPort: null, toPort: '' });
    const [swapping, setSwapping] = useState(false);

    // Modal: Print Sticker
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    // Load ODPs list on mount
    useEffect(() => {
        loadOdpsList();
        if (initialOdpId) {
            fetchOdpPorts(initialOdpId);
        }
    }, []);

    // Clean up camera stream on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    const loadOdpsList = async () => {
        try {
            const res = await odpPortService.getOdps();
            const list = res.data?.data || res.data || [];
            setOdps(Array.isArray(list) ? list : []);
        } catch (err) {
            console.error('Failed to load ODPs list', err);
        }
    };

    const fetchOdpPorts = async (odpId) => {
        if (!odpId) return;
        try {
            setLoading(true);
            setError('');
            setMessage('');
            const res = await odpPortService.getPortsSummary(odpId);
            const payload = res.data?.data || {};
            setOdpData(payload.odp || null);
            setPorts(payload.ports || []);
            setUnallocated(payload.unallocated_customers || []);
            setSelectedOdpId(String(odpId));
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat data port ODP.');
            setOdpData(null);
            setPorts([]);
        } finally {
            setLoading(false);
        }
    };

    const handleLookupCode = async (code) => {
        if (!code || !code.trim()) return;
        try {
            setLoading(true);
            setError('');
            setMessage('');
            const res = await odpPortService.lookupByCode(code.trim());
            const payload = res.data?.data || {};
            setOdpData(payload.odp || null);
            setPorts(payload.ports || []);
            setUnallocated(payload.unallocated_customers || []);
            if (payload.odp?.id) {
                setSelectedOdpId(String(payload.odp.id));
            }
            stopCamera();
            setMessage(`Berhasil memuat data ODP: ${payload.odp?.nama}`);
        } catch (err) {
            setError(err.response?.data?.message || 'ODP tidak ditemukan untuk kode/QR ini.');
        } finally {
            setLoading(false);
        }
    };

    // Camera Barcode / QR Scanner using native BarcodeDetector if available or canvas frame
    const startCamera = async () => {
        try {
            setError('');
            setIsScanning(true);

            const constraints = {
                video: {
                    facingMode: cameraFacing,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            // Start frame detection loop if BarcodeDetector API is supported
            if ('BarcodeDetector' in window) {
                const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
                scanIntervalRef.current = setInterval(async () => {
                    if (videoRef.current && videoRef.current.readyState === 4) {
                        try {
                            const barcodes = await detector.detect(videoRef.current);
                            if (barcodes.length > 0) {
                                const rawValue = barcodes[0].rawValue;
                                handleLookupCode(rawValue);
                            }
                        } catch (e) {
                            // frame skip
                        }
                    }
                }, 400);
            }
        } catch (err) {
            setError('Gagal mengakses kamera. Pastikan izin kamera telah diberikan pada browser.');
            setIsScanning(false);
        }
    };

    const stopCamera = () => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        setIsScanning(false);
    };

    const switchCamera = () => {
        stopCamera();
        setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'));
        setTimeout(() => startCamera(), 200);
    };

    // Customer search for port assignment
    const handleSearchCustomer = async (query) => {
        setCustomerQuery(query);
        if (!query || query.trim().length < 2) {
            setCustomerResults([]);
            return;
        }
        try {
            setSearchingCustomer(true);
            const res = await odpPortService.getCustomers({ search: query.trim(), per_page: 8 });
            const list = res.data?.data || res.data || [];
            setCustomerResults(Array.isArray(list) ? list : (list.data || []));
        } catch (err) {
            console.error('Failed to search customers', err);
        } finally {
            setSearchingCustomer(false);
        }
    };

    // Assign customer to port
    const handleAssignPortSubmit = async (e) => {
        e.preventDefault();
        if (!selectedCustomer || !assignModal.portNumber || !odpData?.id) {
            setError('Pilih pelanggan dan nomor port terlebih dahulu.');
            return;
        }

        try {
            setAssigning(true);
            setError('');
            const res = await odpPortService.assignPort(odpData.id, {
                customer_id: selectedCustomer.id,
                port_number: assignModal.portNumber,
                dropcore_cable_length_meters: dropcoreMeters ? parseInt(dropcoreMeters, 10) : null,
            });

            setMessage(res.data?.message || 'Pelanggan berhasil ditautkan ke port.');
            setAssignModal({ open: false, portNumber: null });
            setSelectedCustomer(null);
            setCustomerQuery('');
            setCustomerResults([]);
            setDropcoreMeters('');
            await fetchOdpPorts(odpData.id);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menautkan pelanggan ke port.');
        } finally {
            setAssigning(false);
        }
    };

    // Unassign customer from port
    const handleUnassignPort = async (portNumber) => {
        if (!window.confirm(`Yakin ingin mencabut kabel dari Port #${portNumber}?`)) {
            return;
        }

        try {
            setLoading(true);
            setError('');
            const res = await odpPortService.unassignPort(odpData.id, { port_number: portNumber });
            setMessage(res.data?.message || 'Port berhasil dikosongkan.');
            await fetchOdpPorts(odpData.id);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal mengosongkan port.');
        } finally {
            setLoading(false);
        }
    };

    // Swap port submit
    const handleSwapPortSubmit = async (e) => {
        e.preventDefault();
        if (!swapModal.fromPort || !swapModal.toPort || !odpData?.id) {
            setError('Pilih port tujuan pemindahan.');
            return;
        }

        try {
            setSwapping(true);
            setError('');
            const res = await odpPortService.swapPort(odpData.id, {
                from_port: swapModal.fromPort,
                to_port: parseInt(swapModal.toPort, 10),
            });

            setMessage(res.data?.message || 'Kabel port berhasil dipindahkan.');
            setSwapModal({ open: false, fromPort: null, toPort: '' });
            await fetchOdpPorts(odpData.id);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memindahkan kabel port.');
        } finally {
            setSwapping(false);
        }
    };

    // Customer WhatsApp Helper
    const getCustomerWhatsAppUrl = (customer) => {
        if (!customer?.phone) return null;
        let phone = String(customer.phone).replace(/\D/g, '');
        if (phone.startsWith('0')) {
            phone = '62' + phone.substring(1);
        }
        const text = `Halo Kak ${customer.name || ''},\n\nTim teknisi kami sedang melakukan pengecekan/pemeliharaan port kabel fiber optik di tiang ODP (${odpData?.nama || ''}). Jika ada kendala koneksi, silakan balas pesan ini. Terima kasih. 🙏`;
        return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    };

    return (
        <div className="space-y-6 pb-16">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900 sm:text-3xl">
                        <QrCode className="h-8 w-8 text-indigo-600" />
                        ODP Port & QR Scanner
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Scan stiker QR code di tiang ODP, kelola alokasi port kabel dropcore pelanggan, dan cetak label stiker tiang.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            if (isScanning) {
                                stopCamera();
                            } else {
                                startCamera();
                            }
                        }}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-md transition ${
                            isScanning ? 'bg-rose-600 hover:bg-rose-700' : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700'
                        }`}
                    >
                        {isScanning ? <CameraOff size={18} /> : <Camera size={18} />}
                        <span>{isScanning ? 'Tutup Kamera' : '📷 Scan QR Kamera'}</span>
                    </button>

                    {odpData && (
                        <button
                            type="button"
                            onClick={() => setIsPrintModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm transition"
                        >
                            <Printer size={16} />
                            <span>Cetak Stiker Tiang</span>
                        </button>
                    )}

                    {odpData && (
                        <button
                            type="button"
                            onClick={() => fetchOdpPorts(odpData.id)}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-600' : ''} />
                            <span>Refresh</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Notifications */}
            {message && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <span>{message}</span>
                    </div>
                    <button type="button" onClick={() => setMessage('')} className="text-emerald-600 hover:text-emerald-800">
                        <X size={16} />
                    </button>
                </div>
            )}
            {error && (
                <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-600 shrink-0" />
                        <span>{error}</span>
                    </div>
                    <button type="button" onClick={() => setError('')} className="text-red-600 hover:text-red-800">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Live Camera Scanner Box */}
            {isScanning && (
                <div className="overflow-hidden rounded-2xl border-2 border-indigo-500 bg-slate-950 p-4 text-white shadow-xl">
                    <div className="flex items-center justify-between pb-3">
                        <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-emerald-400 animate-ping"></span>
                            <h3 className="font-bold text-sm">Arahkan Kamera ke Stiker QR Code ODP di Tiang</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={switchCamera}
                                className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 transition"
                            >
                                Ganti Kamera
                            </button>
                            <button
                                type="button"
                                onClick={stopCamera}
                                className="rounded-lg bg-rose-600/80 px-2.5 py-1 text-xs font-semibold hover:bg-rose-600 transition"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                    <div className="relative mx-auto aspect-video max-h-[360px] w-full overflow-hidden rounded-xl bg-black flex items-center justify-center">
                        <video ref={videoRef} playsInline autoPlay muted className="h-full w-full object-cover" />
                        {/* Target Frame Overlay */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="h-48 w-48 rounded-2xl border-2 border-dashed border-emerald-400/80 bg-emerald-400/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Search & Selector Bar */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    {/* Select ODP from dropdown */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                            Pilih Box ODP / ODC:
                        </label>
                        <select
                            value={selectedOdpId}
                            onChange={(e) => {
                                const id = e.target.value;
                                setSelectedOdpId(id);
                                if (id) fetchOdpPorts(id);
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-2.5 text-xs font-semibold text-gray-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
                        >
                            <option value="">-- Pilih Nama Box ODP --</option>
                            {odps.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.nama} ({o.total_ports || o.port_capacity || 8} Port) {o.alamat_detail ? `· ${o.alamat_detail}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Manual Input Code / Link */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                            Atau Masukkan Kode / Nama ODP:
                        </label>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleLookupCode(manualCode);
                            }}
                            className="flex gap-2"
                        >
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                                <input
                                    type="text"
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value)}
                                    placeholder="Ketik ID atau nama ODP..."
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 pl-9 pr-3 py-2 text-xs focus:border-indigo-500 focus:bg-white focus:outline-none"
                                />
                            </div>
                            <button
                                type="submit"
                                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition"
                            >
                                Cari
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* ODP Info Box & Port Visual Matrix */}
            {odpData ? (
                <div className="space-y-6">
                    {/* ODP Overview Card */}
                    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-900 via-slate-900 to-violet-950 p-5 text-white shadow-md">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="rounded-md bg-indigo-500/30 border border-indigo-400/40 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-indigo-200">
                                        {odpData.device_type?.toUpperCase()}
                                    </span>
                                    <h2 className="text-xl sm:text-2xl font-black tracking-tight">{odpData.nama}</h2>
                                    <span className="rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                                        Terisi {odpData.occupied_ports} / {odpData.total_ports} Port ({odpData.occupancy_percentage}%)
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-300 flex items-center gap-1.5">
                                    <MapPin size={13} className="text-indigo-400 shrink-0" />
                                    <span>{odpData.alamat_detail || '-'}</span>
                                    {odpData.wilayah?.desa && (
                                        <span>· Desa {odpData.wilayah.desa} ({odpData.wilayah.kecamatan || ''})</span>
                                    )}
                                </p>
                            </div>

                            {/* Stats Chips */}
                            <div className="flex items-center gap-3 self-start sm:self-auto text-xs">
                                <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur-sm text-center min-w-[75px]">
                                    <p className="text-[10px] uppercase font-semibold text-slate-400">Total Port</p>
                                    <p className="text-base font-black text-white">{odpData.total_ports}</p>
                                </div>
                                <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/30 p-2.5 text-center min-w-[75px]">
                                    <p className="text-[10px] uppercase font-semibold text-emerald-300">Terisi</p>
                                    <p className="text-base font-black text-emerald-400">{odpData.occupied_ports}</p>
                                </div>
                                <div className="rounded-xl bg-indigo-500/20 border border-indigo-500/30 p-2.5 text-center min-w-[75px]">
                                    <p className="text-[10px] uppercase font-semibold text-indigo-300">Kosong</p>
                                    <p className="text-base font-black text-indigo-400">{odpData.available_ports}</p>
                                </div>
                            </div>
                        </div>

                        {/* Sub details: OLT & PON */}
                        <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                                <span className="text-slate-400 text-[11px]">OLT Parent:</span>
                                <p className="font-bold text-slate-100 truncate">{odpData.olt || 'Belum Terhubung'}</p>
                            </div>
                            <div>
                                <span className="text-slate-400 text-[11px]">PON Port:</span>
                                <p className="font-bold text-slate-100">{odpData.pon_port || 'PON Default'}</p>
                            </div>
                            <div>
                                <span className="text-slate-400 text-[11px]">Rasio Distribusi:</span>
                                <p className="font-bold text-slate-100">{odpData.rasio_distribusi || '1:8'}</p>
                            </div>
                            <div>
                                <span className="text-slate-400 text-[11px]">Koordinat GPS:</span>
                                <p className="font-bold text-slate-100 font-mono text-[11px] truncate">
                                    {odpData.latitude && odpData.longitude ? `${odpData.latitude}, ${odpData.longitude}` : '-'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Unallocated Customers Warning */}
                    {unallocated.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                            <div className="flex items-center gap-2.5">
                                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                                <div>
                                    <p className="font-bold text-sm">
                                        Terdapat {unallocated.length} pelanggan terdaftar di ODP ini tetapi belum memiliki nomor port kabel fisik.
                                    </p>
                                    <p className="text-gray-600 mt-0.5">
                                        Tekan tombol "+ Colok Kabel" pada port kosong di bawah untuk menempatkan pelanggan.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Visual Port Matrix Grid */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                                <Layers size={18} className="text-indigo-600" />
                                <span>Alokasi Port Fisik ODP ({odpData.total_ports} Port)</span>
                            </h3>
                            <div className="flex items-center gap-3 text-xs font-semibold">
                                <span className="flex items-center gap-1 text-emerald-700">
                                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Aktif
                                </span>
                                <span className="flex items-center gap-1 text-rose-700">
                                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span> Isolir
                                </span>
                                <span className="flex items-center gap-1 text-gray-500">
                                    <span className="h-2.5 w-2.5 rounded-full bg-gray-300"></span> Kosong
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {ports.map((port) => {
                                const isAvailable = port.status === 'available';
                                const isIsolated = port.status === 'isolated';
                                const isOccupied = port.status === 'occupied';
                                const cust = port.customer;

                                return (
                                    <div
                                        key={port.port_number}
                                        className={`rounded-2xl border p-4 transition shadow-sm flex flex-col justify-between min-h-[200px] ${
                                            isAvailable
                                                ? 'border-dashed border-gray-300 bg-gray-50/70 hover:border-indigo-400 hover:bg-indigo-50/30'
                                                : isIsolated
                                                ? 'border-rose-200 bg-rose-50/50 hover:shadow-md'
                                                : 'border-emerald-200 bg-white hover:shadow-md'
                                        }`}
                                    >
                                        {/* Port Header */}
                                        <div>
                                            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                                <span className="inline-flex items-center gap-1 font-black text-sm text-gray-900">
                                                    <span className="rounded-md bg-slate-900 text-white px-2 py-0.5 text-xs font-bold">
                                                        PORT #{port.port_number}
                                                    </span>
                                                </span>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                                        isAvailable
                                                            ? 'bg-gray-200 text-gray-700'
                                                            : isIsolated
                                                            ? 'bg-rose-100 text-rose-800'
                                                            : 'bg-emerald-100 text-emerald-800'
                                                    }`}
                                                >
                                                    {isAvailable ? 'KOSONG' : isIsolated ? 'ISOLIR' : 'AKTIF'}
                                                </span>
                                            </div>

                                            {/* Port Body Content */}
                                            {cust ? (
                                                <div className="mt-2.5 space-y-1 text-xs">
                                                    <p className="font-bold text-sm text-gray-900 truncate" title={cust.name}>
                                                        {cust.name}
                                                    </p>
                                                    <p className="text-gray-600 font-mono text-[11px]">
                                                        PPPoE: <strong>{cust.pppoe_username || '-'}</strong>
                                                    </p>
                                                    <p className="text-gray-500 text-[11px] truncate">
                                                        Paket: <strong>{cust.package_name}</strong>
                                                    </p>
                                                    {cust.dropcore_cable_length_meters && (
                                                        <p className="text-indigo-700 text-[11px] font-semibold">
                                                            Kabel Dropcore: {cust.dropcore_cable_length_meters} Meter
                                                        </p>
                                                    )}
                                                    {cust.phone && (
                                                        <p className="text-gray-500 text-[11px]">
                                                            WA: {cust.phone}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="my-auto py-4 text-center text-gray-400 text-xs">
                                                    <Radio size={24} className="mx-auto text-gray-300 mb-1" />
                                                    <span>Port Kosong Siap Pakai</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Port Action Buttons */}
                                        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-1 text-xs">
                                            {isAvailable ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAssignModal({ open: true, portNumber: port.port_number });
                                                        setSelectedCustomer(null);
                                                        setCustomerQuery('');
                                                        setCustomerResults([]);
                                                        setDropcoreMeters('');
                                                    }}
                                                    className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 shadow-sm transition"
                                                >
                                                    <Plus size={14} />
                                                    <span>Colok Pelanggan</span>
                                                </button>
                                            ) : (
                                                <div className="w-full flex items-center justify-between gap-1">
                                                    <div className="flex items-center gap-1">
                                                        {getCustomerWhatsAppUrl(cust) && (
                                                            <a
                                                                href={getCustomerWhatsAppUrl(cust)}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="rounded-lg p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
                                                                title="Chat WhatsApp Pelanggan"
                                                            >
                                                                <Phone size={13} />
                                                            </a>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setSwapModal({ open: true, fromPort: port.port_number, toPort: '' })}
                                                            className="rounded-lg p-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
                                                            title="Pindah / Tukar Port"
                                                        >
                                                            <ArrowRightLeft size={13} />
                                                        </button>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnassignPort(port.port_number)}
                                                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 font-semibold text-[11px] transition"
                                                        title="Cabut kabel dari port ini"
                                                    >
                                                        <Trash2 size={12} />
                                                        <span>Cabut</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
                    <QrCode className="h-14 w-14 text-indigo-300 animate-pulse" />
                    <p className="mt-3 text-base font-bold text-gray-800">
                        Scan QR Code di Tiang atau Pilih Box ODP
                    </p>
                    <p className="mt-1 text-sm text-gray-500 max-w-md">
                        Gunakan tombol kamera di atas untuk membaca stiker QR pada tiang ODP, atau pilih box ODP dari dropdown pencarian.
                    </p>
                </div>
            )}

            {/* MODAL: ASSIGN CUSTOMER TO PORT */}
            <Modal
                isOpen={assignModal.open}
                onClose={() => setAssignModal({ open: false, portNumber: null })}
                title={`Colok Kabel Pelanggan ke Port #${assignModal.portNumber} (${odpData?.nama || ''})`}
            >
                <form onSubmit={handleAssignPortSubmit} className="space-y-4">
                    {/* Search Customer */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                            Cari Pelanggan <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input
                                type="text"
                                value={customerQuery}
                                onChange={(e) => handleSearchCustomer(e.target.value)}
                                placeholder="Ketik nama pelanggan, nomor WA, atau PPPoE..."
                                className="w-full text-xs rounded-xl border border-gray-300 pl-9 pr-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        {searchingCustomer && (
                            <p className="text-[11px] text-gray-500 mt-1 italic">Mencari data pelanggan...</p>
                        )}

                        {/* Customer Search Dropdown Results */}
                        {customerResults.length > 0 && !selectedCustomer && (
                            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 shadow-lg">
                                {customerResults.map((c) => (
                                    <div
                                        key={c.id}
                                        className="p-2.5 text-xs hover:bg-indigo-50/60 cursor-pointer flex items-center justify-between transition"
                                        onClick={() => {
                                            setSelectedCustomer(c);
                                            setCustomerQuery(c.name);
                                            setCustomerResults([]);
                                        }}
                                    >
                                        <div>
                                            <p className="font-bold text-gray-900">{c.name}</p>
                                            <p className="text-gray-500 text-[11px]">
                                                PPPoE: <strong className="text-indigo-700">{c.pppoe_username || '-'}</strong> · WA: {c.phone || '-'}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            className="rounded-lg bg-indigo-600 text-white px-2.5 py-1 text-xs font-semibold"
                                        >
                                            Pilih
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected Customer Card */}
                    {selectedCustomer && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <UserCheck size={18} className="text-emerald-700 shrink-0" />
                                <div>
                                    <p className="font-bold text-gray-900">{selectedCustomer.name}</p>
                                    <p className="text-gray-600 text-[11px]">
                                        PPPoE: <strong>{selectedCustomer.pppoe_username || '-'}</strong> · WA: {selectedCustomer.phone || '-'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedCustomer(null);
                                    setCustomerQuery('');
                                }}
                                className="text-rose-600 hover:text-rose-800 text-xs font-semibold"
                            >
                                Ganti
                            </button>
                        </div>
                    )}

                    {/* Dropcore Length */}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                            Panjang Kabel Dropcore (Meter) <span className="text-gray-400 font-normal">(Opsional)</span>
                        </label>
                        <input
                            type="number"
                            value={dropcoreMeters}
                            onChange={(e) => setDropcoreMeters(e.target.value)}
                            placeholder="Contoh: 150"
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setAssignModal({ open: false, portNumber: null })}
                            className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={assigning || !selectedCustomer}
                            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
                        >
                            {assigning ? 'Menyimpan...' : 'Simpan & Pasang Kabel'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL: SWAP PORT */}
            <Modal
                isOpen={swapModal.open}
                onClose={() => setSwapModal({ open: false, fromPort: null, toPort: '' })}
                title={`Pindah / Tukar Kabel dari Port #${swapModal.fromPort}`}
            >
                <form onSubmit={handleSwapPortSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">
                            Pilih Port Tujuan di Box ODP ({odpData?.nama}): <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={swapModal.toPort}
                            onChange={(e) => setSwapModal((p) => ({ ...p, toPort: e.target.value }))}
                            required
                            className="w-full text-xs rounded-xl border border-gray-300 p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value="">-- Pilih Port Tujuan --</option>
                            {ports
                                .filter((p) => p.port_number !== swapModal.fromPort)
                                .map((p) => (
                                    <option key={p.port_number} value={p.port_number}>
                                        PORT #{p.port_number} {p.customer ? `· (${p.customer.name} - Tukar Posisi)` : '· (KOSONG - Pindah Langsung)'}
                                    </option>
                                ))}
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setSwapModal({ open: false, fromPort: null, toPort: '' })}
                            className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={swapping || !swapModal.toPort}
                            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5"
                        >
                            {swapping ? 'Memindahkan...' : 'Pindahkan Kabel'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL: PRINT STICKER LABEL TIANG */}
            {odpData && (
                <Modal
                    isOpen={isPrintModalOpen}
                    onClose={() => setIsPrintModalOpen(false)}
                    title={`Stiker Label Tiang ODP: ${odpData.nama}`}
                >
                    <div className="space-y-4">
                        {/* Printable Area */}
                        <div id="odp-sticker-printable" className="rounded-2xl border-2 border-black bg-white p-5 text-black font-sans space-y-3 shadow-inner">
                            <div className="flex items-center justify-between border-b-2 border-black pb-2">
                                <div>
                                    <h4 className="text-xl font-black tracking-tight">{odpData.nama}</h4>
                                    <p className="text-[11px] font-bold uppercase text-gray-700">
                                        FIBER OPTIC DISTRIBUTION POINT ({odpData.total_ports} PORT)
                                    </p>
                                </div>
                                <span className="rounded bg-black text-white px-2 py-0.5 text-xs font-black">
                                    {odpData.device_type?.toUpperCase()}
                                </span>
                            </div>

                            <div className="flex items-center gap-4">
                                {/* Big QR Code Image */}
                                <div className="p-2 border-2 border-black rounded-xl bg-white shrink-0">
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(odpData.qr_payload)}`}
                                        alt={`QR Code ${odpData.nama}`}
                                        className="h-28 w-28 object-contain"
                                    />
                                </div>

                                <div className="space-y-1 text-xs">
                                    <p><strong>Lokasi:</strong> {odpData.alamat_detail || '-'}</p>
                                    <p><strong>Wilayah:</strong> Desa {odpData.wilayah?.desa || '-'} ({odpData.wilayah?.kecamatan || '-'})</p>
                                    <p><strong>OLT / PON:</strong> {odpData.olt || 'OLT 1'} · {odpData.pon_port || 'PON 1'}</p>
                                    <p><strong>Rasio:</strong> {odpData.rasio_distribusi || '1:8'}</p>
                                    <p className="text-[10px] text-gray-500 font-mono">
                                        GPS: {odpData.latitude}, {odpData.longitude}
                                    </p>
                                </div>
                            </div>

                            <div className="border-t border-black pt-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-800">
                                ⚡ Scan QR Code menggunakan kamera HP teknisi untuk manajemen alokasi kabel port tiang
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsPrintModalOpen(false)}
                                className="px-4 py-2 text-xs font-semibold text-gray-600 rounded-xl hover:bg-gray-100"
                            >
                                Tutup
                            </button>
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 rounded-xl hover:bg-black flex items-center gap-1.5 shadow-sm"
                            >
                                <Printer size={15} />
                                <span>Cetak Label Stiker Sekarang</span>
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
