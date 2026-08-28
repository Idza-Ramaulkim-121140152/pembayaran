import { X } from 'lucide-react';

function Modal({
    isOpen,
    onClose,
    title,
    children,
    size = 'md',
    theme = 'default',
    disableBackdropClose = false,
    hideCloseButton = false,
}) {
    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
    };

    const themeClasses = {
        default: {
            backdrop: 'bg-slate-950/45 backdrop-blur-[2px]',
            panel: 'rounded-2xl border border-[var(--app-border)] bg-white shadow-2xl',
            header: 'border-b border-slate-200 bg-white/95',
            title: 'text-slate-900',
            closeButton: 'hover:bg-slate-100',
            closeIcon: 'text-slate-500',
        },
        dashboard: {
            backdrop: 'bg-slate-950/45 backdrop-blur-md',
            panel:
                'rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]',
            header:
                'border-b border-slate-200 bg-white/95',
            title: 'text-slate-900',
            closeButton: 'border border-slate-200 bg-white hover:bg-slate-50',
            closeIcon: 'text-slate-500',
        },
    };

    const activeTheme = themeClasses[theme] || themeClasses.default;
    const handleClose = () => {
        if (disableBackdropClose) {
            return;
        }

        onClose?.();
    };

    return (
        <div className="fixed inset-0 z-[70] overflow-y-auto">
            <div className={`fixed inset-0 ${activeTheme.backdrop}`} onClick={handleClose} />

            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className={`relative w-full ${sizeClasses[size]} max-h-[92vh] overflow-y-auto animate-[fadeIn_.2s_ease-out] ${activeTheme.panel}`}
                    onClick={(event) => event.stopPropagation()}
                >
                    {theme === 'dashboard' && (
                        <>
                            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-orange-200 to-transparent" />
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.08),transparent_28%),radial-gradient(circle_at_80%_16%,rgba(59,130,246,0.08),transparent_22%)]" />
                        </>
                    )}

                    <div className={`sticky top-0 z-10 flex items-center justify-between p-4 backdrop-blur ${activeTheme.header}`}>
                        <h3 className={`text-lg font-semibold ${activeTheme.title}`}>{title}</h3>
                        {!hideCloseButton && (
                            <button
                                type="button"
                                onClick={handleClose}
                                className={`grid h-8 w-8 place-items-center rounded-lg transition ${activeTheme.closeButton}`}
                            >
                                <X size={20} className={activeTheme.closeIcon} />
                            </button>
                        )}
                    </div>

                    <div className="relative p-4 md:p-5">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default Modal;
