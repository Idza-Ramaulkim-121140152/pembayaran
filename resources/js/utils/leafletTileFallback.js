const SATELLITE_TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const SATELLITE_OPTIONS = {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 20,
    maxNativeZoom: 19,
    minZoom: 5,
    keepBuffer: 2,
    detectRetina: false,
    updateWhenIdle: true,
};

const OSM_OPTIONS = {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 20,
    maxNativeZoom: 19,
    minZoom: 5,
    keepBuffer: 2,
    detectRetina: false,
    updateWhenIdle: true,
    subdomains: ['a', 'b', 'c'],
};

export function attachSatelliteLayerWithFallback(L, map, options = {}) {
    const {
        softErrorThreshold = 8,
        hardErrorThreshold = 20,
        warmupTimeoutMs = 6000,
        onFallback = null,
    } = options;

    const satelliteLayer = L.tileLayer(SATELLITE_TILE_URL, SATELLITE_OPTIONS);
    const fallbackLayer = L.tileLayer(OSM_TILE_URL, OSM_OPTIONS);

    let fallbackActivated = false;
    let tileErrorCount = 0;
    let tileLoadCount = 0;

    const activateFallback = () => {
        if (fallbackActivated) return;

        fallbackActivated = true;

        if (map.hasLayer(satelliteLayer)) {
            map.removeLayer(satelliteLayer);
        }

        if (!map.hasLayer(fallbackLayer)) {
            fallbackLayer.addTo(map);
        }

        if (typeof onFallback === 'function') {
            onFallback();
        }
    };

    satelliteLayer.on('tileload', () => {
        tileLoadCount += 1;
    });

    satelliteLayer.on('tileerror', () => {
        tileErrorCount += 1;

        if (
            !fallbackActivated &&
            (
                (tileLoadCount === 0 && tileErrorCount >= softErrorThreshold) ||
                tileErrorCount >= hardErrorThreshold
            )
        ) {
            activateFallback();
        }
    });

    satelliteLayer.addTo(map);

    const warmupTimer = window.setTimeout(() => {
        if (!fallbackActivated && tileLoadCount === 0 && tileErrorCount > 0) {
            activateFallback();
        }
    }, warmupTimeoutMs);

    return {
        cleanup: () => {
            window.clearTimeout(warmupTimer);
            satelliteLayer.off();
            fallbackLayer.off();
        },
        isFallbackActive: () => fallbackActivated,
    };
}
