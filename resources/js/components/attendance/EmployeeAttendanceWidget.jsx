import React, { useState, useEffect, useCallback } from 'react';
import {
    Clock,
    Calendar,
    Camera,
    CheckCircle2,
    AlertTriangle,
    Smile,
    Sparkles,
    TrendingUp,
    RefreshCw,
    UserCheck,
    LogOut,
    HelpCircle,
} from 'lucide-react';
import apiClient from '../../utils/apiClient';
import AttendanceCameraModal from './AttendanceCameraModal';

export default function EmployeeAttendanceWidget() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        type: 'clock_in', // 'clock_in' or 'clock_out'
    });
    const [toastMessage, setToastMessage] = useState(null);

    // Live clock ticker
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const fetchAttendanceData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/attendance/today');
            if (res.data?.success) {
                setData(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch attendance status:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAttendanceData();
    }, [fetchAttendanceData]);

    const handleOpenModal = (type) => {
        setModalConfig({
            isOpen: true,
            type,
        });
    };

    const handleCloseModal = () => {
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
    };

    const handleAttendanceSubmit = async (payload) => {
        const endpoint = modalConfig.type === 'clock_in' ? '/attendance/clock-in' : '/attendance/clock-out';
        try {
            const res = await apiClient.post(endpoint, payload);
            if (res.data?.success) {
                setToastMessage({
                    type: 'success',
                    text: res.data.message || 'Absensi berhasil dicatat!',
                });
                setTimeout(() => setToastMessage(null), 5000);
                await fetchAttendanceData();
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.response?.data?.errors?.attendance?.[0] || 'Gagal mengirim absensi.';
            setToastMessage({
                type: 'error',
                text: msg,
            });
            setTimeout(() => setToastMessage(null), 6000);
            throw err;
        }
    };

    // If not employee, don't show
    if (!loading && data && !data.is_employee) {
        return null;
    }

    const attendanceToday = data?.attendance_today;
    const hasClockedIn = Boolean(attendanceToday?.clock_in_at);
    const hasClockedOut = Boolean(attendanceToday?.clock_out_at);

    const workStartTime = data?.settings?.work_start_time || '08:00';
    const workEndTime = data?.settings?.work_end_time || '17:00';

    // Calculate current live status against work_start_time
    const currentHourMin = `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`;
    const [startH, startM] = workStartTime.split(':').map(Number);
    const currentTotalMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const startTotalMinutes = startH * 60 + startM;
    const isPastStart = currentTotalMinutes > startTotalMinutes;
    const currentLateDiffMinutes = isPastStart ? currentTotalMinutes - startTotalMinutes : 0;

    const monthlySummary = data?.monthly_summary || {
        total_present: 0,
        total_on_time: 0,
        total_late: 0,
        total_hours_formatted: '0 jam',
        period_label: '-',
    };

    return (
        <section className="relative overflow-hidden rounded-3xl border border-orange-200/80 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/40 p-5 shadow-sm transition-all md:p-6">
            {/* Background decorative ambient glow */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />

            {/* Toast feedback banner */}
            {toastMessage && (
                <div className={`mb-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition animate-in fade-in slide-in-from-top-2 ${
                    toastMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                }`}>
                    <div className="flex items-center gap-2">
                        {toastMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <span>{toastMessage.text}</span>
                    </div>
                    <button type="button" onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white text-xs ml-4">✕</button>
                </div>
            )}

            {/* Header: Presensi & Digital Clock */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-orange-100/80 pb-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/20">
                        <UserCheck size={22} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-slate-950 md:text-xl">Presensi Harian Karyawan</h2>
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                <Smile size={12} />
                                Face & Smile
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Jam Kerja: <span className="font-semibold text-slate-700">{workStartTime} - {workEndTime} WIB</span> • 1x Absen Masuk (Wajib) & 1x Pulang (Opsional)
                        </p>
                    </div>
                </div>

                {/* Digital Clock & Date */}
                <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2 shadow-sm backdrop-blur">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                            <Calendar size={13} className="text-orange-500" />
                            <span>
                                {currentTime.toLocaleDateString('id-ID', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                })}
                            </span>
                        </div>
                        <div className="mt-0.5 font-mono text-xl font-bold tracking-tight text-slate-900">
                            {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            <span className="ml-1 text-xs font-sans font-medium text-slate-400">WIB</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={fetchAttendanceData}
                        disabled={loading}
                        title="Segarkan data presensi"
                        className="rounded-xl border border-slate-200/80 bg-white/80 p-2.5 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800 disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin text-orange-500' : ''} />
                    </button>
                </div>
            </div>

            {/* Attendance Action Cards Grid */}
            <div className="mt-5 grid gap-4 md:grid-cols-2">
                {/* 1. KARTU ABSEN MASUK */}
                <div className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all ${
                    hasClockedIn
                        ? 'border-emerald-200 bg-white/95 shadow-sm'
                        : isPastStart
                        ? 'border-amber-300 bg-amber-50/50 shadow-sm'
                        : 'border-orange-200 bg-white shadow-sm'
                }`}>
                    <div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-white ${hasClockedIn ? 'bg-emerald-600' : 'bg-orange-500'}`}>
                                    {hasClockedIn ? <CheckCircle2 size={18} /> : <Clock size={18} />}
                                </span>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Absen Masuk</h3>
                                    <p className="text-[11px] text-slate-500">Wajib setiap hari kerja</p>
                                </div>
                            </div>

                            {/* Status Badge */}
                            {hasClockedIn ? (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                                    attendanceToday.clock_in_status === 'late'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}>
                                    {attendanceToday.clock_in_status === 'late'
                                        ? `Terlambat ${attendanceToday.clock_in_late_minutes} mnt`
                                        : 'Tepat Waktu'}
                                </span>
                            ) : (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    isPastStart ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                    {isPastStart ? `Lewat ${currentLateDiffMinutes} mnt` : 'Belum Masuk'}
                                </span>
                            )}
                        </div>

                        {/* Details */}
                        <div className="mt-4 flex items-center justify-between">
                            <div>
                                {hasClockedIn ? (
                                    <div>
                                        <p className="text-xs text-slate-500">Waktu Masuk:</p>
                                        <p className="text-xl font-bold font-mono text-slate-900">
                                            {new Date(attendanceToday.clock_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                        </p>
                                        {attendanceToday.clock_in_notes && (
                                            <p className="text-[11px] text-slate-500 mt-1 italic line-clamp-1">"{attendanceToday.clock_in_notes}"</p>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-xs text-slate-500">Jadwal Masuk:</p>
                                        <p className="text-lg font-bold font-mono text-slate-800">{workStartTime} WIB</p>
                                        {isPastStart && (
                                            <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                                                Melebihi jam masuk, namun masih bisa absen.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Thumbnail photo if available */}
                            {hasClockedIn && attendanceToday.photo_in_url && (
                                <div className="relative h-14 w-14 overflow-hidden rounded-xl border-2 border-emerald-400 shadow-sm">
                                    <img
                                        src={attendanceToday.photo_in_url}
                                        alt="Selfie Masuk"
                                        className="h-full w-full object-cover"
                                    />
                                    <span className="absolute bottom-0 inset-x-0 bg-emerald-600/80 text-[9px] text-white text-center py-0.5 font-bold">
                                        😊 Masuk
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                        {hasClockedIn ? (
                            <button
                                type="button"
                                disabled
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-500 cursor-not-allowed"
                            >
                                <CheckCircle2 size={16} className="text-emerald-600" />
                                Sudah Absen Masuk Hari Ini
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => handleOpenModal('clock_in')}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 py-2.5 text-xs font-bold text-white shadow transition transform active:scale-95"
                            >
                                <Camera size={16} />
                                Absen Masuk Sekarang
                            </button>
                        )}
                    </div>
                </div>

                {/* 2. KARTU ABSEN PULANG */}
                <div className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all ${
                    hasClockedOut
                        ? 'border-blue-200 bg-white/95 shadow-sm'
                        : hasClockedIn
                        ? 'border-blue-200 bg-white shadow-sm'
                        : 'border-slate-200 bg-slate-50/70 opacity-70'
                }`}>
                    <div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-white ${hasClockedOut ? 'bg-blue-600' : 'bg-slate-400'}`}>
                                    {hasClockedOut ? <CheckCircle2 size={18} /> : <LogOut size={18} />}
                                </span>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Absen Pulang</h3>
                                    <p className="text-[11px] text-slate-500">Opsional (1x per hari)</p>
                                </div>
                            </div>

                            {/* Status Badge */}
                            {hasClockedOut ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800 border border-blue-200">
                                    Selesai Kerja
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                    {hasClockedIn ? 'Belum Pulang' : 'Belum Masuk'}
                                </span>
                            )}
                        </div>

                        {/* Details */}
                        <div className="mt-4 flex items-center justify-between">
                            <div>
                                {hasClockedOut ? (
                                    <div>
                                        <p className="text-xs text-slate-500">Waktu Pulang:</p>
                                        <p className="text-xl font-bold font-mono text-slate-900">
                                            {new Date(attendanceToday.clock_out_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                        </p>
                                        <p className="text-[11px] text-blue-700 font-semibold mt-1">
                                            Durasi: {attendanceToday.work_duration_formatted || '-'}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-xs text-slate-500">Jadwal Pulang:</p>
                                        <p className="text-lg font-bold font-mono text-slate-800">{workEndTime} WIB</p>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            {hasClockedIn ? 'Dapat dilakukan saat jam kerja usai.' : 'Harap lakukan absen masuk terlebih dahulu.'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Thumbnail photo if available */}
                            {hasClockedOut && attendanceToday.photo_out_url && (
                                <div className="relative h-14 w-14 overflow-hidden rounded-xl border-2 border-blue-400 shadow-sm">
                                    <img
                                        src={attendanceToday.photo_out_url}
                                        alt="Selfie Pulang"
                                        className="h-full w-full object-cover"
                                    />
                                    <span className="absolute bottom-0 inset-x-0 bg-blue-600/80 text-[9px] text-white text-center py-0.5 font-bold">
                                        😊 Pulang
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                        {hasClockedOut ? (
                            <button
                                type="button"
                                disabled
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-500 cursor-not-allowed"
                            >
                                <CheckCircle2 size={16} className="text-blue-600" />
                                Sudah Absen Pulang Hari Ini
                            </button>
                        ) : hasClockedIn ? (
                            <button
                                type="button"
                                onClick={() => handleOpenModal('clock_out')}
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-xs font-bold text-white shadow transition transform active:scale-95"
                            >
                                <Camera size={16} />
                                Absen Pulang Sekarang (Opsional)
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled
                                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-200 py-2.5 text-xs font-semibold text-slate-400 cursor-not-allowed"
                            >
                                <Clock size={16} />
                                Menunggu Absen Masuk
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Monthly Reset Summary Pill */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-xs text-slate-600 backdrop-blur">
                <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="font-semibold text-slate-800">Siklus Periode Absensi:</span>
                    <span className="rounded-md bg-orange-100 px-2 py-0.5 font-semibold text-orange-800">
                        {monthlySummary.period_label}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                    <div>
                        <span className="text-slate-400">Total Hadir:</span>{' '}
                        <strong className="text-slate-900 font-bold">{monthlySummary.total_present} Hari</strong>
                    </div>
                    <div>
                        <span className="text-slate-400">Tepat Waktu:</span>{' '}
                        <strong className="text-emerald-700 font-bold">{monthlySummary.total_on_time}</strong>
                    </div>
                    <div>
                        <span className="text-slate-400">Terlambat:</span>{' '}
                        <strong className="text-amber-700 font-bold">{monthlySummary.total_late}</strong>
                    </div>
                    <div>
                        <span className="text-slate-400">Total Jam Kerja:</span>{' '}
                        <strong className="text-blue-700 font-bold">{monthlySummary.total_hours_formatted}</strong>
                    </div>
                </div>
            </div>

            {/* Camera & Smile Detection Modal */}
            <AttendanceCameraModal
                isOpen={modalConfig.isOpen}
                type={modalConfig.type}
                workStartTime={workStartTime}
                workEndTime={workEndTime}
                isLate={isPastStart}
                lateMinutes={currentLateDiffMinutes}
                onClose={handleCloseModal}
                onSubmit={handleAttendanceSubmit}
            />
        </section>
    );
}
