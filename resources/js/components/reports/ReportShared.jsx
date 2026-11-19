import { Printer, FileSpreadsheet } from 'lucide-react';

/**
 * Export tabular rows to UTF-8 BOM CSV file (Excel-ready).
 */
export function exportRowsToCsv(filename, headers, rows) {
    const escapeCell = (val) => {
        const str = val === null || val === undefined ? '' : String(val);
        if (/[",\n\r;]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const lines = [
        headers.map(escapeCell).join(','),
        ...rows.map((row) => row.map(escapeCell).join(',')),
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Format human-readable Indonesian labels for technical budget/profitability statuses.
 */
export function formatReportStatusLabel(status) {
    const map = {
        aman: 'Aman',
        waspada: 'Waspada',
        defisit: 'Defisit',
        lewat_budget: 'Lewat Budget',
        unconfigured: 'Belum Diatur',
        untung: 'Untung',
        rugi: 'Rugi',
        impas: 'Impas',
        on_track: 'Sesuai Target',
        over_budget: 'Melebihi Target',
        under_budget: 'Di Bawah Target',
    };
    const key = String(status || '').toLowerCase();
    return map[key] || (status ? String(status).replace(/_/g, ' ') : '-');
}

export function ReportActionBar({ onExportCsv, onPrint = () => window.print(), csvLabel = 'Export CSV', printLabel = 'Cetak', disabled = false }) {
    return (
        <div className="no-print flex flex-wrap items-center gap-2">
            {onExportCsv && (
                <button
                    type="button"
                    onClick={onExportCsv}
                    disabled={disabled}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
                >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <span>{csvLabel}</span>
                </button>
            )}
            <button
                type="button"
                onClick={onPrint}
                disabled={disabled}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
                <Printer className="h-4 w-4" />
                <span>{printLabel}</span>
            </button>
        </div>
    );
}

export function ReportPaginationBar({ page, totalItems, pageSize = 25, onPageChange }) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (totalItems <= pageSize) {
        return null;
    }

    const startItem = (page - 1) * pageSize + 1;
    const endItem = Math.min(totalItems, page * pageSize);

    return (
        <div className="no-print flex flex-col gap-2 border-t border-slate-200/80 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div>
                Menampilkan <span className="font-bold text-slate-900">{startItem}–{endItem}</span> dari{' '}
                <span className="font-bold text-slate-900">{totalItems}</span> data
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                    Sebelumnya
                </button>
                <span className="font-semibold text-slate-700">
                    Hal {page} / {totalPages}
                </span>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                    Berikutnya
                </button>
            </div>
        </div>
    );
}
