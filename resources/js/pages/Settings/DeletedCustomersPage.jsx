import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    Trash2,
    RotateCcw,
    Search,
    RefreshCw,
    User,
    Calendar,
    MapPin,
    Wifi,
    AlertCircle,
    CheckCircle2,
    ArrowLeft,
    Phone,
    ShieldAlert,
    ChevronLeft,
    ChevronRight,
    Info,
} from 'lucide-react';
import customerService from '../../services/customerService';
import Alert from '../../components/common/Alert';

export default function DeletedCustomersPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [restoringId, setRestoringId] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);
    const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });

    const loadData = async (targetPage = page, targetSearch = search, targetPerPage = perPage) => {
        try {
            setLoading(true);
            setError('');
            const res = await customerService.getDeletedCustomers({
                page: targetPage,
                search: targetSearch,
                per_page: targetPerPage,
            });
            const payload = res?.data;
            setRows(payload?.data || []);
            setPagination({
                current_page: payload?.current_page || 1,
                last_page: payload?.last_page || 1,
                total: payload?.total || 0,
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat riwayat pelanggan yang dihapus.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(page, search, perPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, perPage]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setPage(1);
        loadData(1, search, perPage);
    };

    const handleResetSearch = () => {
        setSearch('');
        setPage(1);
        loadData(1, '', perPage);
    };

    const handleRestore = async (customer) => {
        const confirmMsg = `Pulihkan pelanggan "${customer.name}"?\n\nPelanggan ini akan kembali aktif dan muncul di halaman Daftar Pelanggan. Seluruh riwayat tagihan dan paket tetap utuh.`;
        if (!window.confirm(confirmMsg)) return;

        try {
            setRestoringId(customer.id);
            setError('');
            setSuccess('');
            const res = await customerService.restoreCustomer(customer.id);
            setSuccess(res?.data?.message || `Pelanggan "${customer.name}" berhasil dipulihkan!`);
            // Reload list
            await loadData(page, search, perPage);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memulihkan pelanggan.');
        } finally {
            setRestoringId(null);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            return new Intl.DateTimeFormat('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }).format(date);
        } catch {
            return dateString;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-6">
            {/* TOP HEADER */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <Link
                            to="/pelanggan"
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition shrink-0 mt-0.5"
                            title="Kembali ke Daftar Pelanggan"
                        >
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                                    Riwayat Pelanggan Dihapus
                                </h1>
                                <span className="px-2.5 py-0.5 text-xs font-bold bg-rose-100 text-rose-700 rounded-full border border-rose-200">
                                    {pagination.total} Pelanggan
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                                Data pelanggan yang dihapus tetap tersimpan utuh di database (soft-delete). Riwayat invoice, pembayaran, dan teknis tidak hilang dan dapat dipulihkan sewaktu-waktu.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => loadData(page, search, perPage)}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs transition disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            Muat Ulang
                        </button>
                        <Link
                            to="/pelanggan"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition"
                        >
                            <User size={14} />
                            Daftar Pelanggan Aktif
                        </Link>
                    </div>
                </div>
            </div>

            {/* ALERTS */}
            {error && <Alert type="danger" message={error} onClose={() => setError('')} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

            {/* INFO BANNER */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs">
                <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                    <p className="font-bold text-amber-800">Keamanan Data Terjamin</p>
                    <p className="text-amber-700 leading-relaxed">
                        Fitur penghapusan pelanggan menggunakan mekanisme <em>Soft Delete</em>. Data historis penagihan, kwitansi, dan koordinat tetap tersimpan di server. Jika pelanggan ingin mengaktifkan layanan kembali, klik tombol <strong>Pulihkan</strong> pada baris pelanggan bersangkutan.
                    </p>
                </div>
            </div>

            {/* SEARCH & FILTER BAR */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative flex-1 w-full">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cari berdasarkan nama, PPPoE, nomor WA, alamat, atau kode area..."
                            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <select
                            value={perPage}
                            onChange={(e) => {
                                setPerPage(Number(e.target.value));
                                setPage(1);
                            }}
                            className="py-2 px-3 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-hidden focus:border-emerald-500"
                        >
                            <option value={10}>10 per halaman</option>
                            <option value={25}>25 per halaman</option>
                            <option value={50}>50 per halaman</option>
                            <option value={100}>100 per halaman</option>
                        </select>

                        <button
                            type="submit"
                            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition shrink-0"
                        >
                            Cari
                        </button>
                        {search && (
                            <button
                                type="button"
                                onClick={handleResetSearch}
                                className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shrink-0"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* DATA LIST TABLE */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                {loading ? (
                    <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
                        <RefreshCw size={28} className="animate-spin text-emerald-500" />
                        <p className="text-xs font-medium">Memuat data riwayat pelanggan dihapus...</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                            <Trash2 size={24} />
                        </div>
                        <h3 className="text-sm font-bold text-slate-700">Tidak Ada Pelanggan Dihapus</h3>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                            {search
                                ? `Tidak ditemukan data dengan kata kunci "${search}".`
                                : 'Belum ada data pelanggan yang dihapus di sistem ini. Semua data tersimpan aktif.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                                        <th className="py-3 px-4">Pelanggan</th>
                                        <th className="py-3 px-4">Paket / PPPoE</th>
                                        <th className="py-3 px-4">Wilayah / Alamat</th>
                                        <th className="py-3 px-4">Waktu Dihapus</th>
                                        <th className="py-3 px-4">Dihapus Oleh / Alasan</th>
                                        <th className="py-3 px-4 text-center">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map((cust) => (
                                        <tr key={cust.id} className="hover:bg-slate-50/70 transition">
                                            {/* PELANGGAN */}
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 font-extrabold flex items-center justify-center shrink-0 border border-rose-200">
                                                        {cust.name ? cust.name.charAt(0).toUpperCase() : 'C'}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-slate-800 text-xs">
                                                                {cust.name}
                                                            </span>
                                                            {cust.area_code && (
                                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                                                    {cust.area_code}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                                            <span className="font-mono">{cust.phone || '-'}</span>
                                                            {cust.phone && (
                                                                <a
                                                                    href={`https://wa.me/${cust.phone.replace(/[^0-9]/g, '')}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-emerald-600 hover:underline flex items-center gap-0.5"
                                                                >
                                                                    <Phone size={10} />
                                                                    WA
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* PAKET / PPPOE */}
                                            <td className="py-3.5 px-4">
                                                <div className="space-y-0.5">
                                                    <div className="font-semibold text-slate-700">
                                                        {cust.package?.name || cust.package_type || cust.custom_package || '-'}
                                                    </div>
                                                    {cust.pppoe_username && (
                                                        <div className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                                                            <Wifi size={10} className="text-slate-400" />
                                                            {cust.pppoe_username}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* WILAYAH / ALAMAT */}
                                            <td className="py-3.5 px-4 max-w-xs">
                                                <div className="text-[11px] text-slate-600 space-y-0.5">
                                                    <p className="truncate font-medium">{cust.address || '-'}</p>
                                                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                                        <MapPin size={10} />
                                                        {[
                                                            cust.dusun?.name ? `Dusun ${cust.dusun.name}` : null,
                                                            cust.desa?.name ? `Desa ${cust.desa.name}` : null,
                                                            cust.kecamatan?.name ? `Kec. ${cust.kecamatan.name}` : null,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(', ') || '-'}
                                                    </p>
                                                </div>
                                            </td>

                                            {/* WAKTU DIHAPUS */}
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                <div className="text-[11px] text-slate-600 flex items-center gap-1.5 font-medium">
                                                    <Calendar size={12} className="text-slate-400" />
                                                    {formatDate(cust.deleted_at)}
                                                </div>
                                            </td>

                                            {/* DIHAPUS OLEH & ALASAN */}
                                            <td className="py-3.5 px-4 max-w-xs">
                                                <div className="space-y-0.5 text-[11px]">
                                                    <div className="flex items-center gap-1 text-slate-700 font-semibold">
                                                        <User size={11} className="text-slate-400" />
                                                        <span>{cust.deleted_by?.name || 'Administrator'}</span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 italic truncate" title={cust.delete_reason || ''}>
                                                        {cust.delete_reason ? `"${cust.delete_reason}"` : 'Tidak ada keterangan'}
                                                    </p>
                                                </div>
                                            </td>

                                            {/* AKSI RESTORE */}
                                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRestore(cust)}
                                                    disabled={restoringId === cust.id}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold border border-emerald-200 transition text-[11px] shadow-2xs disabled:opacity-50"
                                                    title="Pulihkan pelanggan ini kembali ke daftar aktif"
                                                >
                                                    <RotateCcw size={12} className={restoringId === cust.id ? 'animate-spin' : ''} />
                                                    {restoringId === cust.id ? 'Memulihkan...' : 'Pulihkan'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* PAGINATION */}
                        {pagination.last_page > 1 && (
                            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                                <div>
                                    Menampilkan Halaman <strong>{pagination.current_page}</strong> dari <strong>{pagination.last_page}</strong> (Total <strong>{pagination.total}</strong> data)
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={pagination.current_page <= 1 || loading}
                                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span className="px-3 py-1 font-bold text-slate-700 bg-white border border-slate-200 rounded-lg">
                                        {pagination.current_page}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                                        disabled={pagination.current_page >= pagination.last_page || loading}
                                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
