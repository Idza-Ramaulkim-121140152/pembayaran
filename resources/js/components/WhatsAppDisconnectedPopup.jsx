import { AlertTriangle, WifiOff, X } from 'lucide-react';

function WhatsAppDisconnectedPopup({ message, onClose }) {
    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-5 pointer-events-none">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl pointer-events-auto animate-wa-popup-down">
                <div className="flex items-start gap-4 p-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                        <WifiOff size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-600">
                                    <AlertTriangle size={14} />
                                    Informasi WhatsApp
                                </p>
                                <h3 className="mt-1 text-lg font-bold text-slate-900">
                                    WhatsApp tidak terhubung
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Tutup popup WhatsApp"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            {message || 'Koneksi WhatsApp belum tersambung. Notifikasi WhatsApp tidak dapat dikirim sampai gateway aktif kembali.'}
                        </p>
                    </div>
                </div>
                <div className="h-1 bg-red-500" />
            </div>

            <style>{`
                @keyframes wa-popup-down {
                    from {
                        opacity: 0;
                        transform: translateY(-16px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-wa-popup-down {
                    animation: wa-popup-down 0.25s ease-out;
                }
            `}</style>
        </div>
    );
}

export default WhatsAppDisconnectedPopup;
