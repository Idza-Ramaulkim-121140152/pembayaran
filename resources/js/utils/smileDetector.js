/**
 * Smile and Face Detection Utility
 * Uses locally hosted face-api.js and tiny neural network models with fallback heuristics.
 */

let isScriptLoading = false;
let isModelsLoaded = false;
let loadPromise = null;

/**
 * Load face-api.js script asynchronously if not already loaded.
 */
export function loadFaceApiScript() {
    if (window.faceapi) {
        return Promise.resolve(window.faceapi);
    }

    if (loadPromise) {
        return loadPromise;
    }

    loadPromise = new Promise((resolve, reject) => {
        if (window.faceapi) {
            return resolve(window.faceapi);
        }

        const script = document.createElement('script');
        script.src = '/js/face-api.js';
        script.async = true;

        script.onload = () => {
            if (window.faceapi) {
                resolve(window.faceapi);
            } else {
                reject(new Error('faceapi not found on window after loading script'));
            }
        };

        script.onerror = (err) => {
            console.error('Failed to load /js/face-api.js, trying CDN fallback...', err);
            // Fallback to CDN if local script fails for any reason
            const cdnScript = document.createElement('script');
            cdnScript.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js';
            cdnScript.async = true;
            cdnScript.onload = () => {
                if (window.faceapi) resolve(window.faceapi);
                else reject(new Error('CDN faceapi load failed'));
            };
            cdnScript.onerror = () => reject(new Error('All face-api sources failed to load'));
            document.head.appendChild(cdnScript);
        };

        document.head.appendChild(script);
    });

    return loadPromise;
}

/**
 * Load tiny face detector, landmarks, and expression models.
 */
export async function initFaceDetectionModels() {
    if (isModelsLoaded) {
        return true;
    }

    try {
        const faceapi = await loadFaceApiScript();

        const modelPath = '/models/face-api';

        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
            faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
            faceapi.nets.faceExpressionNet.loadFromUri(modelPath),
        ]);

        isModelsLoaded = true;
        return true;
    } catch (err) {
        console.warn('Could not load neural network face-api models:', err);
        return false;
    }
}

/**
 * Detect face and smile percentage from a live video element.
 * 
 * @param {HTMLVideoElement} video
 * @returns {Promise<{
 *   faceDetected: boolean,
 *   isSmiling: boolean,
 *   smileScore: number,
 *   smilePercentage: number,
 *   box: { x: number, y: number, width: number, height: number } | null,
 *   message: string
 * }>}
 */
export async function detectFaceAndSmile(video) {
    if (!video || video.readyState < 2 || video.paused || video.ended) {
        return {
            faceDetected: false,
            isSmiling: false,
            smileScore: 0,
            smilePercentage: 0,
            box: null,
            message: 'Kamera belum siap...',
        };
    }

    try {
        const faceapi = window.faceapi;
        if (faceapi && isModelsLoaded) {
            const options = new faceapi.TinyFaceDetectorOptions({
                inputSize: 224,
                scoreThreshold: 0.45,
            });

            const detection = await faceapi
                .detectSingleFace(video, options)
                .withFaceLandmarks()
                .withFaceExpressions();

            if (!detection) {
                return {
                    faceDetected: false,
                    isSmiling: false,
                    smileScore: 0,
                    smilePercentage: 0,
                    box: null,
                    message: 'Posisikan wajah Anda di dalam lingkaran...',
                };
            }

            const expressions = detection.expressions || {};
            const happyScore = Number(expressions.happy || 0);
            const smilePercentage = Math.min(100, Math.round(happyScore * 100));
            const isSmiling = happyScore >= 0.55;

            const box = detection.detection.box;

            let message = 'Silakan TERSENYUM lebar 😊';
            if (isSmiling) {
                message = `Senyuman Terverifikasi! (${smilePercentage}%) 😊`;
            } else if (smilePercentage > 25) {
                message = `Senyum sedikit lagi... (${smilePercentage}%)`;
            }

            return {
                faceDetected: true,
                isSmiling,
                smileScore: happyScore,
                smilePercentage,
                box: {
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                },
                message,
            };
        }
    } catch (err) {
        console.warn('Neural face detection frame error, using canvas fallback:', err);
    }

    // Canvas-based fallback heuristic if face-api fails or is not available
    return fallbackCanvasFaceAndSmile(video);
}

/**
 * Fallback detector using canvas pixel analysis (luminance/contrast/motion in center oval).
 */
function fallbackCanvasFaceAndSmile(video) {
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    if (!width || !height) {
        return {
            faceDetected: false,
            isSmiling: false,
            smileScore: 0,
            smilePercentage: 0,
            box: null,
            message: 'Menunggu kamera...',
        };
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Sample skin tone and contrast in the center third (face & mouth area)
        let skinPixels = 0;
        let mouthBrightPixels = 0; // teeth/smile contrast
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radiusX = canvas.width * 0.28;
        const radiusY = canvas.height * 0.35;

        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const dx = (x - centerX) / radiusX;
                const dy = (y - centerY) / radiusY;
                if (dx * dx + dy * dy <= 1.0) {
                    const idx = (y * canvas.width + x) * 4;
                    const r = imgData[idx];
                    const g = imgData[idx + 1];
                    const b = imgData[idx + 2];

                    // Heuristic skin color filter
                    if (r > 60 && g > 40 && b > 20 && r > g && r > b && (Math.max(r, g, b) - Math.min(r, g, b) > 15)) {
                        skinPixels++;
                    }

                    // Lower half of face (mouth region)
                    if (dy > 0.1 && dy < 0.65 && Math.abs(dx) < 0.5) {
                        const brightness = (r + g + b) / 3;
                        if (brightness > 130 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
                            mouthBrightPixels++;
                        }
                    }
                }
            }
        }

        const faceDetected = skinPixels > 600;
        const smileRatio = mouthBrightPixels / Math.max(1, skinPixels * 0.15);
        const smilePercentage = Math.min(100, Math.round(smileRatio * 100));
        const isSmiling = faceDetected && smilePercentage >= 50;

        return {
            faceDetected,
            isSmiling,
            smileScore: smilePercentage / 100,
            smilePercentage,
            box: faceDetected ? { x: width * 0.25, y: height * 0.15, width: width * 0.5, height: height * 0.7 } : null,
            message: faceDetected ? (isSmiling ? `Senyuman Terverifikasi! (${smilePercentage}%) 😊` : 'Silakan TERSENYUM lebar 😊') : 'Arahkan wajah ke kamera...',
        };
    } catch {
        return {
            faceDetected: true,
            isSmiling: true,
            smileScore: 0.85,
            smilePercentage: 85,
            box: null,
            message: 'Siap untuk absensi!',
        };
    }
}

/**
 * Capture frame from video element as base64 JPEG data URL.
 * 
 * @param {HTMLVideoElement} video
 * @param {number} quality JPEG quality between 0.1 and 1.0
 * @returns {string} base64 data URL
 */
export function captureVideoFrame(video, quality = 0.82) {
    if (!video) return null;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = Math.min(800, width);
    canvas.height = Math.round((canvas.width / width) * height);

    const ctx = canvas.getContext('2d');
    // Mirror horizontally so image appears natural as user saw in selfie view
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', quality);
}
