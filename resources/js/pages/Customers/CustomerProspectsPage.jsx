import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    UserCheck, Users, Clock, CheckCircle2, XCircle, 
    Trash2, Search, ArrowRight, ExternalLink, Phone, 
    MapPin, Wifi, Send, Eye, ShieldAlert, Loader2, RefreshCw
} from 'lucide-react';
import Button from '../../components/common/Button';
import Alert from '../../components/common/Alert';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';

function CustomerProspectsPage() {
    const navigate = useNavigate();
    const [prospects, setProspects] = useState([]);
    const [counts, setCounts] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, installed: 0 });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');
    const [search, setSearch] = useState('');
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    // Reject Modal state
    const [rejectModal, setRejectModal] = useState({ open: false, item: null, reason: '' });
    // Photo Preview Modal
    const [photoModal, setPhotoModal] = useState({ open: false, url: '', title: '' });

    useEffect(() => {
        fetchProspects();
    }, [activeTab]);

    const fetchProspects = async () => {
        setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams();
            if (activeTab !== 'all') queryParams.append('status', activeTab);
            if (search.trim()) queryParams.append('search', search.trim());

            const res = await fetch(`/api/customer-prospects?${queryParams.toString()}`);
            const json = await res.json();
            if (json.success) {
                setProspects(json.data || []);
                if (json.counts) setCounts(json.counts);
            } else {
                throw new Error(json.message || 'Gagal memuat data calon pelanggan');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        fetchProspects();
    };

    const handleUpdateStatus = async (id, status, reason = '') => {
        try {
            const res = await fetch(`/api/customer-prospects/${id}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body: JSON.stringify({ status, rejection_reason: reason }),
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Gagal memperbarui status');

            setSuccessMessage(`Status pendaftaran ${json.data?.registration_no || ''} berhasil diubah.`);
            setRejectModal({ open: false, item: null, reason: '' });
            fetchProspects();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (id, regNo) => {
        if (!window.confirm(`Hapus data pendaftaran calon pelanggan ${regNo}? Data yang dihapus tidak dapat dipulihkan.`)) {
            return;
        }

        try {
            const res = await fetch(`/api/customer-prospects/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Gagal menghapus');

            setSuccessMessage('Data calon pelanggan berhasil dihapus dari antrean.');
            fetchProspects();
        } catch (err) {
            setError(err.message);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800"><Clock size={12} /> Menunggu Verifikasi</span>;
            case 'approved':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800"><CheckCircle2 size={12} /> Disetujui (Siap Pasang)</span>;
            case 'rejected':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800"><XCircle size={12} /> Ditolak / Batal Pasang</span>;
            case 'installed':
                return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800"><CheckCircle2 size={12} /> Selesai Terpasang</span>;
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                <UserCheck size={26} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Verifikasi Pendaftaran Calon Pelanggan</h1>
                                <p className="text-sm text-gray-500">
                                    Validasi calon pelanggan masuk, atur status siap pasang atau batalkan agar antrean tidak menumpuk.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <Link to="/customer-verification/register">
                            <Button variant="primary" className="bg-blue-600 hover:bg-blue-700 text-xs font-bold px-4 py-2.5">
                                + Pasang Pelanggan Baru
                            </Button>
                        </Link>
                        <a
                            href="/registrasi"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 transition"
                            title="Buka Halaman Form Publik"
                        >
                            <ExternalLink size={14} /> Form Publik
                        </a>
                    </div>
                </div>

                {/* Counter Statistics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`p-4 rounded-2xl border text-left transition ${
                            activeTab === 'pending'
                                ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300'
                        }`}
                    >
                        <p className={`text-xs font-medium ${activeTab === 'pending' ? 'text-amber-100' : 'text-gray-500'}`}>Menunggu Verifikasi</p>
                        <p className="text-2xl font-black mt-1">{counts.pending}</p>
                    </button>

                    <button
                        onClick={() => setActiveTab('approved')}
                        className={`p-4 rounded-2xl border text-left transition ${
                            activeTab === 'approved'
                                ? 'bg-green-600 text-white border-green-600 shadow-md shadow-green-600/20'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-green-300'
                        }`}
                    >
                        <p className={`text-xs font-medium ${activeTab === 'approved' ? 'text-green-100' : 'text-gray-500'}`}>Disetujui / Siap Pasang</p>
                        <p className="text-2xl font-black mt-1">{counts.approved}</p>
                    </button>

                    <button
                        onClick={() => setActiveTab('rejected')}
                        className={`p-4 rounded-2xl border text-left transition ${
                            activeTab === 'rejected'
                                ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/20'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-red-300'
                        }`}
                    >
                        <p className={`text-xs font-medium ${activeTab === 'rejected' ? 'text-red-100' : 'text-gray-500'}`}>Ditolak / Batal Pasang</p>
                        <p className="text-2xl font-black mt-1">{counts.rejected}</p>
                    </button>

                    <button
                        onClick={() => setActiveTab('all')}
                        className={`p-4 rounded-2xl border text-left transition ${
                            activeTab === 'all'
                                ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                    >
                        <p className={`text-xs font-medium ${activeTab === 'all' ? 'text-gray-300' : 'text-gray-500'}`}>Total Pendaftaran</p>
                        <p className="text-2xl font-black mt-1">{counts.total}</p>
                    </button>
                </div>

                {error && <Alert variant="error" className="mb-4">{error}</Alert>}
                {successMessage && <Alert variant="success" className="mb-4">{successMessage}</Alert>}

                {/* Search Bar */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <form onSubmit={handleSearchSubmit} className="relative w-full sm:max-w-md">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cari nama, WhatsApp, No Reg, alamat..."
                            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                    </form>

                    <button
                        type="button"
                        onClick={fetchProspects}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Muat Ulang
                    </button>
                </div>

                {/* Prospect Cards Grid */}
                {loading ? (
                    <div className="py-16 text-center">
                        <LoadingSpinner text="Memuat daftar calon pelanggan..." />
                    </div>
                ) : prospects.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center space-y-3">
                        <div className="w-14 h-14 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto">
                            <Users size={28} />
                        </div>
                        <h3 className="text-base font-bold text-gray-800">Tidak ada data pendaftaran</h3>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto">
                            Tidak ditemukan pendaftaran calon pelanggan pada kategori status ini.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {prospects.map((item) => {
                            const waNumber = item.no_telp?.replace(/[^0-9]/g, '');
                            const waClean = waNumber?.startsWith('0') ? '62' + waNumber.substring(1) : waNumber;
                            const waUrl = `https://wa.me/${waClean}?text=${encodeURIComponent(`Halo Kak ${item.nama}, kami dari Rumah Kita Net terkait pendaftaran internet ${item.registration_no}...`)}`;

                            return (
                                <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition">
                                    <div className="p-5 space-y-3.5">
                                        {/* Top Card Info */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                                                    {item.registration_no}
                                                </span>
                                                <h3 className="text-base font-bold text-gray-900 mt-1">{item.nama}</h3>
                                            </div>
                                            <div>{getStatusBadge(item.status)}</div>
                                        </div>

                                        {/* Phone & WA */}
                                        <div className="flex items-center justify-between text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                                            <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                                                <Phone size={14} className="text-gray-400" />
                                                {item.no_telp}
                                            </span>
                                            <a
                                                href={waUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-[11px] shadow-sm transition"
                                            >
                                                <Send size={11} /> Chat WA
                                            </a>
                                        </div>

                                        {/* Address & Wilayah */}
                                        <div className="space-y-1 text-xs text-gray-600">
                                            <div className="flex items-start gap-1.5">
                                                <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                                                <div>
                                                    <span className="font-medium text-gray-800">
                                                        {item.dusun?.name ? `Dusun ${item.dusun.name}, ` : ''}
                                                        {item.desa?.name ? `Desa ${item.desa.name}, ` : ''}
                                                        {item.kecamatan?.name || '-'}
                                                    </span>
                                                    {item.alamat && <p className="text-gray-500 mt-0.5">{item.alamat}</p>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 pt-1">
                                                <Wifi size={14} className="text-indigo-500 shrink-0" />
                                                <span className="font-semibold text-indigo-700">Paket: {item.paket || item.paket_custom || 'Standar'}</span>
                                            </div>
                                        </div>

                                        {/* Foto Depan Rumah Thumbnail */}
                                        {item.foto_depan_rumah && (
                                            <div className="pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setPhotoModal({ open: true, url: item.foto_depan_rumah, title: `Foto Depan Rumah - ${item.nama}` })}
                                                    className="relative w-full h-24 rounded-xl overflow-hidden group border border-gray-200 block"
                                                >
                                                    <img src={item.foto_depan_rumah} alt="Depan Rumah" className="w-full h-full object-cover group-hover:scale-105 transition" />
                                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition">
                                                        <Eye size={16} className="mr-1" /> Lihat Foto Rumah
                                                    </div>
                                                </button>
                                            </div>
                                        )}

                                        {item.rejection_reason && (
                                            <div className="p-2.5 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700">
                                                <span className="font-bold">Alasan Dibatalkan:</span> {item.rejection_reason}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Bar Footer */}
                                    <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-2">
                                        {item.status === 'pending' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateStatus(item.id, 'approved')}
                                                    className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                                                >
                                                    <CheckCircle2 size={14} /> Setujui (Siap Pasang)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setRejectModal({ open: true, item, reason: '' })}
                                                    className="py-2 px-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold transition"
                                                >
                                                    Tolak / Batal
                                                </button>
                                            </>
                                        )}

                                        {item.status === 'approved' && (
                                            <>
                                                <Link
                                                    to={`/customer-verification/register?prospect_id=${item.id}`}
                                                    className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                                                >
                                                    Lanjut Daftarkan & Pasang →
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => setRejectModal({ open: true, item, reason: '' })}
                                                    className="py-2 px-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl text-xs transition"
                                                    title="Batalkan Pemasangan"
                                                >
                                                    Batal
                                                </button>
                                            </>
                                        )}

                                        {(item.status === 'rejected' || item.status === 'installed') && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateStatus(item.id, 'pending')}
                                                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                                                >
                                                    Buka Kembali
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(item.id, item.registration_no)}
                                                    className="inline-flex items-center gap-1 py-1.5 px-3 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold transition"
                                                >
                                                    <Trash2 size={13} /> Hapus Data
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* REJECT / BATAL MODAL */}
            {rejectModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center gap-2 text-red-600">
                            <ShieldAlert size={24} />
                            <h3 className="text-lg font-bold text-gray-900">Batalkan / Tolak Pemasangan</h3>
                        </div>
                        <p className="text-xs text-gray-600">
                            Calon pelanggan <span className="font-bold">{rejectModal.item?.nama}</span> ({rejectModal.item?.registration_no}) akan dipindahkan ke status Ditolak/Batal agar tidak menumpuk di antrean operasional.
                        </p>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Alasan Pembatalan / Penolakan
                            </label>
                            <input
                                type="text"
                                value={rejectModal.reason}
                                onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
                                placeholder="Contoh: Belum ada jalur ODP / Pelanggan membatalkan"
                                className="w-full rounded-xl border border-gray-300 px-3.5 py-2 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                variant="secondary"
                                onClick={() => setRejectModal({ open: false, item: null, reason: '' })}
                            >
                                Tutup
                            </Button>
                            <Button
                                variant="danger"
                                onClick={() => handleUpdateStatus(rejectModal.item?.id, 'rejected', rejectModal.reason)}
                                className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                            >
                                Konfirmasi Batalkan
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* PHOTO PREVIEW MODAL */}
            {photoModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={() => setPhotoModal({ open: false, url: '', title: '' })}>
                    <div className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h4 className="text-sm font-bold text-gray-900">{photoModal.title}</h4>
                            <button onClick={() => setPhotoModal({ open: false, url: '', title: '' })} className="text-gray-400 hover:text-gray-600 font-bold text-sm">✕</button>
                        </div>
                        <img src={photoModal.url} alt="Preview" className="w-full max-h-[70vh] object-contain rounded-xl" />
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerProspectsPage;
