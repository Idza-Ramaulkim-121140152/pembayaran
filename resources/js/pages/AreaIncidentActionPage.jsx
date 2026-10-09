import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    AlertTriangle, Zap, Wrench, Send, CheckCircle2, AlertCircle,
    Users, Phone, MapPin, RefreshCw, Search, Check, Info, ArrowLeft,
    ExternalLink, ShieldAlert, Sparkles, MessageSquare, Navigation,
    Wifi, WifiOff, Layers, Compass, CheckCircle, Radio, Clock
} from 'lucide-react';
import { attachSatelliteLayerWithFallback } from '../utils/leafletTileFallback';

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

const DEFAULT_CENTER = [-5.632727646, 105.548014641];

export default function AreaIncidentActionPage() {
    const { token } = useParams();

    const [loading, setLoading] = useState(true);
    const [incident, setIncident] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Map States
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersMapRef = useRef(new Map());
    const tileFallbackRef = useRef(null);
    const [mapReady, setMapReady] = useState(false);
    const [tileMode, setTileMode] = useState('satellite'); // 'satellite' | 'osm'
    const [mapFilter, setMapFilter] = useState('all'); // 'all' | 'offline' | 'online'
    const [focusedCustomerId, setFocusedCustomerId] = useState(null);

    // Opsi 1: Tandai Gangguan
    const [incidentType, setIncidentType] = useState('pemadaman_listrik');
    const [incidentNotes, setIncidentNotes] = useState('');
    const [markingNotice, setMarkingNotice] = useState(false);
    const [markSuccess, setMarkSuccess] = useState(null);

    // Opsi 2: Kirim Pesan ke Pelanggan Tidak Aktif
    const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [messageText, setMessageText] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('listrik');
    const [sendingNotification, setSendingNotification] = useState(false);
    const [sendResult, setSendResult] = useState(null);
    const [confirmSendModal, setConfirmSendModal] = useState(false);

    const getTemplates = (areaCode = 'INI') => ({
        listrik: `⚠️ *INFORMASI GANGGUAN JARINGAN (LISTRIK PADAM)* ⚠️\n\nYth. Pelanggan RumahKitaNet di Area *${areaCode}*,\n\nSaat ini koneksi internet di wilayah Anda sedang mengalami gangguan karena adanya *Pemadaman Listrik (PLN)* pada perangkat transmisi / distribusi kami.\n\nPerangkat akan menyala kembali secara otomatis sesaat setelah aliran listrik PLN normal.\n\nMohon maaf atas ketidaknyamanan yang terjadi. Terima kasih atas pengertian dan kesabaran Anda. 🙏`,
        maintenance: `🔧 *PEMBERITAHUAN MAINTENANCE / PERBAIKAN JARINGAN* 🔧\n\nYth. Pelanggan RumahKitaNet di Area *${areaCode}*,\n\nSaat ini sedang berlangsung pekerjaan *Perbaikan / Pemeliharaan Jaringan Darurat* pada wilayah Anda (Area *${areaCode}*).\n\nTim teknisi kami sedang berada di lokasi untuk mempercepat pemulihan koneksi Anda.\n\nMohon maaf atas ketidaknyamanan ini. Kami akan berupaya agar koneksi segera kembali normal secepat mungkin. Terima kasih. 🙏`,
        umum: `📢 *INFORMASI GANGGUAN JARINGAN INTERNET* 📢\n\nYth. Pelanggan RumahKitaNet di Area *${areaCode}*,\n\nKami menginformasikan bahwa sistem mendeteksi adanya penurunan kualitas/putusnya koneksi di area *${areaCode}*.\n\nTim teknisi telah menerima laporan dan sedang melakukan investigasi serta perbaikan langsung.\n\nCek update status: https://rumahkitanet.site/status-jaringan\nTerima kasih atas kerja sama dan pengertiannya. 🙏`
    });

    const fetchIncident = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) {
            setRefreshing(true);
        }
        try {
            const res = await fetch(`/api/area-incident/${token}`, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken() || '',
                }
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Gagal memuat rincian insiden area');
            }

            const inc = data.incident;
            setIncident(inc);
            setLastRefreshedAt(new Date());

            // Default message template if not edited yet
            if (!messageText) {
                const tpls = getTemplates(inc.area_code);
                setMessageText(tpls.listrik);
            }

            // If first load, default select customers that are STILL offline
            const list = inc.realtime_customers || inc.inactive_customers_data || [];
            if (selectedCustomerIds.length === 0 && list.length > 0) {
                const offlineIds = list.filter(c => !c.is_online).map(c => c.id);
                setSelectedCustomerIds(offlineIds.length > 0 ? offlineIds : list.map(c => c.id));
            }

            // Populate existing values if already marked
            if (inc.incident_type && !incidentType) {
                setIncidentType(inc.incident_type);
            }
            if (inc.incident_notes && !incidentNotes) {
                setIncidentNotes(inc.incident_notes);
            }
        } catch (err) {
            console.error('Fetch incident error:', err);
            if (!incident) {
                setError(err.message);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token, messageText, incidentType, incidentNotes, selectedCustomerIds.length, incident]);

    useEffect(() => {
        if (token) {
            fetchIncident();
        }
    }, [token]);

    // Auto-refresh interval (every 25 seconds if enabled)
    useEffect(() => {
        if (!autoRefresh || !token) return;
        const interval = setInterval(() => {
            fetchIncident(false);
        }, 25000);
        return () => clearInterval(interval);
    }, [autoRefresh, token, fetchIncident]);

    const affectedCustomers = useMemo(() => {
        return incident?.realtime_customers || incident?.inactive_customers_data || [];
    }, [incident]);

    const onlineCustomersCount = useMemo(() => {
        return incident?.realtime_summary?.current_online_count ?? affectedCustomers.filter(c => c.is_online).length;
    }, [incident, affectedCustomers]);

    const offlineCustomersCount = useMemo(() => {
        return incident?.realtime_summary?.current_offline_count ?? affectedCustomers.filter(c => !c.is_online).length;
    }, [incident, affectedCustomers]);

    const totalCustomersCount = affectedCustomers.length;

    const recoveryRate = totalCustomersCount > 0
        ? Math.round((onlineCustomersCount / totalCustomersCount) * 100)
        : 0;

    const customersWithCoords = useMemo(() => {
        return affectedCustomers.filter(c => c.latitude !== null && c.longitude !== null && !isNaN(Number(c.latitude)) && !isNaN(Number(c.longitude)));
    }, [affectedCustomers]);

    // Inisialisasi Peta Leaflet
    useEffect(() => {
        if (!mapContainerRef.current) return;

        try {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            const initialCenter = customersWithCoords.length > 0
                ? [Number(customersWithCoords[0].latitude), Number(customersWithCoords[0].longitude)]
                : DEFAULT_CENTER;

            const map = L.map(mapContainerRef.current, {
                center: initialCenter,
                zoom: 14,
                zoomControl: true,
                dragging: true,
                scrollWheelZoom: true,
            });

            tileFallbackRef.current = attachSatelliteLayerWithFallback(L, map, {
                onFallback: () => setTileMode('osm'),
            });

            mapInstanceRef.current = map;
            setMapReady(true);

            setTimeout(() => {
                map.invalidateSize();
            }, 250);

            return () => {
                if (tileFallbackRef.current) {
                    tileFallbackRef.current.cleanup();
                    tileFallbackRef.current = null;
                }
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.remove();
                    mapInstanceRef.current = null;
                }
                markersMapRef.current.clear();
            };
        } catch (err) {
            console.error('Error initializing map:', err);
        }
    }, [customersWithCoords.length > 0]);

    // Render Markers Pelanggan pada Peta
    useEffect(() => {
        if (!mapInstanceRef.current || !mapReady) return;

        const map = mapInstanceRef.current;

        // Hapus marker lama
        markersMapRef.current.forEach((marker) => map.removeLayer(marker));
        markersMapRef.current.clear();

        const bounds = [];

        customersWithCoords.forEach((c) => {
            const isOnline = Boolean(c.is_online);

            // Filter status jika dipilih
            if (mapFilter === 'offline' && isOnline) return;
            if (mapFilter === 'online' && !isOnline) return;

            const lat = Number(c.latitude);
            const lng = Number(c.longitude);
            const latLng = [lat, lng];
            bounds.push(latLng);

            // Marker HTML Icon (Hijau untuk Online, Merah dengan pulse untuk Offline)
            const iconHtml = isOnline
                ? `
                <div style="position:relative; width:30px; height:30px; display:flex; align-items:center; justify-content:center;">
                    <div style="background-color:#16a34a; width:26px; height:26px; border-radius:9999px; display:flex; align-items:center; justify-content:center; border:2.5px solid #ffffff; box-shadow:0 3px 8px rgba(0,0,0,0.35); color:#ffffff;">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                </div>
                `
                : `
                <div style="position:relative; width:34px; height:34px; display:flex; align-items:center; justify-content:center;">
                    <span style="position:absolute; width:100%; height:100%; border-radius:9999px; background-color:#ef4444; opacity:0.65; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
                    <div style="position:relative; background-color:#dc2626; width:26px; height:26px; border-radius:9999px; display:flex; align-items:center; justify-content:center; border:2.5px solid #ffffff; box-shadow:0 3px 8px rgba(0,0,0,0.4); color:#ffffff; font-size:11px;">
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </div>
                </div>
                `;

            const marker = L.marker(latLng, {
                icon: L.divIcon({
                    className: 'custom-customer-incident-marker',
                    html: iconHtml,
                    iconSize: [34, 34],
                    iconAnchor: [17, 17],
                }),
            }).addTo(map);

            const waPhone = c.phone ? c.phone.replace(/^0/, '62').replace(/\D/g, '') : '';
            const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

            const popupContent = `
                <div style="min-width:240px; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; padding: 2px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 6px;">
                        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">
                            ${c.odp ? 'ODP: ' + c.odp : 'AREA ' + (incident?.area_code || '')}
                        </span>
                        <span style="padding: 2px 7px; border-radius: 9999px; font-size: 10px; font-weight: 800; ${isOnline ? 'background:#dcfce7; color:#15803d; border: 1px solid #bbf7d0;' : 'background:#fee2e2; color:#b91c1c; border: 1px solid #fecaca;'}">
                            ${isOnline ? '🟢 AKTIF (ONLINE)' : '🔴 GANGGUAN (OFFLINE)'}
                        </span>
                    </div>
                    <div style="font-weight: 800; font-size: 14px; color: #0f172a; line-height: 1.3; margin-bottom: 3px;">
                        ${c.name}
                    </div>
                    <div style="font-size: 12px; color: #475569; font-family: monospace; font-weight: 600; margin-bottom: 6px;">
                        PPPoE: ${c.pppoe_username}
                    </div>
                    ${c.address ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 6px; line-height: 1.3;">📍 ${c.address}</div>` : ''}
                    ${isOnline && c.ip_address ? `
                        <div style="font-size: 11px; color: #15803d; background: #f0fdf4; padding: 4px 6px; border-radius: 6px; margin-bottom: 8px; font-weight: 500;">
                            🌐 IP: <span style="font-family:monospace; font-weight:700;">${c.ip_address}</span> ${c.uptime ? `(Uptime: ${c.uptime})` : ''}
                        </div>
                    ` : ''}
                    <div style="display:flex; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9;">
                        ${waPhone ? `
                            <a href="https://wa.me/${waPhone}" target="_blank" style="flex:1; background:#22c55e; color:#ffffff; font-size:11px; font-weight:700; text-align:center; padding: 6px 8px; border-radius: 8px; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                <span>💬 WhatsApp</span>
                            </a>
                        ` : ''}
                        <a href="${gmapsUrl}" target="_blank" style="flex:1; background:#2563eb; color:#ffffff; font-size:11px; font-weight:700; text-align:center; padding: 6px 8px; border-radius: 8px; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <span>🗺️ Buka Rute</span>
                        </a>
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent, { maxWidth: 280 });
            markersMapRef.current.set(c.id, marker);
        });

        // Auto zoom fit bounds jika ada titik koordinat
        if (bounds.length > 0 && !focusedCustomerId) {
            map.fitBounds(L.latLngBounds(bounds), {
                padding: [45, 45],
                maxZoom: 16,
            });
        }
    }, [mapReady, customersWithCoords, mapFilter, incident?.area_code]);

    const handleFocusCustomerOnMap = (customer) => {
        if (!customer.latitude || !customer.longitude || !mapInstanceRef.current) return;
        setFocusedCustomerId(customer.id);
        const map = mapInstanceRef.current;
        const lat = Number(customer.latitude);
        const lng = Number(customer.longitude);

        map.flyTo([lat, lng], 17, { duration: 1.2 });

        const marker = markersMapRef.current.get(customer.id);
        if (marker) {
            setTimeout(() => {
                marker.openPopup();
            }, 1200);
        }

        // Scroll to map container smoothly
        mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const handleResetMapView = () => {
        if (!mapInstanceRef.current || customersWithCoords.length === 0) return;
        setFocusedCustomerId(null);
        const bounds = customersWithCoords.map(c => [Number(c.latitude), Number(c.longitude)]);
        mapInstanceRef.current.fitBounds(L.latLngBounds(bounds), {
            padding: [45, 45],
            maxZoom: 16,
        });
    };

    const handleSelectTemplate = (type) => {
        setSelectedTemplate(type);
        const tpls = getTemplates(incident?.area_code || 'AREA');
        if (tpls[type]) {
            setMessageText(tpls[type]);
        }
    };

    const handleMarkNotice = async (e) => {
        e?.preventDefault();
        setMarkingNotice(true);
        setMarkSuccess(null);
        try {
            const res = await fetch(`/api/area-incident/${token}/mark-notice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken() || '',
                },
                body: JSON.stringify({
                    type: incidentType,
                    notes: incidentNotes,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Gagal menandai gangguan');
            }

            setMarkSuccess(data.message || 'Gangguan berhasil ditandai & dipublikasikan ke Status Jaringan!');
            if (data.incident) {
                setIncident(data.incident);
            }
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setMarkingNotice(false);
        }
    };

    const handleSendNotification = async () => {
        setConfirmSendModal(false);
        setSendingNotification(true);
        setSendResult(null);

        try {
            const res = await fetch(`/api/area-incident/${token}/send-notification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken() || '',
                },
                body: JSON.stringify({
                    message: messageText,
                    customer_ids: selectedCustomerIds,
                }),
            });

            const data = await res.json();
            setSendResult({
                success: data.success,
                message: data.message || (data.success ? 'Pesan berhasil dikirim!' : 'Sebagian pesan gagal'),
                sent_count: data.sent_count ?? 0,
                failed_count: data.failed_count ?? 0,
            });

            if (data.incident) {
                setIncident(data.incident);
            }
        } catch (err) {
            setSendResult({
                success: false,
                message: 'Terjadi kesalahan jaringan: ' + err.message,
                sent_count: 0,
                failed_count: selectedCustomerIds.length,
            });
        } finally {
            setSendingNotification(false);
        }
    };

    const selectOnlyOfflineCustomers = () => {
        const offlineIds = affectedCustomers.filter(c => !c.is_online).map(c => c.id);
        setSelectedCustomerIds(offlineIds);
    };

    const toggleSelectAll = () => {
        if (selectedCustomerIds.length === affectedCustomers.length) {
            setSelectedCustomerIds([]);
        } else {
            setSelectedCustomerIds(affectedCustomers.map(c => c.id));
        }
    };

    const toggleCustomer = (id) => {
        setSelectedCustomerIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
                    <RefreshCw className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-4" />
                    <h2 className="text-lg font-bold text-slate-800">Memeriksa Status Jaringan & Pelanggan...</h2>
                    <p className="text-sm text-slate-500 mt-1">Mengambil koordinat dan status koneksi realtime dari MikroTik</p>
                </div>
            </div>
        );
    }

    if (error || !incident) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-8 max-w-md w-full text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Insiden Tidak Ditemukan</h2>
                    <p className="text-sm text-slate-600 mb-6">
                        {error || 'Link penanganan gangguan sudah kedaluwarsa atau token tidak valid.'}
                    </p>
                    <Link
                        to="/status-jaringan"
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition"
                    >
                        <ArrowLeft size={16} />
                        Buka Status Jaringan Publik
                    </Link>
                </div>
            </div>
        );
    }

    const filteredCustomers = affectedCustomers.filter(c => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.phone && c.phone.includes(q)) ||
            (c.pppoe_username && c.pppoe_username.toLowerCase().includes(q)) ||
            (c.odp && c.odp.toLowerCase().includes(q))
        );
    });

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
            {/* Top Bar */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
                <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                            RK
                        </div>
                        <div>
                            <h1 className="text-base font-bold text-slate-900 leading-tight">
                                Pusat Aksi Gangguan Area
                            </h1>
                            <p className="text-xs text-slate-500">RumahKitaNet NOC & Field Response</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => fetchIncident(true)}
                            disabled={refreshing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition border border-blue-200"
                        >
                            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                            <span>{refreshing ? 'Memeriksa...' : 'Cek Realtime'}</span>
                        </button>
                        <Link
                            to="/status-jaringan"
                            target="_blank"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                        >
                            <span>Status Jaringan</span>
                            <ExternalLink size={13} />
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
                {/* Incident Overview Card */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                    <div className="bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 p-1" />
                    <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                                        <ShieldAlert size={13} />
                                        PERINGATAN GANGGUAN MASSAL
                                    </span>
                                    <span className="text-xs text-slate-400">•</span>
                                    <span className="text-xs text-slate-500 font-medium">
                                        {incident.alerted_at ? new Date(incident.alerted_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                                    </span>
                                </div>
                                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                                    Area / Dusun: <span className="text-orange-600">{incident.area_code}</span>
                                </h2>
                                <p className="text-sm text-slate-600 mt-1">
                                    Terdeteksi {totalCustomersCount} pelanggan masuk daftar gangguan area ini.
                                </p>
                            </div>

                            <div className="flex flex-col sm:items-end gap-1.5">
                                <div className="text-xs text-slate-500 font-medium">Status Tindakan:</div>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                                    incident.status === 'notified_customers' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                    incident.status === 'marked_notice' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                    'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                    {incident.status === 'notified_customers' ? '✓ Pesan Terkirim ke Pelanggan' :
                                     incident.status === 'marked_notice' ? '✓ Gangguan Ditandai' :
                                     'Menunggu Respon Teknisi'}
                                </span>
                            </div>
                        </div>

                        {/* Realtime Recovery Bar */}
                        <div className="mt-5 p-4 rounded-xl bg-slate-900 text-white shadow-inner">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                        Status Pemulihan Realtime (MikroTik)
                                    </span>
                                </div>
                                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                    <Clock size={12} />
                                    <span>
                                        {lastRefreshedAt ? `Diperbarui ${lastRefreshedAt.toLocaleTimeString('id-ID')}` : 'Live'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setAutoRefresh(!autoRefresh)}
                                        className={`ml-1 text-[11px] px-2 py-0.5 rounded font-semibold transition ${
                                            autoRefresh ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                                        }`}
                                    >
                                        Auto: {autoRefresh ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                            </div>

                            <div className="w-full bg-slate-800 rounded-full h-3.5 overflow-hidden flex p-0.5 border border-slate-700">
                                <div
                                    className="bg-gradient-to-r from-emerald-500 to-green-400 h-full rounded-full transition-all duration-700 ease-out"
                                    style={{ width: `${recoveryRate}%` }}
                                />
                            </div>

                            <div className="flex items-center justify-between text-xs mt-2 text-slate-300 font-medium">
                                <span>
                                    <strong className="text-emerald-400 font-bold">{onlineCustomersCount}</strong> dari {totalCustomersCount} Pelanggan Sudah Nyala ({recoveryRate}%)
                                </span>
                                <span>
                                    <strong className="text-red-400 font-bold">{offlineCustomersCount}</strong> Masih Padam / Gangguan
                                </span>
                            </div>
                        </div>

                        {/* Metric Highlights */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-2">
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                <div className="text-xs text-slate-500 font-medium">Total Terdampak</div>
                                <div className="text-xl font-bold text-slate-800 mt-0.5">{totalCustomersCount}</div>
                            </div>
                            <div className="bg-emerald-50/70 rounded-xl p-3 border border-emerald-100">
                                <div className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> Sudah Aktif (Online)
                                </div>
                                <div className="text-xl font-bold text-emerald-700 mt-0.5">{onlineCustomersCount}</div>
                            </div>
                            <div className="bg-red-50/70 rounded-xl p-3 border border-red-100">
                                <div className="text-xs text-red-700 font-medium flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> Masih Offline
                                </div>
                                <div className="text-xl font-bold text-red-700 mt-0.5">{offlineCustomersCount}</div>
                            </div>
                            <div className="bg-blue-50/70 rounded-xl p-3 border border-blue-100">
                                <div className="text-xs text-blue-700 font-medium">Titik Lokasi GPS</div>
                                <div className="text-xl font-bold text-blue-700 mt-0.5">{customersWithCoords.length} Pelanggan</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 🗺️ MAPS PELANGGAN GANGGUAN REALTIME 🗺️ */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-base">
                                <MapPin size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <span>Peta Sebaran Pelanggan Terdampak</span>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                                        Realtime
                                    </span>
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Hanya menampilkan pelanggan area {incident.area_code} yang masuk daftar insiden. Titik otomatis berubah hijau saat aktif.
                                </p>
                            </div>
                        </div>

                        {/* Map Controls */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Status Filter */}
                            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setMapFilter('all')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                                        mapFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    Semua ({customersWithCoords.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMapFilter('offline')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                                        mapFilter === 'offline' ? 'bg-red-600 text-white shadow-2xs' : 'text-red-700 hover:text-red-900'
                                    }`}
                                >
                                    🔴 Offline ({customersWithCoords.filter(c => !c.is_online).length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMapFilter('online')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                                        mapFilter === 'online' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-emerald-700 hover:text-emerald-900'
                                    }`}
                                >
                                    🟢 Online ({customersWithCoords.filter(c => c.is_online).length})
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={handleResetMapView}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1"
                                title="Fokuskan ke seluruh titik pelanggan"
                            >
                                <Compass size={14} />
                                <span>Reset Zoom</span>
                            </button>
                        </div>
                    </div>

                    {/* Leaflet Map Canvas */}
                    <div className="relative">
                        <div
                            ref={mapContainerRef}
                            className="w-full h-[420px] sm:h-[480px] bg-slate-900 z-10"
                        />

                        {customersWithCoords.length === 0 && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-6 text-center text-white">
                                <div className="max-w-md space-y-2">
                                    <MapPin size={32} className="mx-auto text-orange-400 opacity-80" />
                                    <p className="font-bold text-sm">Belum Ada Titik Koordinat GPS</p>
                                    <p className="text-xs text-slate-300">
                                        Pelanggan pada area {incident.area_code} belum diisi data koordinat latitude/longitude di Master Data Pelanggan.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Map Floating Legend */}
                        <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-xs p-3 rounded-xl border border-slate-200 shadow-md text-xs space-y-1.5">
                            <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-1">
                                Keterangan Titik
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-red-600 border border-white shadow-xs inline-block animate-pulse"></span>
                                <span className="font-semibold text-slate-700">Padam / Offline ({offlineCustomersCount})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-emerald-600 border border-white shadow-xs inline-block"></span>
                                <span className="font-semibold text-slate-700">Sudah Nyala / Online ({onlineCustomersCount})</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Option 1: Tandai Gangguan */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-base">
                                1
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Tandai Jenis Gangguan</h3>
                                <p className="text-xs text-slate-500">
                                    Mempublikasikan insiden ini ke portal status jaringan agar pelanggan & tim mengetahui penyebabnya.
                                </p>
                            </div>
                        </div>
                        {incident.network_notice_id && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                <Check size={14} /> Terpublikasi
                            </span>
                        )}
                    </div>

                    {markSuccess && (
                        <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-sm text-emerald-800">
                            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                            <span>{markSuccess}</span>
                        </div>
                    )}

                    <form onSubmit={handleMarkNotice} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                                Pilih Penyebab Gangguan:
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIncidentType('pemadaman_listrik');
                                        handleSelectTemplate('listrik');
                                    }}
                                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition ${
                                        incidentType === 'pemadaman_listrik'
                                            ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                >
                                    <div className={`p-2 rounded-lg shrink-0 ${incidentType === 'pemadaman_listrik' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        <Zap size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-900">Pemadaman Listrik (PLN)</div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Mati lampu di wilayah {incident.area_code} yang menyebabkan OLT/switch/AP padam.
                                        </p>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIncidentType('maintenance_jaringan');
                                        handleSelectTemplate('maintenance');
                                    }}
                                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition ${
                                        incidentType === 'maintenance_jaringan'
                                            ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                >
                                    <div className={`p-2 rounded-lg shrink-0 ${incidentType === 'maintenance_jaringan' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        <Wrench size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-900">Maintenance Jaringan</div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Perbaikan kabel FO, pergantian perangkat, atau optimasi routing teknisi.
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                                Catatan Tambahan Teknisi (Opsional):
                            </label>
                            <textarea
                                value={incidentNotes}
                                onChange={(e) => setIncidentNotes(e.target.value)}
                                rows={2}
                                placeholder="Contoh: Pemadaman PLN jalur utara estimasi nyala pukul 16.00 WIB, atau kabel FO putus tertimpa pohon sedang disambung..."
                                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>

                        <div className="flex items-center justify-end">
                            <button
                                type="submit"
                                disabled={markingNotice}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs disabled:opacity-50 transition"
                            >
                                {markingNotice ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Menyimpan...
                                    </>
                                ) : (
                                    <>
                                        <Check size={16} />
                                        Tandai & Publikasikan Gangguan
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Option 2: Kirim Pesan ke Pelanggan Tidak Aktif */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-base">
                                2
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Kirim Pesan WhatsApp ke Pelanggan</h3>
                                <p className="text-xs text-slate-500">
                                    Kirim notifikasi pesan langsung ke WhatsApp pelanggan yang terdampak pada area {incident.area_code}.
                                </p>
                            </div>
                        </div>
                    </div>

                    {sendResult && (
                        <div className={`mb-5 p-4 rounded-xl border ${sendResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                            <div className="flex items-center gap-2 font-bold text-sm mb-1">
                                {sendResult.success ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-amber-600" />}
                                <span>{sendResult.message}</span>
                            </div>
                            <div className="text-xs opacity-80 mt-1">
                                Terkirim: {sendResult.sent_count} | Gagal: {sendResult.failed_count}
                            </div>
                        </div>
                    )}

                    {/* Template Chooser */}
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                            Pilih Template Pesan Cepat:
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => handleSelectTemplate('listrik')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                    selectedTemplate === 'listrik'
                                        ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                ⚡ Template Listrik Padam
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectTemplate('maintenance')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                    selectedTemplate === 'maintenance'
                                        ? 'bg-blue-50 text-blue-800 border-blue-300 shadow-2xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                🔧 Template Maintenance
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectTemplate('umum')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                                    selectedTemplate === 'umum'
                                        ? 'bg-purple-50 text-purple-800 border-purple-300 shadow-2xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                📢 Template Gangguan Umum
                            </button>
                        </div>
                    </div>

                    {/* Editable Text Area (Free Text) */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                Isi Pesan WhatsApp (Dapat Diedit Bebas):
                            </label>
                            <span className="text-xs text-slate-400">{messageText.length} karakter</span>
                        </div>
                        <textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            rows={6}
                            className="w-full px-3.5 py-2.5 text-sm font-sans border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50"
                            placeholder="Tulis pesan WhatsApp untuk pelanggan di area ini..."
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            * Anda dapat mengubah, menambah keterangan teknis, atau mengedit teks di atas secara bebas sebelum dikirim.
                        </p>
                    </div>

                    {/* Customers Selector & Table */}
                    <div>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <h4 className="text-sm font-bold text-slate-900">
                                    Daftar Pelanggan Area {incident.area_code} ({affectedCustomers.length})
                                </h4>
                                <p className="text-xs text-slate-500">
                                    {selectedCustomerIds.length} pelanggan dipilih untuk menerima pesan WhatsApp.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={selectOnlyOfflineCustomers}
                                    className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition"
                                >
                                    Pilih Hanya yang Offline ({offlineCustomersCount})
                                </button>
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                                >
                                    {selectedCustomerIds.length === affectedCustomers.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                                </button>
                            </div>
                        </div>

                        {/* Search Filter */}
                        <div className="relative mb-3">
                            <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari nama pelanggan, nomor WhatsApp, atau ODP..."
                                className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300"
                            />
                        </div>

                        {/* Customer List Table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto divide-y divide-slate-100">
                            {filteredCustomers.length === 0 ? (
                                <div className="p-6 text-center text-xs text-slate-400">
                                    Tidak ada pelanggan yang cocok dengan pencarian.
                                </div>
                            ) : (
                                filteredCustomers.map(c => {
                                    const isSelected = selectedCustomerIds.includes(c.id);
                                    const hasValidPhone = c.phone && c.phone !== '0';
                                    const isOnline = Boolean(c.is_online);
                                    const hasCoords = Boolean(c.latitude && c.longitude);

                                    return (
                                        <div
                                            key={c.id}
                                            className={`p-3 flex items-center justify-between gap-3 text-left transition ${
                                                isSelected ? 'bg-emerald-50/40 hover:bg-emerald-50/60' : 'hover:bg-slate-50'
                                            }`}
                                        >
                                            <div
                                                onClick={() => hasValidPhone && toggleCustomer(c.id)}
                                                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {}}
                                                    disabled={!hasValidPhone}
                                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-slate-900 truncate">
                                                            {c.name || 'Tanpa Nama'}
                                                        </span>
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-bold rounded-full ${
                                                            isOnline ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'
                                                        }`}>
                                                            {isOnline ? '🟢 Aktif' : '🔴 Padam'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 mt-0.5">
                                                        <span className="font-mono text-slate-600">{c.pppoe_username}</span>
                                                        {c.odp && <span>• ODP: {c.odp}</span>}
                                                        {isOnline && c.ip_address && (
                                                            <span className="text-emerald-700 font-mono">• IP: {c.ip_address}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {hasCoords && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleFocusCustomerOnMap(c)}
                                                        className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition border border-blue-200 flex items-center gap-1"
                                                        title="Lihat titik di peta"
                                                    >
                                                        <Navigation size={12} />
                                                        <span className="hidden sm:inline">Peta</span>
                                                    </button>
                                                )}
                                                <div className="text-right">
                                                    <div className="text-xs font-mono font-medium text-slate-700 flex items-center justify-end gap-1">
                                                        <Phone size={12} className="text-slate-400" />
                                                        {c.phone || <span className="text-red-500 text-2xs">No Phone</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Submit Send Button */}
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                            <div className="text-xs text-slate-500">
                                Penerima terpilih: <span className="font-bold text-slate-800">{selectedCustomerIds.length}</span> orang
                            </div>
                            <button
                                type="button"
                                onClick={() => setConfirmSendModal(true)}
                                disabled={selectedCustomerIds.length === 0 || !messageText.trim() || sendingNotification}
                                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-xs disabled:opacity-50 transition"
                            >
                                {sendingNotification ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Mengirim Pesan...
                                    </>
                                ) : (
                                    <>
                                        <Send size={16} />
                                        Kirim Pesan ke {selectedCustomerIds.length} Pelanggan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* Confirmation Modal */}
            {confirmSendModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
                            <Send size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 text-center mb-2">
                            Kirim Notifikasi Massal?
                        </h3>
                        <p className="text-xs text-slate-600 text-center mb-4 leading-relaxed">
                            Pesan WhatsApp akan dikirim ke <span className="font-bold text-emerald-700">{selectedCustomerIds.length} pelanggan</span> di area <strong>{incident.area_code}</strong> melalui WhatsApp Gateway.
                        </p>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 max-h-36 overflow-y-auto mb-5 font-sans whitespace-pre-line">
                            {messageText}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmSendModal(false)}
                                className="w-1/2 py-2.5 px-4 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSendNotification}
                                className="w-1/2 py-2.5 px-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition"
                            >
                                Ya, Kirim Sekarang
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}