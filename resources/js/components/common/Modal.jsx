import { X } from 'lucide-react';

function Modal({ isOpen, onClose, title, children, size = 'md' }) {
    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
    };

    return (
        <div className="fixed inset-0 z-[70] overflow-y-auto">
            <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} />

            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className={`relative w-full ${sizeClasses[size]} max-h-[92vh] overflow-y-auto bg-white rounded-2xl border border-[var(--app-border)] shadow-2xl animate-[fadeIn_.2s_ease-out]`}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur z-10">
                        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-8 w-8 rounded-lg hover:bg-slate-100 transition grid place-items-center"
                        >
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>

                    <div className="p-4 md:p-5">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default Modal;
