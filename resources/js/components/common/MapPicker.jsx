import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, Network, Sparkles, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { attachSatelliteLayerWithFallback } from '../../utils/leafletTileFallback';

const LAMPUNG_DEFAULT = {
    lat: -5.632727646,
    lng: 105.548014641,
};

function toValidCoordinatePair(latitude, longitude) {
    if (
        latitude === null ||
        latitude === undefined ||
        latitude === '' ||
        longitude === null ||
        longitude === undefined ||
        longitude === ''
    ) {
        return null;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)
    ) {
        return { lat, lng };
    }

    return null;
}

function getDefaultCenter(existingOdps) {
    if (Array.isArray(existingOdps)) {
        for (const odp of existingOdps) {
            const valid = toValidCoordinatePair(odp.latitude, odp.longitude);
            if (valid) return valid;
        }
    }
    return LAMPUNG_DEFAULT;
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in metres
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

function createPickerIcon() {
    return L.divIcon({
        className: '',
        html: `
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
                <div style="background:#06b6d4;color:#ffffff;font-size:11px;font-weight:800;padding:2px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.45);border:2px solid #ffffff;letter-spacing:0.3px;">
                    📍 Titik ODP Baru
                </div>
                <div style="width:20px;height:20px;border-radius:9999px;background:#0891b2;border:3px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.5);margin-top:2px;"></div>
            </div>
        `,
        iconSize: [120, 48],
        iconAnchor: [60, 42],
    });
}

function createExistingOdpIcon(odp) {
    const custCount = odp.customers_count || 0;
    return L.divIcon({
        className: '',
        html: `
            <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
                <div style="background:#1e1b4b;color:#a5b4fc;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,0.4);border:1px solid #6366f1;display:flex;align-items:center;gap:3px;margin-bottom:2px;">
                    <span>${odp.nama || 'ODP'}</span>
                    <span style="background:#4338ca;color:#ffffff;padding:0 4px;border-radius:4px;font-size:9px;">${custCount}p</span>
                </div>
                <div style="width:14px;height:14px;border-radius:9999px;background:#4f46e5;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>
            </div>
        `,
        iconSize: [100, 36],
        iconAnchor: [50, 30],
    });
}

function MapPicker({
    latitude,
    longitude,
    onLocationChange,
    height = '400px',
    isOpen = true,
    showCoordinateInputs = true,
    label = 'Lokasi ODP',
    existingOdps = [],
    onAdoptNearestWilayah = null,
    showCoverageRadius = true,
    coverageRadiusMeters = 150,
}) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);
    const existingLayersRef = useRef([]);
    const resizeObserverRef = useRef(null);
    const tileFallbackRef = useRef(null);
    const onLocationChangeRef = useRef(onLocationChange);
    const isInternalUpdateRef = useRef(false);
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [usingFallbackTiles, setUsingFallbackTiles] = useState(false);
    const [isMapReady, setIsMapReady] = useState(false);

    const defaultCenter = useMemo(() => getDefaultCenter(existingOdps), [existingOdps]);
    const validCoords = toValidCoordinatePair(latitude, longitude);
    const initialCoordinates = validCoords || defaultCenter;
    const initialCoordinatesRef = useRef(initialCoordinates);
    const [currentLocation, setCurrentLocation] = useState(initialCoordinates);

    useEffect(() => {
        onLocationChangeRef.current = onLocationChange;
    }, [onLocationChange]);

    // Pre-populate coordinates with network default if currently empty/invalid
    useEffect(() => {
        const valid = toValidCoordinatePair(latitude, longitude);
        if (!valid) {
            setCurrentLocation(defaultCenter);
            if (mapInstanceRef.current && markerRef.current) {
                const newLatLng = L.latLng(defaultCenter.lat, defaultCenter.lng);
                markerRef.current.setLatLng(newLatLng);
                mapInstanceRef.current.setView(newLatLng, 15);
            }
            if (typeof onLocationChangeRef.current === 'function') {
                onLocationChangeRef.current(defaultCenter.lat, defaultCenter.lng);
            }
        }
    }, [defaultCenter, latitude, longitude]);

    // Calculate nearest ODP
    const nearestOdp = useMemo(() => {
        if (!currentLocation?.lat || !currentLocation?.lng || !Array.isArray(existingOdps) || existingOdps.length === 0) {
            return null;
        }
        let nearest = null;
        let minDistance = Infinity;

        for (const odp of existingOdps) {
            const lat = parseFloat(odp.latitude);
            const lng = parseFloat(odp.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) <= 0.0001 && Math.abs(lng) <= 0.0001)) continue;

            const dist = calculateDistanceMeters(currentLocation.lat, currentLocation.lng, lat, lng);
            if (dist < minDistance) {
                minDistance = dist;
                nearest = { ...odp, distanceMeters: Math.round(dist) };
            }
        }
        return nearest;
    }, [currentLocation, existingOdps]);

    // Initialize Leaflet Map once on mount
    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return undefined;

        const startCenter = initialCoordinatesRef.current;
        const map = L.map(mapRef.current, {
            center: [startCenter.lat, startCenter.lng],
            zoom: 15,
            scrollWheelZoom: true,
            dragging: true,
            zoomControl: true,
        });

        tileFallbackRef.current = attachSatelliteLayerWithFallback(L, map, {
            onFallback: () => setUsingFallbackTiles(true),
        });

        const marker = L.marker([startCenter.lat, startCenter.lng], {
            draggable: true,
            icon: createPickerIcon(),
            zIndexOffset: 1000,
        }).addTo(map);

        marker.on('dragend', (event) => {
            const position = event.target.getLatLng();
            const lat = Number(position.lat.toFixed(9));
            const lng = Number(position.lng.toFixed(9));
            setCurrentLocation({ lat, lng });

            isInternalUpdateRef.current = true;
            if (typeof onLocationChangeRef.current === 'function') {
                onLocationChangeRef.current(lat, lng);
            }
        });

        map.on('click', (event) => {
            marker.setLatLng(event.latlng);
            const lat = Number(event.latlng.lat.toFixed(9));
            const lng = Number(event.latlng.lng.toFixed(9));
            setCurrentLocation({ lat, lng });

            isInternalUpdateRef.current = true;
            if (typeof onLocationChangeRef.current === 'function') {
                onLocationChangeRef.current(lat, lng);
            }
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setIsMapReady(true);

        if (window.ResizeObserver && mapRef.current) {
            resizeObserverRef.current = new ResizeObserver(() => {
                if (mapInstanceRef.current) {
                    mapInstanceRef.current.invalidateSize();
                }
            });
            resizeObserverRef.current.observe(mapRef.current);
        }

        const initialInvalidateTimer = window.setTimeout(() => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
            }
        }, 80);

        return () => {
            window.clearTimeout(initialInvalidateTimer);
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect();
            }
            if (tileFallbackRef.current) {
                tileFallbackRef.current.cleanup();
                tileFallbackRef.current = null;
            }
            map.remove();
            mapInstanceRef.current = null;
            markerRef.current = null;
            setIsMapReady(false);
        };
    }, []);

    // Render existing ODPs on the map (persists across pin clicks)
    useEffect(() => {
        if (!mapInstanceRef.current || !isMapReady) return;
        const map = mapInstanceRef.current;

        // Clean up previous existing ODP layers
        existingLayersRef.current.forEach((layer) => {
            if (map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
        });
        existingLayersRef.current = [];

        if (Array.isArray(existingOdps)) {
            existingOdps.forEach((odp) => {
                const lat = parseFloat(odp.latitude);
                const lng = parseFloat(odp.longitude);
                if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) <= 0.0001 && Math.abs(lng) <= 0.0001)) return;

                // 1. Coverage Radius Circle
                if (showCoverageRadius) {
                    const circle = L.circle([lat, lng], {
                        radius: coverageRadiusMeters,
                        color: '#6366f1',
                        fillColor: '#818cf8',
                        fillOpacity: 0.14,
                        weight: 1.5,
                        dashArray: '3, 4',
                    }).addTo(map);
                    existingLayersRef.current.push(circle);
                }

                // 2. Existing ODP Marker
                const odpMarker = L.marker([lat, lng], {
                    icon: createExistingOdpIcon(odp),
                    zIndexOffset: 100,
                }).addTo(map);

                odpMarker.bindPopup(`
                    <div style="font-family:sans-serif;font-size:12px;padding:2px;min-width:180px;">
                        <div style="font-weight:700;color:#4338ca;font-size:13px;margin-bottom:4px;">
                            ${odp.nama}
                        </div>
                        <div style="color:#475569;line-height:1.4;">
                            <div><strong>Rasio:</strong> ${odp.rasio_distribusi || '-'}${odp.rasio_spesial ? ` (${odp.rasio_spesial})` : ''}</div>
                            <div><strong>Pelanggan:</strong> ${odp.customers_count || 0} user</div>
                            ${odp.alamat_detail ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${odp.alamat_detail}</div>` : ''}
                            <div style="font-size:10px;color:#94a3b8;margin-top:4px;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
                        </div>
                    </div>
                `);

                existingLayersRef.current.push(odpMarker);
            });
        }
    }, [isMapReady, existingOdps, showCoverageRadius, coverageRadiusMeters]);

    useEffect(() => {
        if (!mapInstanceRef.current) return undefined;

        const delays = [40, 140, 280];
        const timers = delays.map((delay) => window.setTimeout(() => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
            }
        }, delay));

        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [isOpen, height]);

    // Synchronize marker position from external props (without destroying existing layers or jerking camera if clicked internally)
    useEffect(() => {
        const nextCoordinates = toValidCoordinatePair(latitude, longitude);
        if (!nextCoordinates || !mapInstanceRef.current || !markerRef.current) return;

        const currentMarkerPos = markerRef.current.getLatLng();
        const isSame =
            Math.abs(currentMarkerPos.lat - nextCoordinates.lat) < 0.0000001 &&
            Math.abs(currentMarkerPos.lng - nextCoordinates.lng) < 0.0000001;

        if (!isSame) {
            const newLatLng = L.latLng(nextCoordinates.lat, nextCoordinates.lng);
            markerRef.current.setLatLng(newLatLng);
            if (!isInternalUpdateRef.current) {
                mapInstanceRef.current.panTo(newLatLng);
            }
        }
        isInternalUpdateRef.current = false;
        setCurrentLocation(nextCoordinates);
    }, [latitude, longitude]);

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation tidak didukung oleh browser Anda');
            return;
        }

        setIsLoadingLocation(true);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = Number(position.coords.latitude.toFixed(9));
                const lng = Number(position.coords.longitude.toFixed(9));

                if (mapInstanceRef.current && markerRef.current) {
                    const newLatLng = L.latLng(lat, lng);
                    markerRef.current.setLatLng(newLatLng);
                    mapInstanceRef.current.setView(newLatLng, 16);
                }

                setCurrentLocation({ lat, lng });
                if (typeof onLocationChangeRef.current === 'function') {
                    onLocationChangeRef.current(lat, lng);
                }
                setIsLoadingLocation(false);
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('Gagal mendapatkan lokasi GPS. Pastikan izin lokasi aktif.');
                setIsLoadingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <label className="block text-sm font-bold text-gray-800 dark:text-slate-200">
                        <MapPin className="inline w-4 h-4 mr-1 text-cyan-600" />
                        {label}
                    </label>
                    {existingOdps.length > 0 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold">
                            {existingOdps.filter(o => o.latitude && o.longitude).length} ODP Terlihat di Peta
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={getCurrentLocation}
                        disabled={isLoadingLocation}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-cyan-700 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-300 rounded-lg border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 disabled:opacity-50 transition shadow-xs"
                    >
                        <Navigation className={`w-3 h-3 ${isLoadingLocation ? 'animate-spin' : ''}`} />
                        <span>{isLoadingLocation ? 'Mencari GPS...' : '📍 GPS Saya'}</span>
                    </button>
                </div>
            </div>

            {showCoordinateInputs && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">Latitude</label>
                        <input
                            type="number"
                            step="any"
                            value={currentLocation.lat}
                            onChange={(event) => {
                                const lat = Number(event.target.value);
                                if (!Number.isFinite(lat)) return;

                                setCurrentLocation((prev) => ({ ...prev, lat }));
                                if (mapInstanceRef.current && markerRef.current) {
                                    const newLatLng = L.latLng(lat, currentLocation.lng);
                                    markerRef.current.setLatLng(newLatLng);
                                    mapInstanceRef.current.setView(newLatLng, mapInstanceRef.current.getZoom(), { animate: false });
                                }
                                if (typeof onLocationChangeRef.current === 'function') {
                                    onLocationChangeRef.current(lat, currentLocation.lng);
                                }
                            }}
                            className="w-full px-3 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg dark:bg-slate-900 dark:border-white/10 dark:text-white"
                            placeholder="-5.632727646"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-600 dark:text-slate-400 mb-1">Longitude</label>
                        <input
                            type="number"
                            step="any"
                            value={currentLocation.lng}
                            onChange={(event) => {
                                const lng = Number(event.target.value);
                                if (!Number.isFinite(lng)) return;

                                setCurrentLocation((prev) => ({ ...prev, lng }));
                                if (mapInstanceRef.current && markerRef.current) {
                                    const newLatLng = L.latLng(currentLocation.lat, lng);
                                    markerRef.current.setLatLng(newLatLng);
                                    mapInstanceRef.current.setView(newLatLng, mapInstanceRef.current.getZoom(), { animate: false });
                                }
                                if (typeof onLocationChangeRef.current === 'function') {
                                    onLocationChangeRef.current(currentLocation.lat, lng);
                                }
                            }}
                            className="w-full px-3 py-1.5 text-xs sm:text-sm border border-gray-300 rounded-lg dark:bg-slate-900 dark:border-white/10 dark:text-white"
                            placeholder="105.548014641"
                        />
                    </div>
                </div>
            )}

            {/* Live Distance & Nearest ODP HUD Bar */}
            {nearestOdp && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-gradient-to-r from-indigo-50/90 to-blue-50/90 dark:from-slate-900/90 dark:to-indigo-950/40 border border-indigo-200/90 dark:border-indigo-800/80 rounded-xl text-xs">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                        <div>
                            <span className="text-gray-600 dark:text-slate-400">ODP Terdekat: </span>
                            <strong className="text-indigo-900 dark:text-indigo-300 font-bold">{nearestOdp.nama}</strong>
                            <span className="ml-1 text-gray-700 dark:text-slate-300 font-semibold">
                                ({nearestOdp.distanceMeters} meter)
                            </span>
                            {nearestOdp.distanceMeters <= 50 ? (
                                <span className="ml-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px]">
                                    ⚠️ Sangat Dekat (&lt;50m)
                                </span>
                            ) : nearestOdp.distanceMeters <= 200 ? (
                                <span className="ml-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                    ✅ Jarak Ideal Dropcore
                                </span>
                            ) : (
                                <span className="ml-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
                                    🚀 Area Baru / Perluasan
                                </span>
                            )}
                        </div>
                    </div>

                    {onAdoptNearestWilayah && (nearestOdp.desa_id || nearestOdp.kecamatan_id) && (
                        <button
                            type="button"
                            onClick={() => onAdoptNearestWilayah(nearestOdp)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded-lg shadow-xs transition text-xs"
                            title="Otomatis samakan Kecamatan, Desa, dan Dusun dari ODP ini"
                        >
                            <Sparkles size={12} />
                            <span>⚡ Samakan Wilayah dgn {nearestOdp.nama}</span>
                        </button>
                    )}
                </div>
            )}

            <div
                ref={mapRef}
                style={{
                    height,
                    width: '100%',
                    position: 'relative',
                    zIndex: 0,
                }}
                className="rounded-xl border border-gray-300 dark:border-white/10 overflow-hidden bg-gray-100 shadow-inner"
            />

            {usingFallbackTiles && (
                <p className="text-xs text-amber-700">
                    Tile satelit bermasalah, otomatis dialihkan ke peta standar agar peta tetap tampil.
                </p>
            )}

            <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                <p>💡 Klik pada peta atau drag pin biru untuk menentukan titik ODP baru.</p>
                {showCoverageRadius && (
                    <span className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400">
                        <span className="w-2.5 h-2.5 rounded-full border border-indigo-500 bg-indigo-500/20 inline-block"></span>
                        Lingkaran = Radius Jangkauan Kabel {coverageRadiusMeters}m
                    </span>
                )}
            </div>
        </div>
    );
}

export default MapPicker;
