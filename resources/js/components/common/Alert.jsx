import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

export function Alert({ type = 'info', title, message, onClose }) {
    const alertStyles = {
        success: 'bg-green-50 border-green-200 text-green-800',
        error: 'bg-red-50 border-red-200 text-red-800',
        warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800',
    };

    const IconMap = {
        success: CheckCircle,
        error: XCircle,
        warning: AlertCircle,
        info: Info,
    };

    const Icon = IconMap[type];

    return (
        <div className={`border rounded-lg p-4 mb-4 flex items-start gap-3 ${alertStyles[type]}`}>
            <Icon size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
                {title && <h3 className="font-semibold">{title}</h3>}
                <p className="text-sm">{message}</p>
            </div>
            {onClose && (
                <button
                    onClick={onClose}
                    className="text-lg leading-none opacity-50 hover:opacity-75"
                >
                    ×
                </button>
            )}
        </div>
    );
}

export default Alert;
