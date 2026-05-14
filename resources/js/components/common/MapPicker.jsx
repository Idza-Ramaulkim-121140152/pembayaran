import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, Navigation } from 'lucide-react';
import { attachSatelliteLayerWithFallback } from '../../utils/leafletTileFallback';

const LAMPUNG_DEFAULT = {
    lat: -5.632727646,
    lng: 105.548014641,
};

function toValidCoordinatePair(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
    }

    return null;
}

function createPickerIcon() {
    return L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
    });
}

function MapPicker({
    latitude,
    longitude,
    onLocationChange,
    height = '400px',
    isOpen = true,
    showCoordinateInputs = true,
}) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);
    const resizeObserverRef = useRef(null);
    const tileFallbackRef = useRef(null);
    const onLocationChangeRef = useRef(onLocationChange);
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [usingFallbackTiles, setUsingFallbackTiles] = useState(false);

    const initialCoordinates = toValidCoordinatePair(latitude, longitude) || LAMPUNG_DEFAULT;
    const [currentLocation, setCurrentLocation] = useState(initialCoordinates);

    useEffect(() => {
        onLocationChangeRef.current = onLocationChange;
    }, [onLocationChange]);

    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return undefined;

        const map = L.map(mapRef.current, {
            center: [initialCoordinates.lat, initialCoordinates.lng],
            zoom: 13,
            scrollWheelZoom: true,
            dragging: true,
            zoomControl: true,
        });

        tileFallbackRef.current = attachSatelliteLayerWithFallback(L, map, {
            onFallback: () => setUsingFallbackTiles(true),
        });

        const marker = L.marker([initialCoordinates.lat, initialCoordinates.lng], {
            draggable: true,
            icon: createPickerIcon(),
        }).addTo(map);

        marker.on('dragend', (event) => {
            const position = event.target.getLatLng();
            const lat = Number(position.lat.toFixed(9));
            const lng = Number(position.lng.toFixed(9));
            setCurrentLocation({ lat, lng });

            if (typeof onLocationChangeRef.current === 'function') {
                onLocationChangeRef.current(lat, lng);
            }
        });

        map.on('click', (event) => {
            marker.setLatLng(event.latlng);
            const lat = Number(event.latlng.lat.toFixed(9));
            const lng = Number(event.latlng.lng.toFixed(9));
            setCurrentLocation({ lat, lng });

            if (typeof onLocationChangeRef.current === 'function') {
                onLocationChangeRef.current(lat, lng);
            }
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;

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
        };
    }, [initialCoordinates.lat, initialCoordinates.lng]);

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

    useEffect(() => {
        const nextCoordinates = toValidCoordinatePair(latitude, longitude);
        if (!nextCoordinates || !mapInstanceRef.current || !markerRef.current) return;

        const newLatLng = L.latLng(nextCoordinates.lat, nextCoordinates.lng);
        markerRef.current.setLatLng(newLatLng);
        mapInstanceRef.current.setView(newLatLng, mapInstanceRef.current.getZoom(), { animate: false });
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
                    mapInstanceRef.current.setView(newLatLng, 15);
                }

                setCurrentLocation({ lat, lng });
                if (typeof onLocationChangeRef.current === 'function') {
                    onLocationChangeRef.current(lat, lng);
                }
                setIsLoadingLocation(false);
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('Gagal mendapatkan lokasi. Pastikan Anda mengizinkan akses lokasi.');
                setIsLoadingLocation(false);
            },
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                    <MapPin className="inline w-4 h-4 mr-1" />
                    Lokasi ODP
                </label>
                <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={isLoadingLocation}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                >
                    <Navigation className="w-3 h-3" />
                    {isLoadingLocation ? 'Mengambil...' : 'Lokasi Saya'}
                </button>
            </div>

            {showCoordinateInputs && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Latitude</label>
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
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="-5.632727646"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Longitude</label>
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
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="105.548014641"
                        />
                    </div>
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
                className="rounded-lg border border-gray-300 overflow-hidden bg-gray-100"
            />

            {usingFallbackTiles && (
                <p className="text-xs text-amber-700">
                    Tile satelit bermasalah, otomatis dialihkan ke peta standar agar peta tetap tampil.
                </p>
            )}

            <p className="text-xs text-gray-500">
                Klik pada peta atau drag marker untuk mengatur lokasi ODP
            </p>
        </div>
    );
}

export default MapPicker;
