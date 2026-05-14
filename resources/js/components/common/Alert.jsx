import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

export function Alert({ type = 'info', title, message, onClose, className = '' }) {
    const alertStyles = {
        success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        error: 'bg-rose-50 border-rose-200 text-rose-800',
        warning: 'bg-amber-50 border-amber-200 text-amber-800',
        info: 'bg-sky-50 border-sky-200 text-sky-800',
    };

    const IconMap = {
        success: CheckCircle,
        error: XCircle,
        warning: AlertCircle,
        info: Info,
    };

    const Icon = IconMap[type] || Info;

    return (
        <div className={`border rounded-2xl p-4 mb-4 flex items-start gap-3 shadow-sm animate-[fadeIn_.2s_ease-out] ${alertStyles[type] || alertStyles.info} ${className}`}>
            <Icon size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                {title && <h3 className="font-semibold">{title}</h3>}
                <p className="text-sm">{message}</p>
            </div>
            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    className="h-7 w-7 rounded-full grid place-items-center text-lg leading-none opacity-70 hover:opacity-100 hover:bg-white/70 transition"
                    aria-label="Tutup notifikasi"
                >
                    ×
                </button>
            )}
        </div>
    );
}

export default Alert;
