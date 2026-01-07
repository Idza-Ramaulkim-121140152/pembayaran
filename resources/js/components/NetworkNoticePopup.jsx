import { useEffect, useState } from 'react';
import { AlertTriangle, Wrench, X, Clock, MapPin, AlertCircle } from 'lucide-react';

/**
 * NetworkNoticePopup - Komponen popup untuk menampilkan informasi gangguan/maintenance
 * 
 * @param {Object} props
 * @param {Array} props.notices - Array of notice objects
 * @param {number} props.autoHideDelay - Delay in ms before auto-hiding (0 = no auto-hide)
 * @param {boolean} props.showOnlyFirst - Only show first notice as popup
 * @param {Function} props.onClose - Callback when popup is closed
 */
function NetworkNoticePopup({ notices = [], autoHideDelay = 0, showOnlyFirst = false, onClose }) {
    const [visible, setVisible] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (notices.length > 0 && autoHideDelay > 0) {
            const timer = setTimeout(() => {
                setVisible(false);
                onClose?.();
            }, autoHideDelay);
            return () => clearTimeout(timer);
        }
    }, [notices, autoHideDelay, onClose]);

    // Auto-cycle through notices if multiple
    useEffect(() => {
        if (notices.length > 1 && !showOnlyFirst && autoHideDelay === 0) {
            const interval = setInterval(() => {
                setCurrentIndex((prev) => (prev + 1) % notices.length);
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [notices, showOnlyFirst, autoHideDelay]);

    if (!visible || notices.length === 0) return null;

    const displayNotices = showOnlyFirst ? [notices[0]] : notices;
    const currentNotice = displayNotices[currentIndex] || displayNotices[0];

    const getSeverityStyles = (severity) => {
        switch (severity) {
            case 'critical':
                return {
                    bg: 'bg-red-500',
                    border: 'border-red-600',
                    icon: 'text-white',
                    text: 'text-white',
                };
            case 'high':
                return {
                    bg: 'bg-orange-500',
                    border: 'border-orange-600',
                    icon: 'text-white',
                    text: 'text-white',
                };
            case 'medium':
                return {
                    bg: 'bg-yellow-400',
                    border: 'border-yellow-500',
                    icon: 'text-yellow-900',
                    text: 'text-yellow-900',
                };
            default:
                return {
                    bg: 'bg-blue-500',
                    border: 'border-blue-600',
                    icon: 'text-white',
                    text: 'text-white',
                };
        }
    };

    const formatDateTime = (dateStr) => {
        if (!dateStr) return null;
        return new Date(dateStr).toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const handleClose = () => {
        setVisible(false);
        onClose?.();
    };

    const styles = getSeverityStyles(currentNotice.severity);
    const isMaintenance = currentNotice.type === 'maintenance';

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-4 px-4 pointer-events-none">
            <div 
                className={`
                    ${styles.bg} ${styles.border}
                    max-w-lg w-full rounded-2xl shadow-2xl border-2 
                    transform transition-all duration-500 ease-out
                    animate-slide-down pointer-events-auto
                `}
            >
                {/* Header */}
                <div className="flex items-start justify-between p-4 pb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-white/20 flex items-center justify-center`}>
                            {isMaintenance ? (
                                <Wrench size={20} className={styles.icon} />
                            ) : (
                                <AlertTriangle size={20} className={styles.icon} />
                            )}
                        </div>
                        <div>
                            <span className={`text-xs font-medium ${styles.text} opacity-80`}>
                                {isMaintenance ? 'PERBAIKAN TERJADWAL' : 'INFORMASI GANGGUAN'}
                            </span>
                            <h3 className={`font-bold ${styles.text}`}>{currentNotice.title}</h3>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className={`p-1 rounded-full hover:bg-white/20 transition ${styles.text}`}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 pb-4">
                    <p className={`${styles.text} opacity-90 text-sm mb-3`}>
                        {currentNotice.message}
                    </p>

                    {/* Meta info */}
                    <div className={`flex flex-wrap gap-3 text-xs ${styles.text} opacity-75`}>
                        {currentNotice.affected_area && (
                            <span className="flex items-center gap-1">
                                <MapPin size={12} />
                                {currentNotice.affected_area}
                            </span>
                        )}
                        {currentNotice.start_time && (
                            <span className="flex items-center gap-1">
                                <Clock size={12} />
                                Mulai: {formatDateTime(currentNotice.start_time)}
                            </span>
                        )}
                        {currentNotice.end_time && (
                            <span className="flex items-center gap-1">
                                <AlertCircle size={12} />
                                Est. Selesai: {formatDateTime(currentNotice.end_time)}
                            </span>
                        )}
                    </div>

                    {/* Multiple notices indicator */}
                    {displayNotices.length > 1 && (
                        <div className="flex items-center justify-center gap-1 mt-3">
                            {displayNotices.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentIndex(index)}
                                    className={`w-2 h-2 rounded-full transition ${
                                        index === currentIndex ? 'bg-white w-4' : 'bg-white/40'
                                    }`}
                                />
                            ))}
                        </div>
                    )}

                    {/* Link to status page */}
                    <a 
                        href="/status-jaringan"
                        className={`block mt-3 text-center text-xs ${styles.text} opacity-75 hover:opacity-100 underline transition`}
                    >
                        Lihat semua informasi gangguan →
                    </a>
                </div>

                {/* Auto-hide progress bar */}
                {autoHideDelay > 0 && (
                    <div className="h-1 bg-white/20 rounded-b-2xl overflow-hidden">
                        <div 
                            className="h-full bg-white/50 animate-shrink"
                            style={{ animationDuration: `${autoHideDelay}ms` }}
                        />
                    </div>
                )}
            </div>

            <style>{`
                @keyframes slide-down {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes shrink {
                    from {
                        width: 100%;
                    }
                    to {
                        width: 0%;
                    }
                }
                .animate-slide-down {
                    animation: slide-down 0.3s ease-out;
                }
                .animate-shrink {
                    animation: shrink linear forwards;
                }
            `}</style>
        </div>
    );
}

export default NetworkNoticePopup;
