import { Plus, Trash2, Calendar, Clock } from 'lucide-react';

export const formatRupiah = (num) => {
    if (!num && num !== 0) return 'Rp 0';
    return 'Rp ' + Number(num).toLocaleString('id-ID');
};

/**
 * Normalize backend member/payroll record allowances into editable UI rows.
 */
export function normalizeAllowancesFromRecord(record) {
    if (Array.isArray(record?.allowances) && record.allowances.length > 0) {
        return record.allowances.map((item) => ({
            nama: item.nama || '',
            jenis: item.jenis === 'harian' ? 'harian' : 'bulanan',
            nominal: item.nominal !== undefined && item.nominal !== null && Number(item.nominal) !== 0
                ? String(Number(item.nominal))
                : '',
        }));
    }

    const legacyAllowance = Number(record?.tunjangan || 0);
    if (legacyAllowance > 0) {
        return [{
            nama: 'Tunjangan Bulanan',
            jenis: 'bulanan',
            nominal: String(legacyAllowance),
        }];
    }

    return [];
}

/**
 * Summarize monthly fixed vs daily per-attendance allowance totals from UI rows.
 */
export function summarizeAllowances(items = []) {
    return items.reduce(
        (acc, item) => {
            const amount = Math.max(0, parseFloat(item?.nominal) || 0);
            if ((item?.jenis || 'bulanan') === 'harian') {
                acc.dailyRate += amount;
                acc.dailyCount += 1;
            } else {
                acc.monthlyTotal += amount;
                acc.monthlyCount += 1;
            }
            return acc;
        },
        { monthlyTotal: 0, dailyRate: 0, monthlyCount: 0, dailyCount: 0 }
    );
}

/**
 * Serialize UI allowance rows for API submission.
 * Blank empty rows are dropped; rows with a nominal or name keep clean defaults.
 */
export function serializeAllowancesPayload(items = []) {
    return items
        .map((item) => {
            const jenis = item?.jenis === 'harian' ? 'harian' : 'bulanan';
            const rawName = (item?.nama || '').trim();
            const nominal = Math.max(0, parseFloat(item?.nominal) || 0);

            if (!rawName && nominal <= 0) {
                return null;
            }

            return {
                nama: rawName || (jenis === 'harian' ? 'Tunjangan Harian' : 'Tunjangan Bulanan'),
                jenis,
                nominal,
            };
        })
        .filter(Boolean);
}

/**
 * Shared dynamic editor for multiple monthly & daily attendance-based allowances.
 */
export default function PayrollAllowancesEditor({
    allowances = [],
    onChange,
    gajiPokok = 0,
}) {
    const numericPokok = Math.max(0, parseFloat(gajiPokok) || 0);
    const { monthlyTotal, dailyRate } = summarizeAllowances(allowances);
    const totalBulananTetap = numericPokok + monthlyTotal;

    const handleAddRow = (jenis = 'bulanan') => {
        onChange([
            ...allowances,
            {
                nama: '',
                jenis,
                nominal: '',
            },
        ]);
    };

    const handleUpdateRow = (index, field, value) => {
        const next = allowances.map((row, idx) => (idx === index ? { ...row, [field]: value } : row));
        onChange(next);
    };

    const handleRemoveRow = (index) => {
        onChange(allowances.filter((_, idx) => idx !== index));
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold text-blue-900">
                        Daftar Tunjangan (Bisa Lebih dari 1)
                    </p>
                    <p className="text-[11px] text-blue-700/80">
                        <strong>Bulanan</strong>: diterima tetap tiap bulan •{' '}
                        <strong>Harian</strong>: nominal × jumlah hari masuk absensi
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => handleAddRow('bulanan')}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 transition"
                    >
                        <Plus size={12} /> Tunjangan Bulanan
                    </button>
                    <button
                        type="button"
                        onClick={() => handleAddRow('harian')}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition"
                    >
                        <Plus size={12} /> Tunjangan Harian
                    </button>
                </div>
            </div>

            {allowances.length === 0 ? (
                <div className="rounded-lg border border-dashed border-blue-200 bg-white/80 px-3 py-2.5 text-center text-xs text-gray-500">
                    Belum ada tunjangan. Klik tombol di atas untuk menambah tunjangan bulanan atau harian.
                </div>
            ) : (
                <div className="space-y-2">
                    {allowances.map((item, idx) => (
                        <div
                            key={idx}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center rounded-xl border border-blue-100 bg-white p-2"
                        >
                            <div className="sm:col-span-5">
                                <input
                                    type="text"
                                    value={item.nama}
                                    onChange={(e) => handleUpdateRow(idx, 'nama', e.target.value)}
                                    placeholder={item.jenis === 'harian' ? 'Cth: Uang Makan / BBM' : 'Cth: Tunjangan Jabatan'}
                                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="sm:col-span-3">
                                <select
                                    value={item.jenis}
                                    onChange={(e) => handleUpdateRow(idx, 'jenis', e.target.value)}
                                    className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 ${
                                        item.jenis === 'harian'
                                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                                            : 'border-blue-200 bg-blue-50 text-blue-800'
                                    }`}
                                >
                                    <option value="bulanan">Bulanan (Tetap)</option>
                                    <option value="harian">Harian (× Masuk)</option>
                                </select>
                            </div>
                            <div className="sm:col-span-3">
                                <div className="relative">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">Rp</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={item.nominal}
                                        onChange={(e) => handleUpdateRow(idx, 'nominal', e.target.value)}
                                        placeholder="0"
                                        className="w-full rounded-lg border border-gray-200 pl-7 pr-2 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="sm:col-span-1 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => handleRemoveRow(idx)}
                                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                                    title="Hapus Tunjangan"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="rounded-lg border border-blue-200/70 bg-white/80 px-3 py-2 space-y-1 text-xs">
                <div className="flex items-center justify-between text-blue-800">
                    <span className="inline-flex items-center gap-1">
                        <Calendar size={12} className="text-blue-600" /> Total Gaji Tetap / Bulan (Pokok + Tunj. Bulanan):
                    </span>
                    <span className="font-bold text-blue-900">{formatRupiah(totalBulananTetap)} / bulan</span>
                </div>
                {dailyRate > 0 && (
                    <div className="flex items-center justify-between text-amber-800">
                        <span className="inline-flex items-center gap-1">
                            <Clock size={12} className="text-amber-600" /> Tarif Tunjangan Harian (dikalikan hari masuk):
                        </span>
                        <span className="font-bold text-amber-900">+{formatRupiah(dailyRate)} / hari masuk</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Compact display list of monthly and daily allowances for tables & detail views.
 */
export function AllowanceTagList({ allowances = [], fallbackMonthlyTotal = 0, align = 'left' }) {
    if (!Array.isArray(allowances) || allowances.length === 0) {
        return (
            <span className="font-medium text-gray-600">
                {formatRupiah(fallbackMonthlyTotal || 0)}
            </span>
        );
    }

    return (
        <div className={`flex flex-col gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
            {allowances.map((item, idx) => {
                const isDaily = item.jenis === 'harian';
                return (
                    <span
                        key={item.id ?? `${item.nama}-${idx}`}
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                            isDaily
                                ? 'bg-amber-50 text-amber-800 border border-amber-200/80'
                                : 'bg-purple-50 text-purple-800 border border-purple-200/80'
                        }`}
                    >
                        <span>{item.nama}:</span>
                        <span className="font-semibold">
                            {formatRupiah(item.nominal)}/{isDaily ? 'hr' : 'bln'}
                        </span>
                    </span>
                );
            })}
        </div>
    );
}

/**
 * Itemized salary + monthly/daily allowance calculation rows.
 */
export function SalaryBreakdownItems({ breakdown }) {
    if (!breakdown) return null;

    const gajiPokok = Number(breakdown.gaji_pokok || 0);
    const items = Array.isArray(breakdown.items) ? breakdown.items : [];
    const attendanceDays = Number(breakdown.attendance_days ?? 0);

    return (
        <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between text-gray-700">
                <span>Gaji Pokok Bulanan</span>
                <span className="font-semibold text-gray-900">{formatRupiah(gajiPokok)}</span>
            </div>
            {items.map((item, idx) => {
                const isDaily = item.jenis === 'harian';
                return (
                    <div key={item.id ?? `${item.nama}-${idx}`} className="flex items-center justify-between gap-2 text-gray-700">
                        <span className="truncate">
                            {item.nama}{' '}
                            <span className={`text-[11px] font-medium ${isDaily ? 'text-amber-700' : 'text-purple-700'}`}>
                                ({isDaily
                                    ? `Harian: ${item.multiplier ?? attendanceDays} hr × ${formatRupiah(item.nominal)}`
                                    : 'Bulanan Tetap'})
                            </span>
                        </span>
                        <span className="font-semibold text-gray-900 whitespace-nowrap">
                            {formatRupiah(item.subtotal)}
                        </span>
                    </div>
                );
            })}
            {items.length === 0 && (
                <div className="flex items-center justify-between text-gray-400">
                    <span>Tunjangan</span>
                    <span>Rp 0</span>
                </div>
            )}
        </div>
    );
}
