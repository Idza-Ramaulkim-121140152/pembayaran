import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, CheckCircle, Trash2, Users, Wallet, Calendar, X, ChevronDown, ChevronUp, Search, Clock, DollarSign } from 'lucide-react';

const API_HEADERS = () => ({
    'Content-Type': 'application/json',
    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content,
    'Accept': 'application/json',
});

const formatRupiah = (num) => {
    if (!num && num !== 0) return 'Rp 0';
    return 'Rp ' + Number(num).toLocaleString('id-ID');
};

const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ==================== ADD MEMBER MODAL ====================
function AddMemberModal({ isOpen, onClose, onSaved }) {
    const [nama, setNama] = useState('');
    const [telepon, setTelepon] = useState('');
    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!nama.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/payroll/members', {
                method: 'POST',
                headers: API_HEADERS(),
                body: JSON.stringify({ nama: nama.trim(), telepon: telepon.trim() || null }),
            });
            const data = await res.json();
            if (res.ok) {
                onSaved(data.data);
                setNama('');
                setTelepon('');
                onClose();
            } else {
                alert(data.message || 'Gagal menambahkan anggota');
            }
        } catch {
            alert('Terjadi kesalahan');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b">
                    <h3 className="text-lg font-bold text-gray-800">Tambah Anggota Baru</h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
                        <input type="text" value={nama} onChange={e => setNama(e.target.value)} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" autoFocus required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
                        <input type="text" value={telepon} onChange={e => setTelepon(e.target.value)} className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Batal</button>
                        <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            {saving ? 'Menyimpan...' : 'Simpan'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ==================== PAY MEMBER MODAL ====================
function PayMemberModal({ isOpen, onClose, onPaid, member }) {
    const [nominal, setNominal] = useState('');
    const [catatan, setCatatan] = useState('');
    const [saving, setSaving] = useState(false);
    const [payments, setPayments] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loanContext, setLoanContext] = useState(null);
    const [loanHandling, setLoanHandling] = useState('cash');
    const [loanDeductionAmount, setLoanDeductionAmount] = useState('');
    const [loanChoicePromptOpen, setLoanChoicePromptOpen] = useState(false);

    useEffect(() => {
        if (isOpen && member) {
            setNominal('');
            setCatatan('');
            const initialLoanContext = Number(member.borrower_outstanding || 0) > 0 ? {
                borrower: member.borrower || null,
                outstanding: Number(member.borrower_outstanding || 0),
            } : null;
            setLoanContext(initialLoanContext);
            setLoanHandling('cash');
            setLoanDeductionAmount('');
            setLoanChoicePromptOpen(Boolean(initialLoanContext));
            // Load riwayat pembayaran
            setLoadingHistory(true);
            fetch(`/api/payroll/members/${member.id}/payments`, {
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin',
            })
                .then(r => r.ok ? r.json() : { payments: [] })
                .then(d => {
                    setPayments(d.payments || []);
                    if (Number(d.loan_context?.outstanding || 0) > 0) {
                        setLoanContext(d.loan_context);
                        setLoanChoicePromptOpen(true);
                    }
                })
                .catch(() => setPayments([]))
                .finally(() => setLoadingHistory(false));
        }
    }, [isOpen, member]);

    if (!isOpen || !member) return null;

    const unpaid = Number(member.total_unpaid) || 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        const amount = parseFloat(nominal);
        if (!amount || amount <= 0) return alert('Masukkan nominal yang valid');
        if (amount > unpaid) return alert('Nominal melebihi sisa saldo (' + formatRupiah(unpaid) + ')');

        const loanOutstanding = Number(loanContext?.outstanding || 0);
        const rawDeduction = Number(loanDeductionAmount || 0);
        const requestedDeduction = loanHandling === 'deduct_loan' ? rawDeduction : 0;

        if (loanHandling === 'deduct_loan' && requestedDeduction <= 0) {
            return alert('Masukkan nominal potong pinjaman yang valid');
        }

        if (loanHandling === 'deduct_loan' && requestedDeduction > amount) {
            return alert('Nominal bayar pinjaman tidak boleh lebih besar dari jumlah payroll');
        }

        if (loanHandling === 'deduct_loan' && requestedDeduction > loanOutstanding) {
            return alert('Nominal bayar pinjaman tidak boleh lebih besar dari sisa pinjaman');
        }

        if (loanHandling === 'deduct_loan') {
            const ok = window.confirm(`Bayar pinjaman ${formatRupiah(requestedDeduction)} dari pembayaran payroll ini?`);
            if (!ok) return;
        }

        setSaving(true);
        try {
            const res = await fetch(`/api/payroll/members/${member.id}/pay`, {
                method: 'POST',
                headers: API_HEADERS(),
                credentials: 'same-origin',
                body: JSON.stringify({
                    nominal: amount,
                    catatan: catatan.trim() || null,
                    loan_handling: loanHandling,
                    loan_deduction_amount: requestedDeduction,
                }),
            });
            const d = await res.json();
            if (res.ok) {
                onPaid();
                onClose();
            } else {
                alert(d.message || 'Gagal memproses pembayaran');
            }
        } catch {
            alert('Terjadi kesalahan');
        } finally {
            setSaving(false);
        }
    };

    const handlePayFull = () => {
        setNominal(String(unpaid));
        if (loanHandling === 'deduct_loan' && loanContext?.outstanding) {
            setLoanDeductionAmount(String(Math.min(unpaid, Number(loanContext.outstanding || 0))));
        }
    };

    const chooseCashPayroll = () => {
        setLoanHandling('cash');
        setLoanDeductionAmount('');
        setLoanChoicePromptOpen(false);
    };

    const chooseLoanDeduction = () => {
        const amount = Number(nominal || unpaid || 0);
        setLoanHandling('deduct_loan');
        setLoanDeductionAmount(String(Math.min(amount, Number(loanContext?.outstanding || 0))));
        setLoanChoicePromptOpen(false);
    };
    const maxLoanDeduction = Math.min(Number(nominal || unpaid || 0), Number(loanContext?.outstanding || 0));

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 sm:py-10">
            <div className="my-0 flex max-h-[calc(100vh-4rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:max-h-[calc(100vh-5rem)]">
                <div className="shrink-0 flex items-center justify-between border-b bg-white p-5">
                    <h3 className="text-lg font-bold text-gray-800">Bayar - {member.nama}</h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={20} /></button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {/* Saldo Info */}
                    <div className="mx-5 mt-5 bg-orange-50 border border-orange-200 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-orange-700">Sisa Belum Dibayar</span>
                            <span className="text-lg font-bold text-orange-600">{formatRupiah(unpaid)}</span>
                        </div>
                        {Number(member.total_paid) > 0 && (
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-gray-500">Total Sudah Dibayar</span>
                                <span className="text-sm font-medium text-green-600">{formatRupiah(member.total_paid)}</span>
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nominal Pembayaran *</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">Rp</span>
                            <input
                                type="number"
                                value={nominal}
                                onChange={e => setNominal(e.target.value)}
                                placeholder="0"
                                min="1"
                                max={unpaid}
                                className="w-full border rounded-lg pl-10 pr-3 py-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-semibold"
                                autoFocus
                                required
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handlePayFull}
                            className="mt-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                            Bayar penuh ({formatRupiah(unpaid)})
                        </button>
                    </div>
                    {Number(loanContext?.outstanding || 0) > 0 && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-3">
                            <div>
                                <p className="text-sm font-semibold text-blue-900">Karyawan punya pinjaman aktif</p>
                                <p className="text-xs text-blue-700">
                                    {loanContext?.borrower?.name || member.nama} masih memiliki sisa pinjaman {formatRupiah(loanContext.outstanding)}.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLoanHandling('deduct_loan');
                                        const amount = Number(nominal || unpaid || 0);
                                        setLoanDeductionAmount(String(Math.min(amount, Number(loanContext.outstanding || 0))));
                                    }}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold border transition ${
                                        loanHandling === 'deduct_loan'
                                            ? 'bg-white border-blue-500 text-blue-700'
                                            : 'border-transparent bg-blue-100 text-blue-700'
                                    }`}
                                >
                                    Bayar pinjaman
                                </button>
                                <button
                                    type="button"
                                    onClick={chooseCashPayroll}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold border transition ${
                                        loanHandling === 'cash'
                                            ? 'bg-white border-green-400 text-green-700'
                                            : 'border-transparent bg-blue-100 text-blue-700'
                                    }`}
                                >
                                    Tidak
                                </button>
                            </div>
                            {loanHandling === 'deduct_loan' && (
                                <div>
                                    <label className="block text-xs font-medium text-blue-900 mb-1">Nominal Bayar Pinjaman</label>
                                    <input
                                        type="number"
                                        value={loanDeductionAmount}
                                        onChange={(e) => setLoanDeductionAmount(e.target.value)}
                                        min="1"
                                        max={maxLoanDeduction}
                                        className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <p className="mt-1 text-xs text-blue-700">
                                        Maksimal {formatRupiah(maxLoanDeduction)} atau tidak lebih dari jumlah payroll.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                        <input
                            type="text"
                            value={catatan}
                            onChange={e => setCatatan(e.target.value)}
                            placeholder="Catatan pembayaran (opsional)"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                    </div>

                    {/* Preview */}
                    {nominal && parseFloat(nominal) > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Gross payroll:</span>
                                <span className="font-bold text-green-700">{formatRupiah(parseFloat(nominal))}</span>
                            </div>
                            {loanHandling === 'deduct_loan' && (
                                <>
                                    <div className="flex justify-between text-sm mt-1">
                                        <span className="text-gray-600">Potong pinjaman:</span>
                                        <span className="font-semibold text-blue-700">{formatRupiah(Number(loanDeductionAmount || 0))}</span>
                                    </div>
                                    <div className="flex justify-between text-sm mt-1">
                                        <span className="text-gray-600">Tunai keluar:</span>
                                        <span className="font-semibold text-gray-700">{formatRupiah(Math.max(0, parseFloat(nominal) - Number(loanDeductionAmount || 0)))}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between text-sm mt-1">
                                <span className="text-gray-600">Sisa setelah bayar:</span>
                                <span className="font-semibold text-gray-700">{formatRupiah(Math.max(0, unpaid - parseFloat(nominal)))}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 justify-end pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Batal</button>
                        <button type="submit" disabled={saving} className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                            {saving ? 'Memproses...' : 'Bayar'}
                        </button>
                    </div>
                    </form>

                    {/* Riwayat Pembayaran */}
                    {payments.length > 0 && (
                        <div className="border-t px-5 pb-5 pt-4">
                            <h4 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                                <Clock size={14} /> Riwayat Pembayaran
                            </h4>
                            <div className="max-h-40 overflow-y-auto space-y-2">
                                {payments.map(p => (
                                    <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
	                                        <div>
	                                            <span className="text-sm font-medium text-green-700">{formatRupiah(p.nominal)}</span>
	                                            {Number(p.loan_deduction_amount || 0) > 0 && (
	                                                <p className="text-xs text-blue-600">
	                                                    Potong pinjaman {formatRupiah(p.loan_deduction_amount)} | Tunai {formatRupiah(p.cash_paid_amount)}
	                                                </p>
	                                            )}
	                                            {p.catatan && <p className="text-xs text-gray-400">{p.catatan}</p>}
	                                        </div>
                                        <span className="text-xs text-gray-400">{formatDate(p.created_at)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {loadingHistory && (
                        <div className="border-t px-5 pb-5 pt-4 text-center">
                            <p className="text-xs text-gray-400">Memuat riwayat...</p>
                        </div>
                    )}
                </div>
            </div>

            {loanChoicePromptOpen && Number(loanContext?.outstanding || 0) > 0 && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
                    <div className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-5 shadow-2xl">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-base font-bold text-slate-900">Pilihan pinjaman</p>
                            <button
                                type="button"
                                onClick={chooseCashPayroll}
                                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                                aria-label="Tutup pilihan pinjaman"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                            <p className="text-sm font-bold text-blue-900">Karyawan memiliki pinjaman aktif</p>
                            <p className="mt-1 text-sm text-blue-700">
                                {loanContext?.borrower?.name || member.nama} masih memiliki sisa pinjaman {formatRupiah(loanContext.outstanding)}.
                            </p>
                        </div>
                        <p className="text-sm text-gray-600">
                            Fitur ini tidak wajib. Jika pilih bayar pinjaman, Anda bisa mengisi nominalnya di form dengan batas tidak lebih besar dari jumlah payroll.
                        </p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={chooseLoanDeduction}
                                className="rounded-2xl border border-blue-200 bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                            >
                                Bayar pinjaman
                            </button>
                            <button
                                type="button"
                                onClick={chooseCashPayroll}
                                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                            >
                                Tidak
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== PROJECT FORM MODAL ====================
function ProjectFormModal({ isOpen, onClose, onSaved, editProject, allMembers, inventoryItems, onAddMember }) {
    const [tanggal, setTanggal] = useState('');
    const [catatan, setCatatan] = useState('');
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [details, setDetails] = useState([
        { tipe: 'pemasangan', deskripsi: '', inventory_item_id: '', jumlah: '', harga_satuan: 30000 },
        { tipe: 'kabel', deskripsi: '', inventory_item_id: '', jumlah: '', harga_satuan: 150 },
    ]);
    const [saving, setSaving] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (editProject) {
                setTanggal(editProject.tanggal?.split('T')[0] || '');
                setCatatan(editProject.catatan || '');
                setSelectedMembers(editProject.members?.map(m => m.id) || []);
                if (editProject.details?.length > 0) {
                    setDetails(editProject.details.map(d => ({
                        tipe: d.tipe,
                        deskripsi: d.deskripsi || '',
                        inventory_item_id: d.inventory_item_id || '',
                        jumlah: d.jumlah,
                        harga_satuan: d.harga_satuan,
                    })));
                }
            } else {
                setTanggal(new Date().toISOString().split('T')[0]);
                setCatatan('');
                setSelectedMembers([]);
                setDetails([
                    { tipe: 'pemasangan', deskripsi: '', inventory_item_id: '', jumlah: '', harga_satuan: 30000 },
                    { tipe: 'kabel', deskripsi: '', inventory_item_id: '', jumlah: '', harga_satuan: 150 },
                ]);
            }
            setMemberSearch('');
        }
    }, [isOpen, editProject]);

    if (!isOpen) return null;

    const toggleMember = (id) => {
        setSelectedMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };

    const updateDetail = (index, field, value) => {
        setDetails(prev => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: value };
            return copy;
        });
    };

    const addCustomDetail = () => {
        setDetails(prev => [...prev, { tipe: 'kustom', deskripsi: '', inventory_item_id: '', jumlah: '', harga_satuan: '' }]);
    };

    const removeDetail = (index) => {
        setDetails(prev => prev.filter((_, i) => i !== index));
    };

    const totalProyek = details.reduce((sum, d) => {
        const qty = parseFloat(d.jumlah) || 0;
        const price = parseFloat(d.harga_satuan) || 0;
        return sum + (qty * price);
    }, 0);

    const perMember = selectedMembers.length > 0 ? Math.floor(totalProyek / selectedMembers.length) : 0;

    const filteredMembers = allMembers.filter(m => m.nama.toLowerCase().includes(memberSearch.toLowerCase()));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (selectedMembers.length === 0) return alert('Pilih minimal 1 anggota');
        const validDetails = details.filter(d => parseFloat(d.jumlah) > 0 && parseFloat(d.harga_satuan) > 0);
        if (validDetails.length === 0) return alert('Isi minimal 1 detail proyek');

        setSaving(true);
        try {
            const url = editProject ? `/api/payroll/projects/${editProject.id}` : '/api/payroll/projects';
            const method = editProject ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: API_HEADERS(),
                body: JSON.stringify({
                    tanggal,
                    catatan: catatan || null,
                    member_ids: selectedMembers,
                    details: validDetails.map(d => ({
                        tipe: d.tipe,
                        deskripsi: d.deskripsi || null,
                        inventory_item_id: d.inventory_item_id ? Number(d.inventory_item_id) : null,
                        jumlah: parseFloat(d.jumlah),
                        harga_satuan: parseFloat(d.harga_satuan),
                    })),
                }),
            });
            const data = await res.json();
            if (res.ok) {
                onSaved();
                onClose();
            } else {
                alert(data.message || 'Gagal menyimpan proyek');
            }
        } catch {
            alert('Terjadi kesalahan');
        } finally {
            setSaving(false);
        }
    };

    const detailLabel = (tipe) => {
        switch (tipe) {
            case 'pemasangan': return 'Pemasangan';
            case 'kabel': return 'Kabel (meter)';
            case 'kustom': return 'Kustom';
            default: return tipe;
        }
    };

    const inventoryLabel = (item) => {
        if (!item) return '';
        return `${item.name} (${item.type_name || 'Tanpa jenis'})`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
                <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl z-10">
                    <h3 className="text-lg font-bold text-gray-800">{editProject ? 'Edit Proyek' : 'Tambah Proyek'}</h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-6">
                    {/* Tanggal */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            <Calendar size={16} className="inline mr-1" /> Tanggal
                        </label>
                        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} required className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                    </div>

                    {/* Anggota */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700">
                                <Users size={16} className="inline mr-1" /> Anggota ({selectedMembers.length} dipilih)
                            </label>
                            <button type="button" onClick={onAddMember} className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                                <Plus size={14} /> Tambah Anggota
                            </button>
                        </div>
                        <div className="relative mb-2">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Cari anggota..."
                                value={memberSearch}
                                onChange={e => setMemberSearch(e.target.value)}
                                className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div className="border rounded-lg max-h-40 overflow-y-auto">
                            {filteredMembers.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-3">Belum ada anggota</p>
                            ) : filteredMembers.map(m => (
                                <label key={m.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedMembers.includes(m.id)}
                                        onChange={() => toggleMember(m.id)}
                                        className="rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-800">{m.nama}</span>
                                    {m.telepon && <span className="text-xs text-gray-400">{m.telepon}</span>}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Detail */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700">Detail Proyek</label>
                            <button type="button" onClick={addCustomDetail} className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                                <Plus size={14} /> Kustom
                            </button>
                        </div>
                        <div className="space-y-3">
                            {details.map((d, i) => (
                                <div key={i} className="border rounded-lg p-3 bg-gray-50">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-semibold text-gray-700">{detailLabel(d.tipe)}</span>
                                        {(d.tipe === 'kustom' || i > 1) && (
                                            <button type="button" onClick={() => removeDetail(i)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                                        )}
                                    </div>
                                    {d.tipe === 'kustom' && (
                                        <input
                                            type="text"
                                            placeholder="Deskripsi..."
                                            value={d.deskripsi}
                                            onChange={e => updateDetail(i, 'deskripsi', e.target.value)}
                                            className="w-full border rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    )}
                                    <div className="mb-2">
                                        <label className="text-xs text-gray-500">Barang Inventori (opsional)</label>
                                        <select
                                            value={d.inventory_item_id || ''}
                                            onChange={e => updateDetail(i, 'inventory_item_id', e.target.value)}
                                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="">Tanpa barang inventori</option>
                                            {inventoryItems.map(item => (
                                                <option key={item.id} value={item.id}>{inventoryLabel(item)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="text-xs text-gray-500">
                                                {d.tipe === 'kabel' ? 'Panjang (m)' : d.tipe === 'pemasangan' ? 'Jumlah' : 'Qty'}
                                            </label>
                                            <input
                                                type="number"
                                                step="any"
                                                min="0"
                                                placeholder="0"
                                                value={d.jumlah}
                                                onChange={e => updateDetail(i, 'jumlah', e.target.value)}
                                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Harga Satuan</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={d.harga_satuan}
                                                onChange={e => updateDetail(i, 'harga_satuan', e.target.value)}
                                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Subtotal</label>
                                            <div className="border rounded-lg px-3 py-2 text-sm bg-white text-gray-700 font-medium">
                                                {formatRupiah((parseFloat(d.jumlah) || 0) * (parseFloat(d.harga_satuan) || 0))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Catatan */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                        <textarea value={catatan} onChange={e => setCatatan(e.target.value)} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Catatan tambahan (opsional)" />
                    </div>

                    {/* Summary */}
                    <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">Total Proyek:</span>
                            <span className="font-bold text-gray-800">{formatRupiah(totalProyek)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Per Anggota ({selectedMembers.length} orang):</span>
                            <span className="font-bold text-blue-600">{formatRupiah(perMember)}</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-end pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Batal</button>
                        <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
                            {saving ? 'Menyimpan...' : 'Simpan'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ==================== MAIN PAYROLL PAGE ====================
export default function PayrollPage() {
    const [data, setData] = useState({ unpaid_summary: [], projects: [] });
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState([]);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showMemberModal, setShowMemberModal] = useState(false);
    const [editProject, setEditProject] = useState(null);
    const [filter, setFilter] = useState('all');
    const [expandedProject, setExpandedProject] = useState(null);
    const [confirmingId, setConfirmingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [payMember, setPayMember] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const [payrollRes, membersRes, inventoryRes] = await Promise.all([
                fetch('/api/payroll', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' }),
                fetch('/api/payroll/members', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' }),
                fetch('/api/inventory/items/options', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' }),
            ]);
            if (!payrollRes.ok || !membersRes.ok) {
                console.error('Payroll API error', payrollRes.status, membersRes.status);
                return;
            }
            const payroll = await payrollRes.json();
            const membersData = await membersRes.json();
            const inventoryData = inventoryRes.ok ? await inventoryRes.json() : { data: [] };
            setData({ unpaid_summary: payroll.unpaid_summary || [], projects: payroll.projects || [] });
            setMembers(membersData.data || []);
            setInventoryItems(inventoryData.data || []);
        } catch (err) {
            console.error('Failed to fetch payroll data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleConfirmPayment = async (id) => {
        if (!confirm('Konfirmasi pembayaran proyek ini?')) return;
        setConfirmingId(id);
        try {
            const res = await fetch(`/api/payroll/projects/${id}/confirm`, {
                method: 'POST',
                headers: API_HEADERS(),
            });
            if (res.ok) {
                fetchData();
            } else {
                const d = await res.json();
                alert(d.message || 'Gagal konfirmasi');
            }
        } catch {
            alert('Terjadi kesalahan');
        } finally {
            setConfirmingId(null);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Hapus proyek ini? Tindakan ini tidak dapat dibatalkan.')) return;
        setDeletingId(id);
        try {
            const res = await fetch(`/api/payroll/projects/${id}`, {
                method: 'DELETE',
                headers: API_HEADERS(),
            });
            if (res.ok) {
                fetchData();
            } else {
                const d = await res.json();
                alert(d.message || 'Gagal menghapus');
            }
        } catch {
            alert('Terjadi kesalahan');
        } finally {
            setDeletingId(null);
        }
    };

    const handleEdit = (project) => {
        setEditProject(project);
        setShowProjectModal(true);
    };

    const handleMemberSaved = (newMember) => {
        setMembers(prev => [...prev, newMember].sort((a, b) => a.nama.localeCompare(b.nama)));
    };

    const filteredProjects = data.projects.filter(p => filter === 'all' || p.status === filter);

    const totalUnpaidAll = data.unpaid_summary.reduce((sum, m) => sum + Number(m.total_unpaid || 0), 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-gray-500">Memuat data payroll...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Payroll</h1>
                    <p className="text-gray-500 text-sm mt-1">Kelola proyek dan pembayaran anggota tim</p>
                </div>
                <button
                    onClick={() => { setEditProject(null); setShowProjectModal(true); }}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 transition font-medium shadow-sm"
                >
                    <Plus size={20} /> Tambah Proyek
                </button>
            </div>

            {/* Unpaid Summary Cards */}
            {data.unpaid_summary.filter(m => Number(m.total_unpaid) > 0).length > 0 && (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-orange-800 flex items-center gap-2">
                            <Wallet size={20} /> Gaji Belum Dibayarkan
                        </h2>
                        <span className="text-sm font-bold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                            Total: {formatRupiah(totalUnpaidAll)}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {data.unpaid_summary.filter(m => Number(m.total_unpaid) > 0).map(m => (
                            <div key={m.id} className="bg-white rounded-xl p-4 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-sm">
                                            {m.nama.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800 text-sm">{m.nama}</p>
                                            {m.telepon && <p className="text-xs text-gray-400">{m.telepon}</p>}
                                        </div>
                                    </div>
                                    <span className="font-bold text-orange-600 text-sm">{formatRupiah(m.total_unpaid)}</span>
                                </div>
                                <button
                                    onClick={() => setPayMember(m)}
                                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                                >
                                    <DollarSign size={15} /> Bayar
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-2">
                {[
                    { key: 'all', label: 'Semua' },
                    { key: 'unpaid', label: 'Belum Dibayar' },
                    { key: 'paid', label: 'Sudah Dibayar' },
                ].map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === f.key ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
                    >
                        {f.label}
                    </button>
                ))}
                <span className="text-sm text-gray-400 ml-2">{filteredProjects.length} proyek</span>
            </div>

            {/* Project List */}
            <div className="space-y-3">
                {filteredProjects.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 text-center border">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Wallet size={24} className="text-gray-400" />
                        </div>
                        <h3 className="text-gray-600 font-semibold mb-1">Belum ada proyek</h3>
                        <p className="text-sm text-gray-400">Klik "Tambah Proyek" untuk membuat proyek pertama</p>
                    </div>
                ) : filteredProjects.map(project => {
                    const isExpanded = expandedProject === project.id;
                    return (
                        <div key={project.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${project.status === 'paid' ? 'border-green-200' : 'border-orange-200'}`}>
                            {/* Project Header */}
                            <div
                                className="p-4 cursor-pointer hover:bg-gray-50 transition"
                                onClick={() => setExpandedProject(isExpanded ? null : project.id)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${project.status === 'paid' ? 'bg-green-500' : 'bg-orange-500'}`} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-gray-800">{formatDate(project.tanggal)}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${project.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {project.status === 'paid' ? 'Sudah Dibayar' : 'Belum Dibayar'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Users size={14} /> {project.members?.length || 0} anggota
                                                </span>
                                                {project.catatan && <span className="truncate max-w-[200px]">{project.catatan}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold text-gray-800">{formatRupiah(project.total)}</span>
                                        {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="border-t bg-gray-50 p-4 space-y-4">
                                    {/* Detail Items */}
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Detail</h4>
                                        <div className="bg-white rounded-lg border overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 border-b">
                                                    <tr>
                                                        <th className="text-left px-3 py-2 font-medium text-gray-600">Item</th>
                                                        <th className="text-right px-3 py-2 font-medium text-gray-600">Qty</th>
                                                        <th className="text-right px-3 py-2 font-medium text-gray-600">Harga</th>
                                                        <th className="text-right px-3 py-2 font-medium text-gray-600">Subtotal</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {project.details?.map((d, i) => (
                                                        <tr key={i} className="border-b last:border-b-0">
                                                            <td className="px-3 py-2 text-gray-800">
                                                                {d.inventory_item?.name
                                                                    ? `${d.inventory_item.name} (${d.inventory_item.type_name || d.inventory_item.type?.name || 'Inventori'})`
                                                                    : (d.tipe === 'pemasangan' ? 'Pemasangan' : d.tipe === 'kabel' ? 'Kabel' : (d.deskripsi || 'Kustom'))}
                                                            </td>
                                                            <td className="px-3 py-2 text-right text-gray-600">
                                                                {d.tipe === 'kabel' ? `${d.jumlah} m` : d.jumlah}
                                                            </td>
                                                            <td className="px-3 py-2 text-right text-gray-600">{formatRupiah(d.harga_satuan)}</td>
                                                            <td className="px-3 py-2 text-right font-medium text-gray-800">{formatRupiah(d.subtotal)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Members Share */}
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Pembagian</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {project.members?.map(m => (
                                                <div key={m.id} className="bg-white rounded-lg border px-3 py-2 flex items-center justify-between">
                                                    <span className="text-sm text-gray-800">{m.nama}</span>
                                                    <span className="text-sm font-semibold text-blue-600">{formatRupiah(m.pivot?.bagian)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {project.catatan && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-600 mb-1">Catatan</h4>
                                            <p className="text-sm text-gray-600 bg-white rounded-lg border p-3">{project.catatan}</p>
                                        </div>
                                    )}

                                    {project.paid_at && (
                                        <p className="text-xs text-green-600">Dibayar pada: {formatDate(project.paid_at)}</p>
                                    )}

                                    {/* Actions */}
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {project.status === 'unpaid' && (
                                            <>
                                                <button
                                                    onClick={() => handleEdit(project)}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
                                                >
                                                    <Edit2 size={15} /> Edit
                                                </button>
                                                <button
                                                    onClick={() => handleConfirmPayment(project.id)}
                                                    disabled={confirmingId === project.id}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-50"
                                                >
                                                    <CheckCircle size={15} /> {confirmingId === project.id ? 'Memproses...' : 'Konfirmasi Dibayar'}
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleDelete(project.id)}
                                            disabled={deletingId === project.id}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-red-300 rounded-lg text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                        >
                                            <Trash2 size={15} /> {deletingId === project.id ? 'Menghapus...' : 'Hapus'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Modals */}
            <ProjectFormModal
                isOpen={showProjectModal}
                onClose={() => { setShowProjectModal(false); setEditProject(null); }}
                onSaved={fetchData}
                editProject={editProject}
                allMembers={members}
                inventoryItems={inventoryItems}
                onAddMember={() => setShowMemberModal(true)}
            />
            <AddMemberModal
                isOpen={showMemberModal}
                onClose={() => setShowMemberModal(false)}
                onSaved={handleMemberSaved}
            />
            <PayMemberModal
                isOpen={!!payMember}
                onClose={() => setPayMember(null)}
                onPaid={fetchData}
                member={payMember}
            />
        </div>
    );
}
