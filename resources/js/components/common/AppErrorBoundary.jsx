import React, { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class AppErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
        };
    }

    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error, errorInfo) {
        console.error('App runtime error captured by boundary:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="rounded-2xl bg-rose-50 p-3 text-rose-600">
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Halaman mengalami gangguan</h2>
                                <p className="mt-1 text-sm text-slate-600">
                                    Aplikasi tetap berjalan, tetapi ada komponen yang gagal dimuat. Silakan muat ulang halaman.
                                </p>
                                {this.state.error?.message && (
                                    <p className="mt-2 text-xs text-rose-700">
                                        Detail: {this.state.error.message}
                                    </p>
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                            <RefreshCw size={16} />
                            Muat Ulang
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default AppErrorBoundary;
