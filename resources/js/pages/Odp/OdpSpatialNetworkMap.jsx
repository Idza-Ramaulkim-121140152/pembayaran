import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
    MapPin,
    Navigation,
    Network,
    Users,
    Sparkles,
    CheckCircle2,
    AlertTriangle,
    Eye,
    Plus,
    X,
    Maximize2,
    RefreshCw,
    Filter,
    Layers,
    Info,
} from 'lucide-react';
import { attachSatelliteLayerWithFallback } from '../../utils/leafletTileFallback';

const LAMPUNG_DEFAULT = {
    lat: -5.632727646,
    lng: 105.548014641,
};

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function createOdpMarkerIcon(odp) {
    const count = odp.customers_count || 0;
    let badgeColor = '#059669'; // green <= 50%
    if (count >= 8) {
        badgeColor = '#dc2626'; // red full
    } else if (count >= 6) {
        badgeColor = '#ea580c'; // orange
    } else if (count >= 4) {
        badgeColor = '#2563eb'; // blue
    }

    return L.divIcon({
        className: '',
        html: `
            <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
                <div style="background:#0f172a;color:#f8fafc;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.5);border:1px solid #38bdf8;display:flex;align-items:center;gap:4px;letter-spacing:0.2px;">
                    <span style="color:#38bdf8;">⚡</span>
                    <span>${odp.nama || 'ODP'}</span>
                    <span style="background:${badgeColor};color:#ffffff;padding:0 4px;border-radius:4px;font-size:9px;font-weight:800;">${count}p</span>
                </div>
                <div style="width:16px;height:16px;border-radius:9999px;background:#0284c7;border:2.5px solid #ffffff;box-shadow:0 2px 5px rgba(0,0,0,0.4);margin-top:2px;"></div>
            </div>
        `,
        iconSize: [110, 42],
        iconAnchor: [55, 36],
    });
}

function createCustomerMarkerIcon(customer, isUnassigned, isSpatialAnomaly = false) {
    let color = isUnassigned ? '#f59e0b' : (isSpatialAnomaly ? '#ea580c' : '#10b981');
    let pulseHtml = '';

    if (isUnassigned) {
        pulseHtml = '<div style="position:absolute;width:24px;height:24px;border-radius:9999px;background:#f59e0b;opacity:0.4;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>';
    } else if (isSpatialAnomaly) {
        pulseHtml = '<div style="position:absolute;width:26px;height:26px;border-radius:9999px;background:#ea580c;opacity:0.5;animation:ping 1.2s cubic-bezier(0,0,0.2,1) infinite;"></div>';
    }

    return L.divIcon({
        className: '',
        html: `
            <div style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                ${pulseHtml}
                <div style="width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.35);z-index:2;"></div>
            </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

export default function OdpSpatialNetworkMap({
    odps = [],
    customers = [],
    onAssignCustomer,
    onUnassignCustomer,
    onCreateOdp,
    kecamatanOptions = [],
    desaOptions = [],
    dusunOptions = [],
    onRefresh,
    height = '580px',
}) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const layersRef = useRef({
        odpMarkers: [],
        odpCircles: [],
        customerMarkers: [],
        topologyLines: [],
        tempMarker: null,
    });
    const resizeObserverRef = useRef(null);
    const tileFallbackRef = useRef(null);

    // Map Layers Toggle State
    const [showCircles, setShowCircles] = useState(true);
    const [showLines, setShowLines] = useState(true);
    const [showAssigned, setShowAssigned] = useState(true);
    const [showUnassigned, setShowUnassigned] = useState(true);
    const [selectedOdpZoom, setSelectedOdpZoom] = useState('');
    const [coverageRadius, setCoverageRadius] = useState(150); // meters

    // Quick Add ODP from Map Click State
    const [newOdpClick, setNewOdpClick] = useState(null);
    const [newOdpSubmitting, setNewOdpSubmitting] = useState(false);
    const [newOdpRatio, setNewOdpRatio] = useState('1:8');
    const [newOdpAlamat, setNewOdpAlamat] = useState('');

    // Assigning state
    const [actionLoadingId, setActionLoadingId] = useState(null);

    // Filter customers with valid coordinates (exclude 0,0 Null Island)
    const customersWithCoords = useMemo(() => {
        return customers.filter((c) => {
            const lat = parseFloat(c.latitude);
            const lng = parseFloat(c.longitude);
            return Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001);
        });
    }, [customers]);

    const unassignedCustomers = useMemo(() => {
        return customersWithCoords.filter((c) => !c.odp_id);
    }, [customersWithCoords]);

    const assignedCustomers = useMemo(() => {
        return customersWithCoords.filter((c) => Boolean(c.odp_id));
    }, [customersWithCoords]);

    const odpsWithCoords = useMemo(() => {
        return odps.filter((o) => {
            const lat = parseFloat(o.latitude);
            const lng = parseFloat(o.longitude);
            return Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001);
        });
    }, [odps]);

    // Calculate customers assigned to distant ODPs when a closer ODP exists <= 150m (Spatial Mismatch)
    const spatialAnomalies = useMemo(() => {
        const odpMap = new Map(odpsWithCoords.map((o) => [Number(o.id), o]));
        return assignedCustomers.filter((cust) => {
            const lat = parseFloat(cust.latitude);
            const lng = parseFloat(cust.longitude);
            const currentOdp = odpMap.get(Number(cust.odp_id));
            let currentDist = null;
            if (currentOdp && Number.isFinite(parseFloat(currentOdp.latitude)) && Number.isFinite(parseFloat(currentOdp.longitude))) {
                currentDist = calculateDistanceMeters(lat, lng, parseFloat(currentOdp.latitude), parseFloat(currentOdp.longitude));
            }
            let minDist = Infinity;
            odpsWithCoords.forEach((o) => {
                if (Number(o.id) !== Number(cust.odp_id)) {
                    const d = calculateDistanceMeters(lat, lng, parseFloat(o.latitude), parseFloat(o.longitude));
                    if (d < minDist) minDist = d;
                }
            });
            return minDist <= 150 && (currentDist === null || currentDist > 180 || (currentDist - minDist) >= 60);
        });
    }, [assignedCustomers, odpsWithCoords]);

    // Initialize Leaflet Map
    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return;

        // Default center on first valid ODP or LAMPUNG_DEFAULT
        let center = [LAMPUNG_DEFAULT.lat, LAMPUNG_DEFAULT.lng];
        if (odpsWithCoords.length > 0) {
            center = [parseFloat(odpsWithCoords[0].latitude), parseFloat(odpsWithCoords[0].longitude)];
        }

        const map = L.map(mapRef.current, {
            center,
            zoom: 15,
            scrollWheelZoom: true,
            dragging: true,
            zoomControl: true,
        });

        tileFallbackRef.current = attachSatelliteLayerWithFallback(L, map);

        // Click on map to add new ODP
        map.on('click', (event) => {
            const lat = Number(event.latlng.lat.toFixed(8));
            const lng = Number(event.latlng.lng.toFixed(8));

            // Find nearest ODP
            let nearest = null;
            let minDist = Infinity;
            odpsWithCoords.forEach((odp) => {
                const dist = calculateDistanceMeters(lat, lng, parseFloat(odp.latitude), parseFloat(odp.longitude));
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { ...odp, distanceMeters: Math.round(dist) };
                }
            });

            setNewOdpClick({
                latitude: lat,
                longitude: lng,
                nearestOdp: nearest,
            });
            setNewOdpAlamat(nearest ? `Sekitar ${nearest.nama}` : `Koordinat (${lat}, ${lng})`);
        });

        mapInstanceRef.current = map;

        if (window.ResizeObserver && mapRef.current) {
            resizeObserverRef.current = new ResizeObserver(() => {
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.invalidateSize();
                }
            });
            resizeObserverRef.current.observe(mapRef.current);
        }

        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
            if (tileFallbackRef.current) {
                tileFallbackRef.current.cleanup();
            }
            map.remove();
            mapInstanceRef.current = null;
        };
    }, []);

    // Render Markers, Circles, Lines
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        const map = mapInstanceRef.current;

        // 1. Clear previous layers
        layersRef.current.odpMarkers.forEach((m) => map.removeLayer(m));
        layersRef.current.odpCircles.forEach((c) => map.removeLayer(c));
        layersRef.current.customerMarkers.forEach((m) => map.removeLayer(m));
        layersRef.current.topologyLines.forEach((l) => map.removeLayer(l));

        layersRef.current.odpMarkers = [];
        layersRef.current.odpCircles = [];
        layersRef.current.customerMarkers = [];
        layersRef.current.topologyLines = [];

        // 2. Render ODPs & Circles
        odpsWithCoords.forEach((odp) => {
            const lat = parseFloat(odp.latitude);
            const lng = parseFloat(odp.longitude);

            // Coverage Radius Circle
            if (showCircles) {
                const circle = L.circle([lat, lng], {
                    radius: coverageRadius,
                    color: '#0284c7',
                    fillColor: '#38bdf8',
                    fillOpacity: 0.12,
                    weight: 1.2,
                    dashArray: '3, 4',
                }).addTo(map);
                layersRef.current.odpCircles.push(circle);
            }

            // ODP Pin
            const marker = L.marker([lat, lng], {
                icon: createOdpMarkerIcon(odp),
            }).addTo(map);

            marker.bindPopup(`
                <div style="font-family:sans-serif;font-size:12px;padding:3px;min-width:200px;">
                    <div style="font-weight:800;color:#0284c7;font-size:14px;margin-bottom:4px;display:flex;align-items:center;justify-content:between;">
                        <span>${odp.nama}</span>
                    </div>
                    <div style="color:#475569;line-height:1.5;">
                        <div><strong>Rasio:</strong> ${odp.rasio_distribusi || '-'}${odp.rasio_spesial ? ` (${odp.rasio_spesial})` : ''}</div>
                        <div><strong>Pelanggan Terhubung:</strong> ${odp.customers_count || 0} user</div>
                        ${odp.alamat_detail ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">📍 ${odp.alamat_detail}</div>` : ''}
                        <div style="font-size:10px;color:#94a3b8;margin-top:4px;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
                    </div>
                </div>
            `);

            layersRef.current.odpMarkers.push(marker);
        });

        // Map ODP lookup by id for quick polyline lookup
        const odpById = new Map(odpsWithCoords.map((o) => [Number(o.id), o]));

        // 3. Render Unassigned Customers (🟠)
        if (showUnassigned) {
            unassignedCustomers.forEach((cust) => {
                const lat = parseFloat(cust.latitude);
                const lng = parseFloat(cust.longitude);

                // Find nearest ODP for recommendation
                let nearest = null;
                let minDist = Infinity;
                odpsWithCoords.forEach((odp) => {
                    const dist = calculateDistanceMeters(lat, lng, parseFloat(odp.latitude), parseFloat(odp.longitude));
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = { ...odp, distanceMeters: Math.round(dist) };
                    }
                });

                const marker = L.marker([lat, lng], {
                    icon: createCustomerMarkerIcon(cust, true),
                }).addTo(map);

                const popupDiv = document.createElement('div');
                popupDiv.style.fontFamily = 'sans-serif';
                popupDiv.style.fontSize = '12px';
                popupDiv.style.padding = '4px';
                popupDiv.style.minWidth = '220px';

                popupDiv.innerHTML = `
                    <div style="margin-bottom:6px;">
                        <span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;">Belum Terpetakan</span>
                        <div style="font-weight:800;color:#0f172a;font-size:13px;margin-top:3px;">${cust.name}</div>
                        <div style="font-size:11px;color:#64748b;">${cust.pppoe_username ? `PPPoE: ${cust.pppoe_username}` : cust.phone || '-'}</div>
                        ${cust.address ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">📍 ${cust.address}</div>` : ''}
                    </div>
                    ${
                        nearest
                            ? `
                        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:6px;margin-bottom:8px;">
                            <div style="font-size:10px;color:#166534;font-weight:700;">Rekomendasi ODP Terdekat:</div>
                            <div style="font-size:12px;font-weight:800;color:#15803d;display:flex;justify-content:space-between;margin-top:2px;">
                                <span>${nearest.nama}</span>
                                <span>${nearest.distanceMeters} meter</span>
                            </div>
                        </div>
                    `
                            : ''
                    }
                `;

                if (nearest && typeof onAssignCustomer === 'function') {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.innerText = `⚡ Petakan Langsung ke ${nearest.nama}`;
                    btn.style.width = '100%';
                    btn.style.padding = '6px 10px';
                    btn.style.backgroundColor = '#4f46e5';
                    btn.style.color = '#ffffff';
                    btn.style.fontWeight = '700';
                    btn.style.fontSize = '11px';
                    btn.style.borderRadius = '6px';
                    btn.style.border = 'none';
                    btn.style.cursor = 'pointer';

                    btn.onclick = async () => {
                        setActionLoadingId(cust.id);
                        try {
                            await onAssignCustomer(cust.id, nearest.id);
                            map.closePopup();
                        } finally {
                            setActionLoadingId(null);
                        }
                    };
                    popupDiv.appendChild(btn);
                }

                marker.bindPopup(popupDiv);
                layersRef.current.customerMarkers.push(marker);
            });
        }

        // 4. Render Assigned Customers (🟢 / 🔴 Anomaly) & Topology Lines
        if (showAssigned) {
            assignedCustomers.forEach((cust) => {
                const lat = parseFloat(cust.latitude);
                const lng = parseFloat(cust.longitude);
                const odp = odpById.get(Number(cust.odp_id));

                let distToAssigned = null;
                if (odp && Number.isFinite(parseFloat(odp.latitude)) && Number.isFinite(parseFloat(odp.longitude))) {
                    distToAssigned = calculateDistanceMeters(lat, lng, parseFloat(odp.latitude), parseFloat(odp.longitude));
                }

                // Find nearest ODP among all ODPs
                let nearest = null;
                let minDist = Infinity;
                odpsWithCoords.forEach((o) => {
                    const dist = calculateDistanceMeters(lat, lng, parseFloat(o.latitude), parseFloat(o.longitude));
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = { ...o, distanceMeters: Math.round(dist) };
                    }
                });

                const isSpatialAnomaly = nearest && nearest.distanceMeters <= 150 && (
                    distToAssigned === null ||
                    distToAssigned > 180 ||
                    (distToAssigned - nearest.distanceMeters) >= 60
                ) && (Number(nearest.id) !== Number(cust.odp_id));

                const marker = L.marker([lat, lng], {
                    icon: createCustomerMarkerIcon(cust, false, isSpatialAnomaly),
                }).addTo(map);

                const popupDiv = document.createElement('div');
                popupDiv.style.fontFamily = 'sans-serif';
                popupDiv.style.fontSize = '12px';
                popupDiv.style.padding = '4px';
                popupDiv.style.minWidth = '230px';

                popupDiv.innerHTML = `
                    <div style="margin-bottom:6px;">
                        <span style="background:${isSpatialAnomaly ? '#fee2e2' : '#dcfce7'};color:${isSpatialAnomaly ? '#991b1b' : '#166534'};font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;">
                            ${isSpatialAnomaly ? '⚠️ Jarak Tidak Sesuai (Jauh)' : 'Terhubung'}
                        </span>
                        <div style="font-weight:800;color:#0f172a;font-size:13px;margin-top:3px;">${cust.name}</div>
                        <div style="font-size:11px;color:#64748b;">${cust.pppoe_username ? `PPPoE: ${cust.pppoe_username}` : cust.phone || '-'}</div>
                        <div style="margin-top:6px;font-size:11px;color:#475569;">
                            <strong>ODP Saat Ini:</strong> ${cust.odp_master_name || odp?.nama || cust.odp || '-'}
                            ${distToAssigned !== null ? `<span style="font-weight:700;color:${distToAssigned > 150 ? '#dc2626' : '#059669'};"> (${Math.round(distToAssigned)}m)</span>` : ' (Tanpa GPS)'}
                        </div>
                    </div>
                    ${
                        isSpatialAnomaly && nearest
                            ? `
                        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px;margin-bottom:8px;">
                            <div style="font-size:10px;color:#92400e;font-weight:700;">Rekomendasi ODP Terdekat (Jarak ~0m):</div>
                            <div style="font-size:12px;font-weight:800;color:#b45309;display:flex;justify-content:space-between;margin-top:2px;">
                                <span>${nearest.nama}</span>
                                <span>${nearest.distanceMeters} meter</span>
                            </div>
                            ${distToAssigned !== null ? `<div style="font-size:10px;color:#059669;margin-top:2px;">✨ Lebih dekat ${Math.max(0, Math.round(distToAssigned - nearest.distanceMeters))}m dropcore</div>` : ''}
                        </div>
                    `
                            : ''
                    }
                `;

                if (nearest && Number(nearest.id) !== Number(cust.odp_id) && typeof onAssignCustomer === 'function') {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.innerText = `⚡ Pindahkan ke ${nearest.nama} (${nearest.distanceMeters}m)`;
                    btn.style.width = '100%';
                    btn.style.padding = '6px 10px';
                    btn.style.backgroundColor = isSpatialAnomaly ? '#ea580c' : '#4f46e5';
                    btn.style.color = '#ffffff';
                    btn.style.fontWeight = '700';
                    btn.style.fontSize = '11px';
                    btn.style.borderRadius = '6px';
                    btn.style.border = 'none';
                    btn.style.cursor = 'pointer';

                    btn.onclick = async () => {
                        setActionLoadingId(cust.id);
                        try {
                            await onAssignCustomer(cust.id, nearest.id, true);
                            map.closePopup();
                        } finally {
                            setActionLoadingId(null);
                        }
                    };
                    popupDiv.appendChild(btn);
                }

                marker.bindPopup(popupDiv);
                layersRef.current.customerMarkers.push(marker);

                // Polyline connecting customer to their assigned ODP
                if (showLines && odp) {
                    const odpLat = parseFloat(odp.latitude);
                    const odpLng = parseFloat(odp.longitude);
                    if (Number.isFinite(odpLat) && Number.isFinite(odpLng)) {
                        const line = L.polyline(
                            [
                                [lat, lng],
                                [odpLat, odpLng],
                            ],
                            {
                                color: isSpatialAnomaly ? '#ef4444' : '#10b981',
                                weight: isSpatialAnomaly ? 2 : 1.5,
                                opacity: 0.7,
                                dashArray: isSpatialAnomaly ? '3, 6' : '4, 4',
                            }
                        ).addTo(map);
                        layersRef.current.topologyLines.push(line);
                    }
                }
            });
        }
    }, [
        odpsWithCoords,
        unassignedCustomers,
        assignedCustomers,
        showCircles,
        showLines,
        showAssigned,
        showUnassigned,
        coverageRadius,
    ]);

    // Handle Quick Add Submit from Map Click
    const handleSaveNewOdpFromMap = async () => {
        if (!newOdpClick || !onCreateOdp) return;
        setNewOdpSubmitting(true);

        try {
            const nearest = newOdpClick.nearestOdp;
            const payload = {
                latitude: newOdpClick.latitude,
                longitude: newOdpClick.longitude,
                rasio_distribusi: newOdpRatio || '1:8',
                alamat_detail: newOdpAlamat || (nearest ? `Sekitar ${nearest.nama}` : `Koordinat ${newOdpClick.latitude}, ${newOdpClick.longitude}`),
                kecamatan_id: nearest?.kecamatan_id || '',
                desa_id: nearest?.desa_id || '',
                dusun_id: nearest?.dusun_id || '',
            };

            await onCreateOdp(payload);
            setNewOdpClick(null);
        } catch (err) {
            console.error('Error saving ODP from map click:', err);
        } finally {
            setNewOdpSubmitting(false);
        }
    };

    // Zoom to specific ODP
    const handleZoomToOdp = (odpId) => {
        setSelectedOdpZoom(odpId);
        if (!odpId || !mapInstanceRef.current) return;
        const target = odpsWithCoords.find((o) => String(o.id) === String(odpId));
        if (target) {
            mapInstanceRef.current.flyTo([parseFloat(target.latitude), parseFloat(target.longitude)], 18, {
                animate: true,
                duration: 1.2,
            });
        }
    };

    // Fit bounds to all network points
    const handleFitBoundsAll = () => {
        if (!mapInstanceRef.current) return;
        const allPoints = [];
        odpsWithCoords.forEach((o) => allPoints.push([parseFloat(o.latitude), parseFloat(o.longitude)]));
        customersWithCoords.forEach((c) => allPoints.push([parseFloat(c.latitude), parseFloat(c.longitude)]));

        if (allPoints.length > 0) {
            mapInstanceRef.current.fitBounds(allPoints, { padding: [40, 40] });
        }
    };

    return (
        <div className="relative rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {/* Top Interactive Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-900 text-white border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
                        <Network size={16} />
                        <span>Peta Spasial Jaringan ODP</span>
                    </div>

                    {/* Quick jump to ODP */}
                    <select
                        value={selectedOdpZoom}
                        onChange={(e) => handleZoomToOdp(e.target.value)}
                        className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500 focus:outline-none"
                    >
                        <option value="">🔍 Lompat ke ODP...</option>
                        {odpsWithCoords.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.nama} ({o.customers_count || 0} user)
                            </option>
                        ))}
                    </select>
                </div>

                {/* Layer Toggles */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 transition">
                        <input
                            type="checkbox"
                            checked={showCircles}
                            onChange={(e) => setShowCircles(e.target.checked)}
                            className="rounded text-cyan-600 focus:ring-0"
                        />
                        <span className="text-cyan-300">Radius 150m</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 transition">
                        <input
                            type="checkbox"
                            checked={showUnassigned}
                            onChange={(e) => setShowUnassigned(e.target.checked)}
                            className="rounded text-amber-500 focus:ring-0"
                        />
                        <span className="text-amber-300">🟠 Unassigned ({unassignedCustomers.length})</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 transition">
                        <input
                            type="checkbox"
                            checked={showAssigned}
                            onChange={(e) => setShowAssigned(e.target.checked)}
                            className="rounded text-emerald-500 focus:ring-0"
                        />
                        <span className="text-emerald-300">🟢 Terhubung ({assignedCustomers.length})</span>
                    </label>

                    {spatialAnomalies.length > 0 && (
                        <div className="flex items-center gap-1.5 bg-amber-950/80 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-700/60 font-semibold animate-pulse" title="Pelanggan terhubung ke ODP jauh padahal ada ODP di dekatnya">
                            <span>⚠️ Salah ODP ({spatialAnomalies.length})</span>
                        </div>
                    )}

                    <label className="flex items-center gap-1.5 cursor-pointer bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 transition">
                        <input
                            type="checkbox"
                            checked={showLines}
                            onChange={(e) => setShowLines(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-0"
                        />
                        <span className="text-slate-300">Topologi</span>
                    </label>

                    <button
                        type="button"
                        onClick={handleFitBoundsAll}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:text-white transition flex items-center gap-1"
                        title="Lihat Semua Jaringan"
                    >
                        <Maximize2 size={13} />
                        <span>Fit Bounds</span>
                    </button>
                </div>
            </div>

            {/* Map Canvas */}
            <div
                ref={mapRef}
                style={{ height, width: '100%', position: 'relative', zIndex: 0 }}
                className="bg-slate-950"
            />

            {/* Floating Quick Helper Bar at bottom of map */}
            <div className="absolute bottom-3 left-3 z-[400] flex flex-wrap items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-white text-xs shadow-xl pointer-events-auto">
                <span className="text-cyan-400 font-bold">💡 Tips:</span>
                <span>Klik pin 🟠 untuk memetakan pelanggan 1-klik</span>
                <span className="text-slate-500">|</span>
                <span>Klik area kosong di peta untuk <strong>+ Pasang ODP Baru</strong></span>
            </div>

            {/* Floating Drawer: Quick Create ODP on Click */}
            {newOdpClick && (
                <div className="absolute top-14 right-3 z-[500] w-80 max-w-[90vw] bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-2xl shadow-2xl p-4 text-white animate-in fade-in slide-in-from-right duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <h4 className="font-bold text-sm text-cyan-300 flex items-center gap-1.5">
                            <Plus size={16} />
                            <span>Pasang ODP Baru di Titik Ini</span>
                        </h4>
                        <button
                            type="button"
                            onClick={() => setNewOdpClick(null)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
                        >
                            <X size={15} />
                        </button>
                    </div>

                    <div className="mt-3 space-y-2.5 text-xs">
                        <div className="bg-slate-950/70 p-2 rounded-lg border border-white/5 space-y-1">
                            <div className="text-slate-400">Koordinat:</div>
                            <div className="font-mono text-cyan-200 font-semibold">
                                {newOdpClick.latitude}, {newOdpClick.longitude}
                            </div>
                        </div>

                        {newOdpClick.nearestOdp ? (
                            <div className="bg-indigo-950/50 p-2 rounded-lg border border-indigo-500/30">
                                <div className="text-indigo-300 font-medium">ODP Terdekat:</div>
                                <div className="font-bold text-white text-sm">
                                    {newOdpClick.nearestOdp.nama}
                                    <span className="ml-1.5 text-xs text-indigo-300 font-normal">
                                        ({newOdpClick.nearestOdp.distanceMeters} meter)
                                    </span>
                                </div>
                                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                                    <CheckCircle2 size={12} />
                                    <span>Wilayah otomatis disamakan dengan ODP ini</span>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-blue-950/40 p-2 rounded-lg border border-blue-500/20 text-blue-300">
                                Titik pertama / area ekspansi baru.
                            </div>
                        )}

                        <div>
                            <label className="block text-slate-300 font-medium mb-1">Rasio Splitter</label>
                            <select
                                value={newOdpRatio}
                                onChange={(e) => setNewOdpRatio(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 text-white border border-slate-700"
                            >
                                <option value="1:2">1:2 (2 Port)</option>
                                <option value="1:4">1:4 (4 Port)</option>
                                <option value="1:8">1:8 (8 Port - Standar)</option>
                                <option value="1:16">1:16 (16 Port)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-slate-300 font-medium mb-1">Alamat / Patokan Tiang</label>
                            <input
                                type="text"
                                value={newOdpAlamat}
                                onChange={(e) => setNewOdpAlamat(e.target.value)}
                                placeholder="Contoh: Depan warung / tiang PLN nomor 4"
                                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 text-white border border-slate-700 placeholder-slate-500"
                            />
                        </div>

                        <div className="pt-2 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setNewOdpClick(null)}
                                className="flex-1 py-1.5 px-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveNewOdpFromMap}
                                disabled={newOdpSubmitting}
                                className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold shadow-md transition disabled:opacity-50"
                            >
                                {newOdpSubmitting ? 'Memproses...' : '🚀 Simpan ODP'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
