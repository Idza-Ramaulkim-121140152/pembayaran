import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, Navigation } from 'lucide-react';

const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistance = (meters) => {
    if (meters == null || Number.isNaN(meters)) return null;
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
};

const escapeHtml = (str) =>
    String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const createWifiPinIcon = (isNearest) =>
    L.divIcon({
        className: 'hotspot-wifi-pin',
        html: `<div style="width:32px;height:32px;border-radius:50%;background:${
            isNearest ? '#f97316' : '#2563eb'
        };border:3px solid #ffffff;box-shadow:0 4px 12px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;">W</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
    });

export default function HotspotLocationsMapSection() {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userCoords, setUserCoords] = useState(null);
    const [locating, setLocating] = useState(false);
    const [geoError, setGeoError] = useState('');
    const [focusedId, setFocusedId] = useState(null);

    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersLayerRef = useRef(null);

    useEffect(() => {
        let active = true;
        fetch('/api/hotspot/locations', { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((data) => {
                if (!active) return;
                setLocations(Array.isArray(data.locations) ? data.locations : []);
            })
            .catch(() => {
                if (active) setLocations([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    const detectLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setGeoError('Browser tidak mendukung deteksi lokasi GPS.');
            return;
        }
        setLocating(true);
        setGeoError('');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserCoords({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                });
                setFocusedId(null);
                setLocating(false);
            },
            () => {
                setGeoError('Izin lokasi tidak aktif. Aktifkan GPS untuk melihat titik WiFi terdekat.');
                setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    }, []);

    useEffect(() => {
        if (locations.length > 0 && !userCoords) {
            detectLocation();
        }
    }, [locations.length, userCoords, detectLocation]);

    const sortedLocations = useMemo(() => {
        const enriched = locations.map((loc) => ({
            ...loc,
            distanceMeters: userCoords
                ? haversineMeters(userCoords.latitude, userCoords.longitude, loc.latitude, loc.longitude)
                : null,
        }));
        if (userCoords) {
            enriched.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
        }
        return enriched;
    }, [locations, userCoords]);

    const nearest = sortedLocations[0] || null;
    const activeTarget = useMemo(() => {
        if (focusedId) {
            return sortedLocations.find((l) => l.id === focusedId) || nearest;
        }
        return nearest;
    }, [focusedId, sortedLocations, nearest]);

    // Initialize & update native Leaflet map
    useEffect(() => {
        if (!mapContainerRef.current || !activeTarget) return;

        if (!mapInstanceRef.current) {
            const map = L.map(mapContainerRef.current, {
                center: [activeTarget.latitude, activeTarget.longitude],
                zoom: 16,
                scrollWheelZoom: false,
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 19,
            }).addTo(map);

            markersLayerRef.current = L.layerGroup().addTo(map);
            mapInstanceRef.current = map;
        } else {
            mapInstanceRef.current.setView([activeTarget.latitude, activeTarget.longitude], 16, {
                animate: true,
            });
        }

        const layer = markersLayerRef.current;
        if (layer) {
            layer.clearLayers();

            if (userCoords) {
                L.circleMarker([userCoords.latitude, userCoords.longitude], {
                    radius: 8,
                    color: '#ffffff',
                    weight: 3,
                    fillColor: '#0ea5e9',
                    fillOpacity: 1,
                })
                    .bindPopup('<div style="font-size:12px;font-weight:700;color:#0369a1;">Lokasi Anda Saat Ini</div>')
                    .addTo(layer);
            }

            sortedLocations.forEach((loc, idx) => {
                const distHtml =
                    loc.distanceMeters != null
                        ? `<div style="color:#047857;font-weight:600;margin-top:2px;">Jarak: ${formatDistance(
                              loc.distanceMeters
                          )}</div>`
                        : '';
                const popupHtml = `
                    <div style="font-size:12px;line-height:1.4;">
                        <div style="font-weight:700;color:#0f172a;">${escapeHtml(loc.label)}</div>
                        ${distHtml}
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}"
                           target="_blank" rel="noreferrer"
                           style="display:inline-block;margin-top:4px;color:#2563eb;font-weight:600;text-decoration:underline;">
                           Buka Rute Google Maps
                        </a>
                    </div>
                `;
                L.marker([loc.latitude, loc.longitude], { icon: createWifiPinIcon(idx === 0) })
                    .bindPopup(popupHtml)
                    .addTo(layer);
            });
        }
    }, [activeTarget, sortedLocations, userCoords]);

    useEffect(() => {
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                markersLayerRef.current = null;
            }
        };
    }, []);

    if (loading || locations.length === 0) {
        return null;
    }

    return (
        <div className="mt-5 bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <div>
                    <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-orange-500" />
                        Titik WiFi Voucher Tersedia ({locations.length})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {userCoords
                            ? 'Diurutkan dari titik WiFi terdekat dengan lokasi Anda saat ini.'
                            : 'Daftar lokasi titik akses WiFi Hotspot Rumah Kita Net.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={detectLocation}
                    disabled={locating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition disabled:opacity-50"
                >
                    <LocateFixed className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
                    {locating ? 'Mencari...' : 'Cari Terdekat'}
                </button>
            </div>

            {geoError && (
                <div className="px-5 py-2 bg-amber-50 text-amber-800 text-[11px] border-b border-amber-100">
                    {geoError}
                </div>
            )}

            {/* Nearest Point Highlight */}
            {nearest && (
                <div className="px-5 py-3.5 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-extrabold uppercase">
                                {userCoords ? 'Terdekat' : 'Titik #1'}
                            </span>
                            {nearest.distanceMeters != null && (
                                <span className="text-xs font-extrabold text-orange-700">
                                    &bull; {formatDistance(nearest.distanceMeters)}
                                </span>
                            )}
                        </div>
                        <p className="text-sm font-bold text-slate-900 truncate mt-1">{nearest.label}</p>
                    </div>
                    <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${nearest.latitude},${nearest.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-sm transition"
                    >
                        <Navigation className="w-3.5 h-3.5" />
                        Rute
                    </a>
                </div>
            )}

            {/* Interactive Leaflet Map centered on nearest point */}
            <div ref={mapContainerRef} className="h-60 w-full relative z-0" />

            {/* Compact List of Available Points (Privacy-safe, no customer names) */}
            {sortedLocations.length > 1 && (
                <div className="p-3 max-h-44 overflow-y-auto divide-y divide-slate-100">
                    {sortedLocations.map((loc, idx) => {
                        const isFocused = activeTarget?.id === loc.id;
                        return (
                            <div
                                key={loc.id}
                                className={`py-2 px-2.5 rounded-xl flex items-center justify-between gap-2 transition ${
                                    isFocused ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setFocusedId(loc.id)}
                                    className="text-left min-w-0 flex-1"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span
                                            className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                                                idx === 0
                                                    ? 'bg-orange-500 text-white'
                                                    : 'bg-blue-100 text-blue-700'
                                            }`}
                                        >
                                            {idx + 1}
                                        </span>
                                        <span className="text-xs font-bold text-slate-800 truncate">
                                            {loc.label}
                                        </span>
                                    </div>
                                    {loc.distanceMeters != null && (
                                        <p className="text-[11px] text-slate-500 pl-6">
                                            Jarak sekitar {formatDistance(loc.distanceMeters)}
                                        </p>
                                    )}
                                </button>
                                <a
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold shrink-0"
                                >
                                    Maps
                                </a>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
