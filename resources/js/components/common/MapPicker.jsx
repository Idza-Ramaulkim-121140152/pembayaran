import { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';

function MapPicker({ latitude, longitude, onLocationChange, height = '400px', isOpen = true }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);
    const resizeObserverRef = useRef(null);
    const [currentLocation, setCurrentLocation] = useState({ lat: latitude || -7.2575, lng: longitude || 112.7521 }); // Default: Surabaya
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [mapLoaded, setMapLoaded] = useState(false);

    // Load Leaflet CSS and JS
    useEffect(() => {
        // Check if Leaflet is already loaded
        if (window.L) {
            setMapLoaded(true);
            return;
        }

        // Load CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);

        // Load JS
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = '';
        script.onload = () => {
            setMapLoaded(true);
        };
        document.head.appendChild(script);

        return () => {
            document.head.removeChild(link);
            document.head.removeChild(script);
        };
    }, []);

    // Initialize map
    useEffect(() => {
        if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return;

        const L = window.L;
        const map = L.map(mapRef.current, {
            center: [currentLocation.lat, currentLocation.lng],
            zoom: 13,
            scrollWheelZoom: true,
            dragging: true,
            zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            minZoom: 5,
            keepBuffer: 2,
            updateWhenIdle: false,
            updateWhenZooming: false,
            detectRetina: true,
        }).addTo(map);

        // Force map to recalculate size after initialization
        setTimeout(() => {
            map.invalidateSize();
        }, 100);

        // Add marker
        const marker = L.marker([currentLocation.lat, currentLocation.lng], {
            draggable: true,
        }).addTo(map);

        // Update coordinates on marker drag
        marker.on('dragend', function(e) {
            const position = e.target.getLatLng();
            const lat = parseFloat(position.lat.toFixed(9));
            const lng = parseFloat(position.lng.toFixed(9));
            setCurrentLocation({ lat, lng });
            if (onLocationChange) {
                onLocationChange(lat, lng);
            }
        });

        // Update marker on map click
        map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            const lat = parseFloat(e.latlng.lat.toFixed(9));
            const lng = parseFloat(e.latlng.lng.toFixed(9));
            setCurrentLocation({ lat, lng });
            if (onLocationChange) {
                onLocationChange(lat, lng);
            }
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;

        // Setup ResizeObserver to handle dynamic container size changes
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
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [mapLoaded]);

    // Re-invalidate map size when container becomes visible or changes
    useEffect(() => {
        if (mapInstanceRef.current && mapRef.current) {
            // Multiple attempts to ensure map renders properly
            const timeouts = [100, 300, 500, 1000];
            const timers = timeouts.map(delay => 
                setTimeout(() => {
                    if (mapInstanceRef.current) {
                        mapInstanceRef.current.invalidateSize();
                    }
                }, delay)
            );
            
            return () => {
                timers.forEach(timer => clearTimeout(timer));
            };
        }
    }, [mapLoaded]);

    // Trigger invalidateSize when modal opens (isOpen changes to true)
    useEffect(() => {
        if (isOpen && mapInstanceRef.current) {
            // Wait for modal animation to complete before invalidating size
            const timeouts = [50, 150, 300, 600];
            const timers = timeouts.map(delay => 
                setTimeout(() => {
                    if (mapInstanceRef.current) {
                        mapInstanceRef.current.invalidateSize();
                    }
                }, delay)
            );
            
            return () => {
                timers.forEach(timer => clearTimeout(timer));
            };
        }
    }, [isOpen]);

    // Update marker position when latitude/longitude props change
    useEffect(() => {
        if (mapInstanceRef.current && markerRef.current && latitude && longitude) {
            const newLatLng = window.L.latLng(latitude, longitude);
            markerRef.current.setLatLng(newLatLng);
            mapInstanceRef.current.setView(newLatLng, 13);
            setCurrentLocation({ lat: latitude, lng: longitude });
        }
    }, [latitude, longitude]);

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation tidak didukung oleh browser Anda');
            return;
        }

        setIsLoadingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = parseFloat(position.coords.latitude.toFixed(9));
                const lng = parseFloat(position.coords.longitude.toFixed(9));
                
                if (mapInstanceRef.current && markerRef.current) {
                    const newLatLng = window.L.latLng(lat, lng);
                    markerRef.current.setLatLng(newLatLng);
                    mapInstanceRef.current.setView(newLatLng, 15);
                }
                
                setCurrentLocation({ lat, lng });
                if (onLocationChange) {
                    onLocationChange(lat, lng);
                }
                setIsLoadingLocation(false);
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('Gagal mendapatkan lokasi. Pastikan Anda mengizinkan akses lokasi.');
                setIsLoadingLocation(false);
            }
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

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Latitude</label>
                    <input
                        type="number"
                        step="any"
                        value={currentLocation.lat}
                        onChange={(e) => {
                            const lat = parseFloat(e.target.value) || 0;
                            setCurrentLocation(prev => ({ ...prev, lat }));
                            if (mapInstanceRef.current && markerRef.current) {
                                const newLatLng = window.L.latLng(lat, currentLocation.lng);
                                markerRef.current.setLatLng(newLatLng);
                                mapInstanceRef.current.setView(newLatLng);
                            }
                            if (onLocationChange) {
                                onLocationChange(lat, currentLocation.lng);
                            }
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="-7.2575"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Longitude</label>
                    <input
                        type="number"
                        step="any"
                        value={currentLocation.lng}
                        onChange={(e) => {
                            const lng = parseFloat(e.target.value) || 0;
                            setCurrentLocation(prev => ({ ...prev, lng }));
                            if (mapInstanceRef.current && markerRef.current) {
                                const newLatLng = window.L.latLng(currentLocation.lat, lng);
                                markerRef.current.setLatLng(newLatLng);
                                mapInstanceRef.current.setView(newLatLng);
                            }
                            if (onLocationChange) {
                                onLocationChange(currentLocation.lat, lng);
                            }
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="112.7521"
                    />
                </div>
            </div>

            <div 
                ref={mapRef} 
                style={{ 
                    height, 
                    width: '100%',
                    position: 'relative',
                    zIndex: 0
                }} 
                className="rounded-lg border border-gray-300 overflow-hidden bg-gray-100"
            />

            <p className="text-xs text-gray-500">
                Klik pada peta atau drag marker untuk mengatur lokasi ODP
            </p>
        </div>
    );
}

export default MapPicker;
