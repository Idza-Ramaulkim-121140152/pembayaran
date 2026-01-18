import { useState, useEffect, useRef } from 'react';
import { MapPin, Users, Network, Eye, EyeOff, Loader } from 'lucide-react';
import Alert from '../components/common/Alert';

function MonitoringMaps() {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef({ customers: [], odps: [] });
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    
    const [data, setData] = useState({
        customers: [],
        odps: []
    });
    
    const [filters, setFilters] = useState({
        showCustomers: true,
        showOdps: true,
        showOnlineOnly: false,
    });

    // Load Leaflet CSS and JS
    useEffect(() => {
        if (window.L) {
            setMapLoaded(true);
            return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = '';
        script.onload = () => setMapLoaded(true);
        document.head.appendChild(script);

        return () => {
            document.head.removeChild(link);
            document.head.removeChild(script);
        };
    }, []);

    // Fetch data
    useEffect(() => {
        fetchMapData();
    }, []);

    const fetchMapData = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/monitoring-maps');
            const result = await response.json();
            
            if (result.success) {
                setData(result.data);
            } else {
                setError(result.message || 'Gagal memuat data');
            }
        } catch (err) {
            setError('Terjadi kesalahan saat memuat data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Initialize map
    useEffect(() => {
        if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return;

        const L = window.L;
        const map = L.map(mapRef.current).setView([-5.6342425, 105.5631682], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [mapLoaded]);

    // Update markers based on data and filters
    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return;

        const L = window.L;
        const map = mapInstanceRef.current;

        // Clear existing markers
        markersRef.current.customers.forEach(marker => map.removeLayer(marker));
        markersRef.current.odps.forEach(marker => map.removeLayer(marker));
        markersRef.current.customers = [];
        markersRef.current.odps = [];

        // Add ODP markers
        if (filters.showOdps) {
            data.odps.forEach(odp => {
                if (odp.latitude && odp.longitude) {
                    const marker = L.marker([parseFloat(odp.latitude), parseFloat(odp.longitude)], {
                        icon: L.divIcon({
                            className: 'custom-div-icon',
                            html: `<div style="background-color: #3b82f6; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                                <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M12 2L2 7L12 12L22 7L12 2Z"></path><path d="M2 17L12 22L22 17"></path><path d="M2 12L12 17L22 12"></path></svg>
                            </div>`,
                            iconSize: [30, 30],
                            iconAnchor: [15, 15]
                        })
                    }).addTo(map);

                    marker.bindPopup(`
                        <div style="min-width: 200px;">
                            <h3 style="font-weight: bold; margin-bottom: 8px; color: #3b82f6;">📡 ${odp.nama}</h3>
                            <div style="font-size: 12px; color: #666;">
                                <p><strong>Rasio Distribusi:</strong> ${odp.rasio_distribusi}</p>
                                ${odp.rasio_spesial ? `<p><strong>Rasio Spesial:</strong> ${odp.rasio_spesial}</p>` : ''}
                                <p><strong>Pelanggan:</strong> ${odp.customers_count || 0} pelanggan</p>
                                <p style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                                    <strong>Koordinat:</strong><br/>
                                    ${parseFloat(odp.latitude).toFixed(6)}, ${parseFloat(odp.longitude).toFixed(6)}
                                </p>
                            </div>
                        </div>
                    `);

                    markersRef.current.odps.push(marker);
                }
            });
        }

        // Add Customer markers
        if (filters.showCustomers) {
            data.customers.forEach(customer => {
                if (customer.latitude && customer.longitude) {
                    // Filter online only if enabled
                    if (filters.showOnlineOnly && !customer.is_online) return;

                    const isOnline = customer.is_online;
                    const color = isOnline ? '#10b981' : '#ef4444';

                    const marker = L.marker([parseFloat(customer.latitude), parseFloat(customer.longitude)], {
                        icon: L.divIcon({
                            className: 'custom-div-icon',
                            html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                                <svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"></path></svg>
                            </div>`,
                            iconSize: [24, 24],
                            iconAnchor: [12, 12]
                        })
                    }).addTo(map);

                    marker.bindPopup(`
                        <div style="min-width: 220px;">
                            <h3 style="font-weight: bold; margin-bottom: 8px; color: ${color};">
                                ${isOnline ? '🟢' : '🔴'} ${customer.name}
                            </h3>
                            <div style="font-size: 12px; color: #666;">
                                <p><strong>Username PPPoE:</strong> ${customer.pppoe_username || '-'}</p>
                                <p><strong>Paket:</strong> ${customer.package_type || '-'}</p>
                                <p><strong>ODP:</strong> ${customer.odp || '-'}</p>
                                <p><strong>Alamat:</strong> ${customer.address || '-'}</p>
                                <p><strong>Telepon:</strong> ${customer.phone || '-'}</p>
                                ${customer.ip_address ? `<p><strong>IP Address:</strong> ${customer.ip_address}</p>` : ''}
                                <p style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
                                    <strong>Status:</strong> 
                                    <span style="color: ${color}; font-weight: bold;">
                                        ${isOnline ? 'Online' : 'Offline'}
                                    </span>
                                </p>
                                <p style="margin-top: 4px;">
                                    <strong>Koordinat:</strong><br/>
                                    ${parseFloat(customer.latitude).toFixed(6)}, ${parseFloat(customer.longitude).toFixed(6)}
                                </p>
                            </div>
                        </div>
                    `);

                    markersRef.current.customers.push(marker);
                }
            });
        }
    }, [data, filters, mapLoaded]);

    const toggleFilter = (filterKey) => {
        setFilters(prev => ({ ...prev, [filterKey]: !prev[filterKey] }));
    };

    const customersWithCoords = data.customers.filter(c => c.latitude && c.longitude);
    const onlineCustomers = customersWithCoords.filter(c => c.is_online);
    const odpsWithCoords = data.odps.filter(o => o.latitude && o.longitude);

    if (loading && !mapLoaded) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Memuat peta...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Monitoring Maps</h1>
                <p className="text-gray-600 mt-1">Pemetaan lokasi pelanggan dan ODP secara real-time</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Total ODP</p>
                            <p className="text-2xl font-bold text-blue-600">{odpsWithCoords.length}</p>
                            <p className="text-xs text-gray-500 mt-1">dengan koordinat</p>
                        </div>
                        <Network className="w-12 h-12 text-blue-600 opacity-20" />
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Total Pelanggan</p>
                            <p className="text-2xl font-bold text-gray-800">{customersWithCoords.length}</p>
                            <p className="text-xs text-gray-500 mt-1">dengan koordinat</p>
                        </div>
                        <Users className="w-12 h-12 text-gray-600 opacity-20" />
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Pelanggan Online</p>
                            <p className="text-2xl font-bold text-green-600">{onlineCustomers.length}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {customersWithCoords.length > 0 
                                    ? Math.round((onlineCustomers.length / customersWithCoords.length) * 100) 
                                    : 0}% dari total
                            </p>
                        </div>
                        <MapPin className="w-12 h-12 text-green-600 opacity-20" />
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {/* Map Controls */}
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-semibold text-gray-800">Filter Tampilan:</h3>
                        
                        <button
                            onClick={() => toggleFilter('showOdps')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                filters.showOdps 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                        >
                            {filters.showOdps ? <Eye size={16} /> : <EyeOff size={16} />}
                            ODP ({odpsWithCoords.length})
                        </button>

                        <button
                            onClick={() => toggleFilter('showCustomers')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                filters.showCustomers 
                                    ? 'bg-gray-800 text-white' 
                                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                        >
                            {filters.showCustomers ? <Eye size={16} /> : <EyeOff size={16} />}
                            Pelanggan ({customersWithCoords.length})
                        </button>

                        <button
                            onClick={() => toggleFilter('showOnlineOnly')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                filters.showOnlineOnly 
                                    ? 'bg-green-600 text-white' 
                                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                        >
                            {filters.showOnlineOnly ? <Eye size={16} /> : <EyeOff size={16} />}
                            Online Saja
                        </button>

                        <button
                            onClick={fetchMapData}
                            className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {/* Legend */}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow"></div>
                            <span className="text-gray-600">ODP</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-600 border-2 border-white shadow"></div>
                            <span className="text-gray-600">Pelanggan Online</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-600 border-2 border-white shadow"></div>
                            <span className="text-gray-600">Pelanggan Offline</span>
                        </div>
                    </div>
                </div>

                {/* Map */}
                <div 
                    ref={mapRef} 
                    style={{ height: '600px', width: '100%' }}
                    className="relative"
                >
                    {loading && (
                        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
                            <Loader className="w-8 h-8 text-blue-600 animate-spin" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MonitoringMaps;
