import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CheckCircle2, AlertTriangle, RefreshCw, X, Sparkles, Clock, Smile, MapPin } from 'lucide-react';
import { initFaceDetectionModels, detectFaceAndSmile, captureVideoFrame } from '../../utils/smileDetector';

export default function AttendanceCameraModal({
    isOpen,
    onClose,
    type = 'clock_in', // 'clock_in' or 'clock_out'
    workStartTime = '08:00',
    workEndTime = '17:00',
    isLate = false,
    lateMinutes = 0,
    onSubmit,
}) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const animationFrameRef = useRef(null);

    const [cameraState, setCameraState] = useState('initializing'); // 'initializing', 'ready', 'error', 'captured'
    const [errorMessage, setErrorMessage] = useState('');
    const [faceStatus, setFaceStatus] = useState({
        faceDetected: false,
        isSmiling: false,
        smilePercentage: 0,
        smileScore: 0,
        message: 'Menyiapkan pendeteksi wajah...',
    });

    const [capturedImage, setCapturedImage] = useState(null);
    const [capturedSmileScore, setCapturedSmileScore] = useState(0);
    const [notes, setNotes] = useState('');
    const [lateReasonCategory, setLateReasonCategory] = useState('');
    const [lateReasonCustom, setLateReasonCustom] = useState('');
    const [lateReasonError, setLateReasonError] = useState('');
    const [locationState, setLocationState] = useState({
        status: 'idle', // 'idle', 'locating', 'success', 'error'
        latitude: null,
        longitude: null,
        accuracy: null,
        errorMessage: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [countdown, setCountdown] = useState(null);

    const smileHoldCounterRef = useRef(0);

    // Fetch GPS coordinates
    const fetchLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setLocationState({
                status: 'error',
                latitude: null,
                longitude: null,
                accuracy: null,
                errorMessage: 'Perangkat atau browser tidak mendukung fitur GPS.',
            });
            return;
        }

        setLocationState((prev) => ({ ...prev, status: 'locating', errorMessage: '' }));

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocationState({
                    status: 'success',
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    errorMessage: '',
                });
            },
            (err) => {
                console.warn('Geolocation error:', err);
                let msg = 'Gagal mendeteksi koordinat GPS.';
                if (err.code === 1) {
                    msg = 'Izin lokasi GPS belum diizinkan oleh browser.';
                } else if (err.code === 2) {
                    msg = 'Sinyal GPS lokasi tidak ditemukan.';
                } else if (err.code === 3) {
                    msg = 'Waktu permintaan lokasi GPS habis (timeout).';
                }
                setLocationState({
                    status: 'error',
                    latitude: null,
                    longitude: null,
                    accuracy: null,
                    errorMessage: msg,
                });
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000,
            }
        );
    }, []);

    // Stop live stream
    const stopCamera = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    // Start live camera stream
    const startCamera = useCallback(async () => {
        setCameraState('initializing');
        setErrorMessage('');
        setCapturedImage(null);
        smileHoldCounterRef.current = 0;

        try {
            // Pre-init models in background
            initFaceDetectionModels().catch(console.warn);

            const constraints = {
                audio: false,
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            setCameraState('ready');
        } catch (err) {
            console.error('Failed to access webcam:', err);
            setCameraState('error');
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setErrorMessage('Izin kamera ditolak. Harap izinkan akses kamera di browser Anda.');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setErrorMessage('Kamera tidak ditemukan pada perangkat Anda.');
            } else {
                setErrorMessage('Gagal membuka kamera: ' + err.message);
            }
        }
    }, []);

    // Loop detection
    useEffect(() => {
        if (!isOpen || cameraState !== 'ready') return;

        let isRunning = true;
        let lastCheckTime = 0;

        const loop = async (timestamp) => {
            if (!isRunning) return;

            // Check roughly every 100ms for optimal performance
            if (timestamp - lastCheckTime >= 100 && videoRef.current) {
                lastCheckTime = timestamp;
                const result = await detectFaceAndSmile(videoRef.current);
                if (isRunning) {
                    setFaceStatus(result);

                    // Check smile hold for auto capture
                    if (result.faceDetected && result.isSmiling && result.smilePercentage >= 50) {
                        smileHoldCounterRef.current += 1;

                        // After smiling consistently for ~1 second (10 checks)
                        if (smileHoldCounterRef.current >= 8 && !capturedImage) {
                            handleSnapPhoto(result.smileScore);
                            return;
                        }
                    } else {
                        smileHoldCounterRef.current = Math.max(0, smileHoldCounterRef.current - 1);
                    }
                }
            }

            animationFrameRef.current = requestAnimationFrame(loop);
        };

        animationFrameRef.current = requestAnimationFrame(loop);

        return () => {
            isRunning = false;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isOpen, cameraState, capturedImage]);

    // Handle initial open / close
    useEffect(() => {
        if (isOpen) {
            startCamera();
            fetchLocation();
        } else {
            stopCamera();
            setCapturedImage(null);
            setNotes('');
            setLateReasonCategory('');
            setLateReasonCustom('');
            setLateReasonError('');
            setLocationState({
                status: 'idle',
                latitude: null,
                longitude: null,
                accuracy: null,
                errorMessage: '',
            });
        }

        return () => {
            stopCamera();
        };
    }, [isOpen, startCamera, stopCamera, fetchLocation]);

    const handleSnapPhoto = (smileScore = null) => {
        if (!videoRef.current) return;
        const photoDataUrl = captureVideoFrame(videoRef.current);
        if (photoDataUrl) {
            setCapturedImage(photoDataUrl);
            setCapturedSmileScore(smileScore !== null ? smileScore : faceStatus.smileScore || 0.8);
            setCameraState('captured');
            stopCamera();
        }
    };

    const handleRetake = () => {
        setCapturedImage(null);
        startCamera();
    };

    const handleConfirmSubmit = async () => {
        if (!capturedImage) return;

        if (isClockIn && isLate) {
            if (!lateReasonCategory) {
                setLateReasonError('Pilih alasan keterlambatan terlebih dahulu');
                return;
            }
            if (lateReasonCategory === 'Lainnya' && !lateReasonCustom.trim()) {
                setLateReasonError('Mohon ketikkan keterangan alasan lainnya');
                return;
            }
        }

        try {
            setSubmitting(true);
            setLateReasonError('');

            let finalLateReason = null;
            if (isClockIn && isLate) {
                finalLateReason = lateReasonCategory === 'Lainnya'
                    ? `Lainnya: ${lateReasonCustom.trim()}`
                    : lateReasonCategory;
            }

            await onSubmit({
                photo: capturedImage,
                smile_score: capturedSmileScore,
                late_reason: finalLateReason,
                latitude: locationState.latitude,
                longitude: locationState.longitude,
                notes: notes.trim() || null,
            });
            onClose();
        } catch (err) {
            console.error('Submit attendance error:', err);
            const serverMsg = err?.response?.data?.errors?.late_reason?.[0] || err?.response?.data?.message;
            if (serverMsg) {
                setLateReasonError(serverMsg);
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const isClockIn = type === 'clock_in';
    const titleText = isClockIn ? 'Absen Masuk (Wajib)' : 'Absen Pulang (Opsional)';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative flex w-full max-w-lg max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${isClockIn ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'}`}>
                            <Camera size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">{titleText}</h3>
                            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <Smile size={13} className="text-emerald-500" />
                                Wajib menghadap kamera & tersenyum
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Schedule & Late Alert */}
                    {isClockIn && (
                        <div className={`rounded-xl border p-3.5 text-xs ${isLate ? 'border-amber-200 bg-amber-50/80 text-amber-900' : 'border-emerald-200 bg-emerald-50/80 text-emerald-900'}`}>
                            <div className="flex items-start gap-2.5">
                                {isLate ? (
                                    <AlertTriangle size={18} className="mt-0.5 text-amber-600 shrink-0" />
                                ) : (
                                    <CheckCircle2 size={18} className="mt-0.5 text-emerald-600 shrink-0" />
                                )}
                                <div>
                                    <div className="flex items-center gap-2 font-semibold">
                                        <span>Jam Masuk Kantor: {workStartTime} WIB</span>
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${isLate ? 'bg-amber-200/70 text-amber-800' : 'bg-emerald-200/70 text-emerald-800'}`}>
                                            {isLate ? `Terlambat ${lateMinutes} Menit` : 'Tepat Waktu'}
                                        </span>
                                    </div>
                                    <p className="mt-1 leading-relaxed text-slate-600">
                                        {isLate
                                            ? 'Anda melakukan absensi melewati jam masuk. Wajib melampirkan alasan keterlambatan setelah pengambilan foto sebelum data absensi disimpan.'
                                            : 'Waktu kehadiran Anda tercatat tepat waktu sebelum jam masuk.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isClockIn && (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-3.5 text-xs text-blue-900">
                            <div className="flex items-center gap-2 font-semibold">
                                <Clock size={16} className="text-blue-600" />
                                <span>Jam Pulang Standar: {workEndTime} WIB</span>
                            </div>
                            <p className="mt-1 leading-relaxed text-slate-600">
                                Absen pulang bersifat opsional dan hanya dapat dilakukan 1 kali sehari setelah Anda melakukan absen masuk.
                            </p>
                        </div>
                    )}

                    {/* GPS Coordinates Status Bar */}
                    <div className={`rounded-xl border p-3 text-xs transition ${
                        locationState.status === 'success'
                            ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                            : locationState.status === 'error'
                            ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                            : 'border-slate-200 bg-slate-50/80 text-slate-600'
                    }`}>
                        {locationState.status === 'locating' && (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MapPin size={15} className="text-orange-500 animate-pulse shrink-0" />
                                    <span className="font-medium">Mendeteksi titik koordinat GPS lokasi Anda...</span>
                                </div>
                                <RefreshCw size={12} className="animate-spin text-slate-400" />
                            </div>
                        )}

                        {locationState.status === 'success' && (
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <MapPin size={16} className="mt-0.5 text-emerald-600 shrink-0" />
                                    <div>
                                        <div className="flex items-center gap-1.5 font-semibold">
                                            <span>Titik Koordinat:</span>
                                            <span className="font-mono text-[11px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                                                {locationState.latitude?.toFixed(6)}, {locationState.longitude?.toFixed(6)}
                                            </span>
                                        </div>
                                        {locationState.accuracy && (
                                            <p className="text-[11px] text-emerald-700 mt-0.5">
                                                Akurasi sinyal: &plusmn;{Math.round(locationState.accuracy)} meter
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchLocation}
                                    title="Segarkan koordinat GPS"
                                    className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-100 transition"
                                >
                                    <RefreshCw size={13} />
                                </button>
                            </div>
                        )}

                        {locationState.status === 'error' && (
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={16} className="mt-0.5 text-amber-600 shrink-0" />
                                    <div>
                                        <p className="font-semibold">Titik Koordinat GPS Belum Terdeteksi</p>
                                        <p className="text-[11px] text-amber-700 mt-0.5">{locationState.errorMessage}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchLocation}
                                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 shadow-sm hover:bg-amber-100 transition shrink-0"
                                >
                                    <RefreshCw size={11} />
                                    Coba Lagi
                                </button>
                            </div>
                        )}

                        {locationState.status === 'idle' && (
                            <div className="flex items-center gap-2">
                                <MapPin size={15} className="text-slate-400 shrink-0" />
                                <span>Menyiapkan GPS...</span>
                            </div>
                        )}
                    </div>

                    {/* Camera Feed / Image Preview */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-950 shadow-inner flex items-center justify-center">
                        {cameraState === 'error' ? (
                            <div className="p-6 text-center text-white space-y-3">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
                                    <AlertTriangle size={24} />
                                </div>
                                <p className="text-sm font-medium">{errorMessage}</p>
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition"
                                >
                                    <RefreshCw size={14} />
                                    Coba Lagi
                                </button>
                            </div>
                        ) : cameraState === 'captured' && capturedImage ? (
                            <div className="relative h-full w-full">
                                <img
                                    src={capturedImage}
                                    alt="Foto Absensi"
                                    className="h-full w-full object-cover"
                                />
                                <div className="absolute top-3 right-3 rounded-full bg-emerald-500/90 backdrop-blur-md px-3 py-1 text-xs font-semibold text-white flex items-center gap-1.5 shadow">
                                    <Sparkles size={14} />
                                    Senyum Terverifikasi ({Math.round(capturedSmileScore * 100)}%)
                                </div>
                                <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 backdrop-blur-md px-3 py-1.5 text-xs text-white">
                                    {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Video Stream */}
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="h-full w-full object-cover"
                                    style={{ transform: 'scaleX(-1)' }}
                                />

                                {/* Oval Face Guide Overlay */}
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                    <div
                                        className={`h-[72%] w-[58%] rounded-[50%] border-4 transition-all duration-300 ${
                                            faceStatus.isSmiling
                                                ? 'border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.6)] animate-pulse'
                                                : faceStatus.faceDetected
                                                ? 'border-amber-400/90 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                                                : 'border-white/50 border-dashed'
                                        }`}
                                    />
                                </div>

                                {/* Dynamic Instruction & Smile Meter Floating Bar */}
                                <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-slate-950/85 backdrop-blur-md p-3 text-white border border-white/10 space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold flex items-center gap-1.5">
                                            {faceStatus.isSmiling ? (
                                                <Smile size={16} className="text-emerald-400 animate-bounce" />
                                            ) : (
                                                <Smile size={16} className="text-amber-400" />
                                            )}
                                            {faceStatus.message}
                                        </span>
                                        <span className={`font-mono font-bold text-xs ${faceStatus.isSmiling ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {faceStatus.smilePercentage}%
                                        </span>
                                    </div>

                                    {/* Smile Progress Meter */}
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                                        <div
                                            className={`h-full transition-all duration-150 ${
                                                faceStatus.isSmiling ? 'bg-emerald-400' : 'bg-gradient-to-r from-amber-400 to-emerald-400'
                                            }`}
                                            style={{ width: `${faceStatus.smilePercentage}%` }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Captured Form: Late Reason & Notes */}
                    {cameraState === 'captured' && (
                        <div className="space-y-3 pt-1">
                            {/* Late Reason section if isClockIn && isLate */}
                            {isClockIn && isLate && (
                                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                            <AlertTriangle size={15} className="text-amber-600" />
                                            Alasan Keterlambatan
                                        </label>
                                        <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                                            Wajib Dipilih
                                        </span>
                                    </div>

                                    <select
                                        value={lateReasonCategory}
                                        onChange={(e) => {
                                            setLateReasonCategory(e.target.value);
                                            if (lateReasonError) setLateReasonError('');
                                        }}
                                        className="w-full rounded-xl border border-amber-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 shadow-sm"
                                    >
                                        <option value="">-- Pilih Alasan Keterlambatan --</option>
                                        <option value="Bangun Kesiangan">Bangun Kesiangan</option>
                                        <option value="Dinas Luar">Dinas Luar</option>
                                        <option value="Keperluan Pribadi">Keperluan Pribadi</option>
                                        <option value="Lainnya">Lainnya</option>
                                    </select>

                                    {lateReasonCategory === 'Lainnya' && (
                                        <div className="space-y-1 pt-1 animate-in fade-in duration-150">
                                            <label className="text-[11px] font-semibold text-slate-700">
                                                Jelaskan Alasan Keterlambatan: <span className="text-rose-500">*</span>
                                            </label>
                                            <textarea
                                                rows={2}
                                                value={lateReasonCustom}
                                                onChange={(e) => {
                                                    setLateReasonCustom(e.target.value);
                                                    if (lateReasonError) setLateReasonError('');
                                                }}
                                                placeholder="Tuliskan alasan keterlambatan Anda secara jelas..."
                                                maxLength={250}
                                                className="w-full rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 placeholder:text-slate-400 shadow-sm"
                                            />
                                        </div>
                                    )}

                                    {lateReasonError && (
                                        <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5 pt-0.5">
                                            <AlertTriangle size={13} />
                                            {lateReasonError}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Additional Notes Field */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-700">Catatan Kehadiran (Opsional)</label>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Contoh: WFO, lembur perbaikan ODP, dsb."
                                    maxLength={250}
                                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 placeholder:text-slate-400"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
                    {cameraState === 'captured' ? (
                        <>
                            <button
                                type="button"
                                onClick={handleRetake}
                                disabled={submitting}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                            >
                                <RefreshCw size={14} />
                                Foto Ulang
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSubmit}
                                disabled={submitting}
                                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow transition disabled:opacity-50 ${
                                    isClockIn ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                            >
                                {submitting ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        Menyimpan Absensi...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={16} />
                                        Kirim Absensi Sekarang
                                    </>
                                )}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSnapPhoto(faceStatus.smileScore)}
                                disabled={cameraState !== 'ready' || !faceStatus.faceDetected}
                                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow transition disabled:opacity-50 ${
                                    faceStatus.isSmiling
                                        ? 'bg-emerald-500 hover:bg-emerald-600 animate-pulse'
                                        : 'bg-orange-500 hover:bg-orange-600'
                                }`}
                            >
                                <Camera size={15} />
                                {faceStatus.isSmiling ? 'Ambil Absen (Tersenyum 😊)' : 'Ambil Foto Absen'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
