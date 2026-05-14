import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
    AlertTriangle,
    Eye,
    EyeOff,
    Loader,
    MapPin,
    Network,
    RefreshCw,
    Users,
} from 'lucide-react';
import Alert from '../components/common/Alert';
import apiClient from '../services/api';
import { attachSatelliteLayerWithFallback } from '../utils/leafletTileFallback';

const DEFAULT_CENTER = [-5.632727646, 105.548014641];

function MonitoringMaps() {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef({ customers: [], odps: [] });
    const resizeObserverRef = useRef(null);
    const tileFallbackRef = useRef(null);

    const [loadingData, setLoadingData] = useState(true);
    const [dataError, setDataError] = useState(null);
    const [mapInitError, setMapInitError] = useState(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapResetKey, setMapResetKey] = useState(0);
    const [tileLayerMode, setTileLayerMode] = useState('satellite');

    const [data, setData] = useState({ customers: [], odps: [] });
    const [filters, setFilters] = useState({
        showCustomers: true,
        showOdps: true,
        showOnlineOnly: false,
    });

    const fetchMapData = useCallback(async () => {
        try {
            setLoadingData(true);
            setDataError(null);

            const response = await apiClient.get('/monitoring-maps');
            const payload = response?.data;

            if (payload?.success && payload?.data) {
                setData({
                    customers: payload.data.customers || [],
                    odps: payload.data.odps || [],
                });
                return;
            }

            setDataError(payload?.message || 'Data peta tidak valid.');
        } catch (err) {
            const status = err?.response?.status;
            if (status === 403) {
                setDataError('Akses monitoring maps ditolak oleh policy.');
            } else if (status === 401) {
                setDataError('Sesi login berakhir. Silakan login ulang.');
            } else if (status >= 500) {
                setDataError('Server sedang bermasalah. Silakan coba lagi.');
            } else {
                setDataError('Gagal memuat data peta.');
            }
        } finally {
            setLoadingData(false);
        }
    }, []);

    useEffect(() => {
        fetchMapData();
    }, [fetchMapData]);

    useEffect(() => {
        if (!mapRef.current) {
            return undefined;
        }

        setMapReady(false);
        setMapInitError(null);
        setTileLayerMode('satellite');

        try {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            const map = L.map(mapRef.current, {
                center: DEFAULT_CENTER,
                zoom: 14,
                zoomControl: true,
                dragging: true,
                scrollWheelZoom: true,
            });

            tileFallbackRef.current = attachSatelliteLayerWithFallback(L, map, {
                onFallback: () => setTileLayerMode('osm'),
            });

            mapInstanceRef.current = map;
            setMapReady(true);

            requestAnimationFrame(() => {
                map.invalidateSize();
            });

            const timers = [120, 350, 700].map((delay) =>
                window.setTimeout(() => {
                    map.invalidateSize();
                }, delay)
            );

            if (window.ResizeObserver) {
                resizeObserverRef.current = new ResizeObserver(() => {
                    if (mapInstanceRef.current) {
                        mapInstanceRef.current.invalidateSize();
                    }
                });
                resizeObserverRef.current.observe(mapRef.current);
            }

            return () => {
                timers.forEach((id) => window.clearTimeout(id));

                if (resizeObserverRef.current) {
                    resizeObserverRef.current.disconnect();
                    resizeObserverRef.current = null;
                }

                if (tileFallbackRef.current) {
                    tileFallbackRef.current.cleanup();
                    tileFallbackRef.current = null;
                }

                markersRef.current.customers = [];
                markersRef.current.odps = [];

                if (mapInstanceRef.current) {
                    mapInstanceRef.current.remove();
                    mapInstanceRef.current = null;
                }
            };
        } catch (error) {
            setMapInitError('Mesin peta gagal diinisialisasi.');
            return undefined;
        }
    }, [mapResetKey]);

    useEffect(() => {
        if (!mapInstanceRef.current || !mapReady) {
            return;
        }

        const map = mapInstanceRef.current;
        markersRef.current.customers.forEach((marker) => map.removeLayer(marker));
        markersRef.current.odps.forEach((marker) => map.removeLayer(marker));
        markersRef.current.customers = [];
        markersRef.current.odps = [];

        if (filters.showOdps) {
            data.odps.forEach((odp) => {
                if (!odp.latitude || !odp.longitude) return;

                const marker = L.marker([parseFloat(odp.latitude), parseFloat(odp.longitude)], {
                    icon: L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div style="background-color:#2563eb;width:30px;height:30px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.3);">
                            <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2L2 7L12 12L22 7L12 2Z"></path><path d="M2 17L12 22L22 17"></path><path d="M2 12L12 17L22 12"></path></svg>
                        </div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 15],
                    }),
                }).addTo(map);

                marker.bindPopup(`
                    <div style="min-width:200px;">
                        <h3 style="font-weight:700;margin-bottom:8px;color:#2563eb;">${odp.nama}</h3>
                        <div style="font-size:12px;color:#4b5563;">
                            <p><strong>Rasio:</strong> ${odp.rasio_distribusi || '-'}</p>
                            <p><strong>Pelanggan:</strong> ${odp.customers_count || 0}</p>
                            <p style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
                                <strong>Koordinat:</strong><br/>
                                ${parseFloat(odp.latitude).toFixed(6)}, ${parseFloat(odp.longitude).toFixed(6)}
                            </p>
                        </div>
                    </div>
                `);

                markersRef.current.odps.push(marker);
            });
        }

        if (filters.showCustomers) {
            data.customers.forEach((customer) => {
                if (!customer.latitude || !customer.longitude) return;
                if (filters.showOnlineOnly && !customer.is_online) return;

                const isOnline = !!customer.is_online;
                const color = isOnline ? '#059669' : '#dc2626';

                const marker = L.marker([parseFloat(customer.latitude), parseFloat(customer.longitude)], {
                    icon: L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div style="background-color:${color};width:24px;height:24px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.3);">
                            <svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path></svg>
                        </div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12],
                    }),
                }).addTo(map);

                marker.bindPopup(`
                    <div style="min-width:220px;">
                        <h3 style="font-weight:700;margin-bottom:8px;color:${color};">${customer.name}</h3>
                        <div style="font-size:12px;color:#4b5563;">
                            <p><strong>PPPoE:</strong> ${customer.pppoe_username || '-'}</p>
                            <p><strong>Paket:</strong> ${customer.package_type || '-'}</p>
                            <p><strong>ODP:</strong> ${customer.odp || '-'}</p>
                            <p><strong>Alamat:</strong> ${customer.address || '-'}</p>
                            <p><strong>Status:</strong> ${isOnline ? 'Online' : 'Offline'}</p>
                        </div>
                    </div>
                `);

                markersRef.current.customers.push(marker);
            });
        }
    }, [data, filters, mapReady]);

    const handleRetryData = () => {
        fetchMapData();
    };

    const handleRetryMap = () => {
        setMapInitError(null);
        setMapResetKey((prev) => prev + 1);
    };

    const toggleFilter = (key) => {
        setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const customersWithCoords = useMemo(
        () => data.customers.filter((c) => c.latitude && c.longitude),
        [data.customers]
    );
    const onlineCustomers = useMemo(
        () => customersWithCoords.filter((c) => c.is_online),
        [customersWithCoords]
    );
    const odpsWithCoords = useMemo(
        () => data.odps.filter((o) => o.latitude && o.longitude),
        [data.odps]
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Monitoring Maps</h1>
                <p className="text-gray-600 mt-1">Pemetaan lokasi pelanggan dan ODP real-time.</p>
            </div>

            {mapInitError && (
                <Alert
                    type="error"
                    message={`${mapInitError} Klik "Re-init Peta" untuk mencoba ulang.`}
                    onClose={() => setMapInitError(null)}
                />
            )}
            {dataError && (
                <Alert
                    type="error"
                    message={dataError}
                    onClose={() => setDataError(null)}
                />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <p className="text-sm text-gray-500">Total ODP</p>
                    <p className="text-2xl font-bold text-blue-600">{odpsWithCoords.length}</p>
                    <Network className="w-10 h-10 text-blue-300 mt-2" />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <p className="text-sm text-gray-500">Total Pelanggan</p>
                    <p className="text-2xl font-bold text-slate-800">{customersWithCoords.length}</p>
                    <Users className="w-10 h-10 text-slate-300 mt-2" />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <p className="text-sm text-gray-500">Pelanggan Online</p>
                    <p className="text-2xl font-bold text-emerald-600">{onlineCustomers.length}</p>
                    <MapPin className="w-10 h-10 text-emerald-300 mt-2" />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-slate-50 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-800 mr-2">Filter:</h3>

                        <button
                            onClick={() => toggleFilter('showOdps')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                                filters.showOdps ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                        >
                            {filters.showOdps ? <Eye size={16} /> : <EyeOff size={16} />}
                            ODP ({odpsWithCoords.length})
                        </button>

                        <button
                            onClick={() => toggleFilter('showCustomers')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                                filters.showCustomers ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                        >
                            {filters.showCustomers ? <Eye size={16} /> : <EyeOff size={16} />}
                            Pelanggan ({customersWithCoords.length})
                        </button>

                        <button
                            onClick={() => toggleFilter('showOnlineOnly')}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                                filters.showOnlineOnly ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                        >
                            {filters.showOnlineOnly ? <Eye size={16} /> : <EyeOff size={16} />}
                            Online saja
                        </button>

                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <button
                                onClick={handleRetryData}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition flex items-center gap-2"
                            >
                                <RefreshCw size={14} />
                                Coba Lagi Data
                            </button>
                            <button
                                onClick={handleRetryMap}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-700 text-white hover:bg-slate-800 transition flex items-center gap-2"
                            >
                                <RefreshCw size={14} />
                                Re-init Peta
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-white border border-slate-200 text-slate-600">
                            Mode Tile:
                            <strong className={tileLayerMode === 'satellite' ? 'text-blue-700' : 'text-amber-700'}>
                                {tileLayerMode === 'satellite' ? 'Satelit (Esri)' : 'Fallback OSM'}
                            </strong>
                        </span>
                        {tileLayerMode !== 'satellite' && (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                                <AlertTriangle size={14} />
                                Sinyal tile satelit terganggu, sistem pindah otomatis ke OSM.
                            </span>
                        )}
                    </div>
                </div>

                <div className="relative h-[600px] w-full bg-slate-100">
                    <div
                        ref={mapRef}
                        className="absolute inset-0 z-0"
                        style={{ minHeight: '600px' }}
                    />

                    {loadingData && (
                        <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                            <div className="flex items-center gap-2 text-slate-700 font-medium">
                                <Loader className="w-5 h-5 animate-spin" />
                                Memuat data peta...
                            </div>
                        </div>
                    )}

                    {!mapReady && !mapInitError && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center text-slate-600">
                            <div className="text-center">
                                <Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
                                Menyiapkan mesin peta...
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MonitoringMaps;
