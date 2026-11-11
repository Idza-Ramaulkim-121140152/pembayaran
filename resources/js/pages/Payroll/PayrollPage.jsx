import { useState, useEffect, useCallback } from 'react';
import {
    Plus, Edit2, CheckCircle, Trash2, Users, Wallet, Calendar, X, ChevronDown, ChevronUp,
    Search, Clock, DollarSign, Building2, CreditCard, MessageSquare, AlertCircle, RefreshCw, ArrowLeft,
} from 'lucide-react';
import PayrollAllowancesEditor, {
    AllowanceTagList,
    SalaryBreakdownItems,
    normalizeAllowancesFromRecord,
    serializeAllowancesPayload,
    summarizeAllowances,
} from '../../components/PayrollAllowancesEditor';

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

const BANK_SUGGESTIONS = [
    'BCA',
    'BRI',
    'BNI',
    'Mandiri',
    'BSI',
    'BTN',
    'CIMB Niaga',
    'SeaBank',
    'Bank Jago',
    'DANA',
    'OVO',
    'GoPay',
    'Cash / Tunai',
];

// ==================== MEMBER SALARY MODAL (ADD / EDIT) ====================
function MemberSalaryModal({ isOpen, onClose, onSaved, memberToEdit = null }) {
    const [nama, setNama] = useState('');
    const [telepon, setTelepon] = useState('');
    const [tipeGaji, setTipeGaji] = useState('bulanan');
    const [gajiPokok, setGajiPokok] = useState('');
    const [allowances, setAllowances] = useState([]);
    const [tanggalGajian, setTanggalGajian] = useState(1);
    const [namaBank, setNamaBank] = useState('');
    const [nomorRekening, setNomorRekening] = useState('');
    const [atasNamaRekening, setAtasNamaRekening] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (memberToEdit) {
                setNama(memberToEdit.nama || '');
                setTelepon(memberToEdit.telepon || '');
                setTipeGaji(memberToEdit.tipe_gaji || 'bulanan');
                setGajiPokok(memberToEdit.gaji_pokok ? String(Number(memberToEdit.gaji_pokok)) : '');
                setAllowances(normalizeAllowancesFromRecord(memberToEdit));
                setTanggalGajian(memberToEdit.tanggal_gajian ? Number(memberToEdit.tanggal_gajian) : 1);
                setNamaBank(memberToEdit.nama_bank || '');
                setNomorRekening(memberToEdit.nomor_rekening || '');
                setAtasNamaRekening(memberToEdit.atas_nama_rekening || '');
                setIsActive(memberToEdit.is_active !== undefined ? Boolean(memberToEdit.is_active) : true);
            } else {
                setNama('');
                setTelepon('');
                setTipeGaji('bulanan');
                setGajiPokok('');
                setAllowances([]);
                setTanggalGajian(1);
                setNamaBank('');
                setNomorRekening('');
                setAtasNamaRekening('');
                setIsActive(true);
            }
        }
    }, [isOpen, memberToEdit]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!nama.trim()) return alert('Nama karyawan wajib diisi');
        setSaving(true);

        const cleanedAllowances = tipeGaji === 'proyek' ? [] : serializeAllowancesPayload(allowances);
        const { monthlyTotal } = summarizeAllowances(cleanedAllowances);

        const payload = {
            nama: nama.trim(),
            telepon: telepon.trim() || null,
            tipe_gaji: tipeGaji,
            gaji_pokok: tipeGaji === 'proyek' ? 0 : (parseFloat(gajiPokok) || 0),
            tunjangan: monthlyTotal,
            allowances: cleanedAllowances,
            tanggal_gajian: parseInt(tanggalGajian, 10) || 1,
            nama_bank: namaBank.trim() || null,
            nomor_rekening: nomorRekening.trim() || null,
            atas_nama_rekening: atasNamaRekening.trim() || null,
            is_active: isActive,
        };

        try {
            const url = memberToEdit ? `/api/payroll/members/${memberToEdit.id}` : '/api/payroll/members';
            const method = memberToEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: API_HEADERS(),
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok) {
                onSaved(data.data);
                onClose();
            } else {
                alert(data.message || 'Gagal menyimpan data karyawan');
            }
        } catch {
            alert('Terjadi kesalahan');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl my-8 overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b bg-gray-50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">
                            {memberToEdit ? 'Edit Data Gaji Karyawan' : 'Tambah Karyawan & Atur Gaji'}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Pengaturan nominal gaji bulanan dan tanggal gajian
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[calc(100vh-10rem)] overflow-y-auto">
                    {/* Profil Dasar */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Nama Karyawan *</label>
                            <input
                                type="text"
                                value={nama}
                                onChange={e => setNama(e.target.value)}
                                placeholder="Contoh: Budi Santoso"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                autoFocus
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">No. WhatsApp / HP</label>
                            <input
                                type="text"
                                value={telepon}
                                onChange={e => setTelepon(e.target.value)}
                                placeholder="08123456789"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Tipe Gaji */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Sistem Penggajian</label>
                        <select
                            value={tipeGaji}
                            onChange={e => setTipeGaji(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                            <option value="bulanan">Gaji Bulanan Tetap</option>
                            <option value="campuran">Kombinasi (Gaji Pokok Bulanan + Upah Proyek)</option>
                            <option value="proyek">Hanya Upah per Proyek Pemasangan</option>
                        </select>
                    </div>

                    {/* Nominal Gaji & Tunjangan */}
                    {tipeGaji !== 'proyek' && (
                        <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-blue-900 mb-1">
                                    Gaji Pokok Bulanan (Rp)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={gajiPokok}
                                    onChange={e => setGajiPokok(e.target.value)}
                                    placeholder="0"
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                            </div>

                            <PayrollAllowancesEditor
                                allowances={allowances}
                                onChange={setAllowances}
                                gajiPokok={gajiPokok}
                            />
                        </div>
                    )}

                    {/* Tanggal Gajian Bulanan */}
                    {tipeGaji !== 'proyek' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                🗓️ Tanggal Gajian Bulanan
                            </label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={tanggalGajian}
                                    onChange={e => setTanggalGajian(Number(e.target.value))}
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                        <option key={d} value={d}>
                                            Tanggal {d} setiap bulan {d === 1 ? '(Awal bulan)' : d === 25 ? '(Akhir bulan)' : d === 28 ? '(Tutup buku)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                Sistem cashflow &amp; prediksi AI akan menjadwalkan pengeluaran gaji ini pada tanggal {tanggalGajian} setiap bulan.
                            </p>
                        </div>
                    )}

                    {/* Bank & Rekening */}
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                        <div className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                            <CreditCard size={14} className="text-blue-600" />
                            Informasi Rekening Bank Pegawai
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Nama Bank / E-Wallet</label>
                                <input
                                    type="text"
                                    list="payroll-bank-suggestions"
                                    value={namaBank}
                                    onChange={e => setNamaBank(e.target.value)}
                                    placeholder="BCA / Mandiri / BRI / Cash"
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500"
                                />
                                <datalist id="payroll-bank-suggestions">
                                    {BANK_SUGGESTIONS.map((bank) => (
                                        <option key={bank} value={bank} />
                                    ))}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Nomor Rekening</label>
                                <input
                                    type="text"
                                    value={nomorRekening}
                                    onChange={e => setNomorRekening(e.target.value)}
                                    placeholder="1234567890"
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Atas Nama Pemilik Rekening</label>
                            <input
                                type="text"
                                value={atasNamaRekening}
                                onChange={e => setAtasNamaRekening(e.target.value)}
                                placeholder={nama ? `Contoh: ${nama}` : 'Nama sesuai buku tabungan'}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* Status Aktif */}
                    <div className="flex items-center gap-2 pt-2">
                        <input
                            type="checkbox"
                            id="isActiveMember"
                            checked={isActive}
                            onChange={e => setIsActive(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="isActiveMember" className="text-xs font-medium text-gray-700 cursor-pointer">
                            Karyawan Aktif (masuk dalam perhitungan beban gaji &amp; prediksi)
                        </label>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 justify-end pt-3 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                        >
                            {saving ? 'Menyimpan...' : memberToEdit ? 'Simpan Perubahan' : 'Tambah Karyawan'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


const computeSuggestedSalaryAmount = (memberObj, breakdown, unpaidAmount = 0) => {
    const type = memberObj?.tipe_gaji || 'bulanan';
    if (type === 'proyek') {
        return Math.max(0, Number(unpaidAmount) || 0);
    }
    const computedBaseAndAllowances = breakdown
        ? Number(breakdown.total_gaji_dihitung || 0)
        : ((Number(memberObj?.gaji_pokok) || 0) + (Number(memberObj?.tunjangan_bulanan_total ?? memberObj?.tunjangan) || 0));

    return type === 'campuran'
        ? Math.max(0, computedBaseAndAllowances + (Number(unpaidAmount) || 0))
        : Math.max(0, computedBaseAndAllowances);
};

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

    // Attendance & salary breakdown states
    const [attendanceSummary, setAttendanceSummary] = useState(null);
    const [salaryBreakdown, setSalaryBreakdown] = useState(null);
    const [attendancePresets, setAttendancePresets] = useState([]);
    const [selectedPeriodKey, setSelectedPeriodKey] = useState('reset_current');
    const [attendanceStartDate, setAttendanceStartDate] = useState('');
    const [attendanceEndDate, setAttendanceEndDate] = useState('');
    const [alreadyPaidInPeriod, setAlreadyPaidInPeriod] = useState(0);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [showAttendanceDetails, setShowAttendanceDetails] = useState(false);
    const [attendanceNote, setAttendanceNote] = useState('');

    // Bank & WhatsApp destination states
    const [paymentMethod, setPaymentMethod] = useState('transfer');
    const [bankName, setBankName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [accountHolder, setAccountHolder] = useState('');
    const [editingBank, setEditingBank] = useState(false);
    const [employeePhone, setEmployeePhone] = useState('');
    const [sendWhatsapp, setSendWhatsapp] = useState(true);

    // Confirmation step states
    const [step, setStep] = useState('form'); // 'form' | 'confirm'
    const [confirmWorkAndSalary, setConfirmWorkAndSalary] = useState(false);
    const [formError, setFormError] = useState('');

    const totalGajiBulanan = salaryBreakdown
        ? Number(salaryBreakdown.total_gaji_tetap || 0)
        : (member ? ((Number(member.gaji_pokok) || 0) + (Number(member.tunjangan_bulanan_total ?? member.tunjangan) || 0)) : 0);
    const isMonthly = member ? ((member.tipe_gaji || 'bulanan') !== 'proyek') : true;

    const loadMemberPaymentDetails = useCallback(async (memberObj, startDate = null, endDate = null, autoApplyNominal = false) => {
        if (!memberObj?.id) return;
        setLoadingHistory(true);
        setLoadingAttendance(true);
        try {
            const params = new URLSearchParams();
            if (startDate && endDate) {
                params.set('start_date', startDate);
                params.set('end_date', endDate);
            }
            const qs = params.toString() ? `?${params.toString()}` : '';
            const res = await fetch(`/api/payroll/members/${memberObj.id}/payments${qs}`, {
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin',
            });
            const d = res.ok ? await res.json() : {};
            setPayments(d.payments || []);
            if (d.attendance_summary) {
                setAttendanceSummary(d.attendance_summary);
                setAttendanceStartDate(d.attendance_summary.period_start || startDate || '');
                setAttendanceEndDate(d.attendance_summary.period_end || endDate || '');
            }
            if (Array.isArray(d.attendance_presets)) {
                setAttendancePresets(d.attendance_presets);
            }
            setSalaryBreakdown(d.salary_breakdown || null);
            setAlreadyPaidInPeriod(Number(d.already_paid_in_period || 0));

            if (autoApplyNominal) {
                const recalculated = computeSuggestedSalaryAmount(
                    d.member || memberObj,
                    d.salary_breakdown,
                    memberObj.total_unpaid
                );
                setNominal(recalculated > 0 ? String(recalculated) : '');
                const latestOutstanding = Number(d.loan_context?.outstanding || 0);
                setLoanDeductionAmount((prev) => {
                    if (!prev) return prev;
                    const maxCap = latestOutstanding > 0 ? Math.min(recalculated, latestOutstanding) : recalculated;
                    return String(Math.min(Number(prev) || 0, maxCap));
                });
            }

            if (d.member) {
                const refreshedBank = (d.member.nama_bank || '').trim();
                const refreshedRek = (d.member.nomor_rekening || '').trim();
                const refreshedHolder = (d.member.atas_nama_rekening || d.member.nama || '').trim();
                const refreshedPhone = (d.member.telepon || '').trim();
                const isRefreshedTransfer = refreshedBank !== '' && !['cash', 'tunai'].includes(refreshedBank.toLowerCase());

                setBankName(refreshedBank);
                setAccountNumber(refreshedRek);
                setAccountHolder(refreshedHolder);
                if (refreshedPhone) {
                    setEmployeePhone(prev => prev || refreshedPhone);
                }
                if (isRefreshedTransfer) {
                    setPaymentMethod('transfer');
                    setEditingBank(!refreshedRek);
                }
            }

            if (Number(d.loan_context?.outstanding || 0) > 0) {
                setLoanContext(d.loan_context);
                setLoanChoicePromptOpen(true);
            }
        } catch {
            setPayments([]);
        } finally {
            setLoadingHistory(false);
            setLoadingAttendance(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen && member) {
            const memberUnpaid = Number(member.total_unpaid) || 0;
            const monthlyTotal = (Number(member.gaji_pokok) || 0) + (Number(member.tunjangan_bulanan_total ?? member.tunjangan) || 0);
            const isMemberMonthly = (member.tipe_gaji || 'bulanan') !== 'proyek';
            const suggestedDefault = computeSuggestedSalaryAmount(member, null, memberUnpaid);

            const defaultNom = suggestedDefault > 0 ? String(suggestedDefault) : (memberUnpaid > 0 ? String(memberUnpaid) : '');
            const currentMonthName = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
            setNominal(defaultNom);
            setCatatan(isMemberMonthly && (monthlyTotal > 0 || Number(member.tunjangan_harian_per_hari || 0) > 0) ? `Gaji Bulanan ${currentMonthName} - ${member.nama}` : '');

            const initialLoanContext = Number(member.borrower_outstanding || 0) > 0 ? {
                borrower: member.borrower || null,
                outstanding: Number(member.borrower_outstanding || 0),
            } : null;
            setLoanContext(initialLoanContext);
            setLoanHandling('cash');
            setLoanDeductionAmount('');
            setLoanChoicePromptOpen(Boolean(initialLoanContext));

            const initialBank = (member.nama_bank || '').trim();
            const initialRek = (member.nomor_rekening || '').trim();
            const initialHolder = (member.atas_nama_rekening || member.nama || '').trim();
            const hasBankTransfer = initialBank !== '' && !['cash', 'tunai'].includes(initialBank.toLowerCase());

            setPaymentMethod(hasBankTransfer ? 'transfer' : 'transfer');
            setBankName(hasBankTransfer ? initialBank : '');
            setAccountNumber(initialRek);
            setAccountHolder(initialHolder);
            setEditingBank(!hasBankTransfer || !initialRek);
            setEmployeePhone((member.telepon || '').trim());
            setSendWhatsapp(true);
            setStep('form');
            setConfirmWorkAndSalary(false);
            setFormError('');
            setSelectedPeriodKey('reset_current');
            setShowAttendanceDetails(false);
            setAttendanceNote('');
            setAttendanceSummary(null);
            setSalaryBreakdown(null);
            setAttendanceStartDate('');
            setAttendanceEndDate('');
            setAlreadyPaidInPeriod(0);

            loadMemberPaymentDetails(member, null, null, true);
        }
    }, [isOpen, member, loadMemberPaymentDetails]);

    if (!isOpen || !member) return null;

    const unpaid = Number(member.total_unpaid) || 0;
    const fullSuggestedAmount = computeSuggestedSalaryAmount(member, salaryBreakdown, unpaid);
    const numericNominal = parseFloat(nominal) || 0;
    const loanOutstanding = Number(loanContext?.outstanding || 0);
    const requestedDeduction = loanHandling === 'deduct_loan' ? (Number(loanDeductionAmount) || 0) : 0;
    const netPayableAmount = Math.max(0, numericNominal - requestedDeduction);
    const remainingLoanAfter = Math.max(0, loanOutstanding - requestedDeduction);

    const handlePeriodChange = (presetKey) => {
        setSelectedPeriodKey(presetKey);
        const preset = attendancePresets.find(p => p.key === presetKey);
        if (preset) {
            setAttendanceStartDate(preset.start_date);
            setAttendanceEndDate(preset.end_date);
            loadMemberPaymentDetails(member, preset.start_date, preset.end_date, true);
        }
    };

    const handleCustomDateChange = (nextStart, nextEnd) => {
        setAttendanceStartDate(nextStart);
        setAttendanceEndDate(nextEnd);
        setSelectedPeriodKey('custom');
        if (nextStart && nextEnd && nextStart <= nextEnd) {
            loadMemberPaymentDetails(member, nextStart, nextEnd, true);
        }
    };

    const handleProceedToConfirm = (e) => {
        e.preventDefault();
        setFormError('');

        if (!numericNominal || numericNominal <= 0) {
            setFormError('Masukkan nominal pembayaran yang valid (lebih dari 0).');
            return;
        }
        if (!isMonthly && unpaid > 0 && numericNominal > unpaid) {
            setFormError(`Nominal melebihi sisa saldo upah proyek (${formatRupiah(unpaid)}).`);
            return;
        }
        if (!isMonthly && unpaid <= 0) {
            setFormError('Tidak ada sisa saldo upah proyek yang belum dibayar.');
            return;
        }

        if (loanHandling === 'deduct_loan') {
            if (requestedDeduction <= 0) {
                setFormError('Masukkan nominal potong pinjaman / kasbon yang valid.');
                return;
            }
            if (requestedDeduction > numericNominal) {
                setFormError('Nominal potong pinjaman tidak boleh lebih besar dari jumlah gaji bruto.');
                return;
            }
            if (requestedDeduction > loanOutstanding) {
                setFormError('Nominal potong pinjaman melebihi sisa pinjaman karyawan.');
                return;
            }
        }

        if (paymentMethod === 'transfer' && !bankName.trim()) {
            setFormError('Masukkan nama bank tujuan transfer, atau pilih metode Tunai / Cash.');
            setEditingBank(true);
            return;
        }

        if (sendWhatsapp && !employeePhone.trim()) {
            setFormError('Isi nomor WhatsApp pegawai terlebih dahulu jika ingin mengirim slip gaji via WhatsApp, atau hilangkan centang kirim WA.');
            return;
        }

        setConfirmWorkAndSalary(false);
        setStep('confirm');
    };

    const handleConfirmAndPay = async () => {
        if (!confirmWorkAndSalary) {
            setFormError('Centang konfirmasi bahwa data waktu kerja dan jumlah gaji sudah benar.');
            return;
        }

        setFormError('');
        setSaving(true);
        try {
            const payload = {
                nominal: numericNominal,
                catatan: catatan.trim() || null,
                loan_handling: loanHandling,
                loan_deduction_amount: requestedDeduction,
                payment_method: paymentMethod,
                bank_name: paymentMethod === 'transfer' ? (bankName.trim() || null) : null,
                account_number: paymentMethod === 'transfer' ? (accountNumber.trim() || null) : null,
                account_holder: paymentMethod === 'transfer' ? (accountHolder.trim() || null) : null,
                save_bank_to_member: paymentMethod === 'transfer' && Boolean(bankName.trim()),
                telepon: employeePhone.trim() || null,
                attendance_start_date: attendanceSummary?.period_start || attendanceStartDate || null,
                attendance_end_date: attendanceSummary?.period_end || attendanceEndDate || null,
                attendance_confirmed: true,
                attendance_note: attendanceNote.trim() || null,
                send_whatsapp: sendWhatsapp,
            };

            const res = await fetch(`/api/payroll/members/${member.id}/pay`, {
                method: 'POST',
                headers: API_HEADERS(),
                credentials: 'same-origin',
                body: JSON.stringify(payload),
            });
            const d = await res.json();
            if (res.ok) {
                onPaid(d);
                onClose();
            } else {
                setFormError(d.message || 'Gagal memproses pembayaran');
            }
        } catch {
            setFormError('Terjadi kesalahan jaringan saat memproses pembayaran');
        } finally {
            setSaving(false);
        }
    };

    const handlePayFull = () => {
        const targetAmount = fullSuggestedAmount > 0 ? fullSuggestedAmount : unpaid;
        if (targetAmount <= 0) return;
        setNominal(String(targetAmount));
        if (loanHandling === 'deduct_loan' && loanOutstanding > 0) {
            setLoanDeductionAmount(String(Math.min(targetAmount, loanOutstanding)));
        }
    };

    const chooseCashPayroll = () => {
        setLoanHandling('cash');
        setLoanDeductionAmount('');
        setLoanChoicePromptOpen(false);
    };

    const chooseLoanDeduction = () => {
        const amount = Number(nominal || fullSuggestedAmount || unpaid || 0);
        setLoanHandling('deduct_loan');
        setLoanDeductionAmount(String(Math.min(amount, loanOutstanding)));
        setLoanChoicePromptOpen(false);
    };

    const maxLoanDeduction = Math.min(numericNominal || fullSuggestedAmount || unpaid || 0, loanOutstanding);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:py-8">
            <div className="my-0 flex max-h-[calc(100vh-3rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:max-h-[calc(100vh-4rem)]">
                {/* Modal Header */}
                <div className="shrink-0 flex items-center justify-between border-b bg-white px-5 py-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">
                            {step === 'confirm' ? `Konfirmasi Pembayaran Gaji - ${member.nama}` : `Bayar Gaji - ${member.nama}`}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {member.tipe_gaji === 'bulanan'
                                ? 'Gaji Bulanan Tetap'
                                : member.tipe_gaji === 'campuran'
                                    ? 'Kombinasi (Gaji Bulanan + Upah Proyek)'
                                    : 'Upah Proyek Pemasangan'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {formError && (
                        <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 flex items-start gap-2">
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{formError}</span>
                        </div>
                    )}

                    {step === 'form' ? (
                        <>
                            {/* Saldo & Rincian Gaji + Tunjangan */}
                            <div className="mx-5 mt-4 bg-orange-50 border border-orange-200 rounded-xl p-3.5 space-y-2">
                                {isMonthly && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs sm:text-sm text-orange-800 font-semibold">
                                                Rincian Gaji &amp; Tunjangan
                                            </span>
                                            <span className="text-xs font-medium text-orange-700">
                                                Tetap / bln: {formatRupiah(totalGajiBulanan)}
                                            </span>
                                        </div>
                                        {salaryBreakdown && (
                                            <div className="rounded-lg bg-white/80 border border-orange-100 px-3 py-2">
                                                <SalaryBreakdownItems breakdown={salaryBreakdown} />
                                            </div>
                                        )}
                                    </>
                                )}
                                {(!isMonthly || member.tipe_gaji === 'campuran' || unpaid > 0) && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs sm:text-sm text-orange-700">Sisa Upah Proyek Belum Dibayar</span>
                                        <span className="text-sm font-bold text-orange-600">{formatRupiah(unpaid)}</span>
                                    </div>
                                )}
                                {isMonthly && (
                                    <div className="flex items-center justify-between pt-1.5 border-t border-orange-200/70">
                                        <span className="text-xs sm:text-sm font-bold text-orange-900">
                                            Total Gaji Dihitung ({attendanceSummary?.total_present ?? 0} hari masuk)
                                        </span>
                                        <span className="text-base font-extrabold text-orange-700">
                                            {formatRupiah(fullSuggestedAmount)}
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between pt-1 border-t border-orange-200/70 text-xs">
                                    <span className="text-gray-600">Gaji Sudah Diambil (Periode Absensi Ini)</span>
                                    <span className="font-semibold text-gray-800">{formatRupiah(alreadyPaidInPeriod)}</span>
                                </div>
                                {Number(member.total_paid) > 0 && (
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-500">Akumulasi Total Sudah Dibayar</span>
                                        <span className="font-medium text-green-700">{formatRupiah(member.total_paid)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Attendance / Waktu Kerja Box */}
                            <div className="mx-5 mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 uppercase tracking-wide">
                                        <Clock size={14} className="text-indigo-600" />
                                        Informasi Waktu Kerja (Absensi Karyawan)
                                    </div>
                                    {attendancePresets.length > 0 && (
                                        <select
                                            value={selectedPeriodKey}
                                            onChange={(e) => handlePeriodChange(e.target.value)}
                                            className="text-xs border border-indigo-200 rounded-lg px-2 py-1 bg-white text-indigo-900 font-medium"
                                        >
                                            {attendancePresets.map(p => (
                                                <option key={p.key} value={p.key}>{p.label}</option>
                                            ))}
                                            {selectedPeriodKey === 'custom' && (
                                                <option value="custom">Rentang Tanggal Kustom</option>
                                            )}
                                        </select>
                                    )}
                                </div>

                                {/* Rentang Tanggal Perhitungan Absen (Preset atau Custom) */}
                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-white/80 p-2 text-xs">
                                    <span className="font-medium text-indigo-900">Rentang Hitung Absen:</span>
                                    <input
                                        type="date"
                                        value={attendanceStartDate}
                                        onChange={(e) => handleCustomDateChange(e.target.value, attendanceEndDate)}
                                        className="rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-gray-800"
                                    />
                                    <span className="text-gray-500">s.d.</span>
                                    <input
                                        type="date"
                                        value={attendanceEndDate}
                                        onChange={(e) => handleCustomDateChange(attendanceStartDate, e.target.value)}
                                        className="rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-gray-800"
                                    />
                                    <button
                                        type="button"
                                        disabled={!attendanceStartDate || !attendanceEndDate || attendanceStartDate > attendanceEndDate || loadingAttendance}
                                        onClick={() => loadMemberPaymentDetails(member, attendanceStartDate, attendanceEndDate, true)}
                                        className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        <RefreshCw size={11} className={loadingAttendance ? 'animate-spin' : ''} />
                                        Hitung
                                    </button>
                                </div>

                                {loadingAttendance ? (
                                    <p className="text-xs text-indigo-600 py-2">Mengambil data absensi karyawan...</p>
                                ) : attendanceSummary ? (
                                    <>
                                        <div className="text-xs text-indigo-800 flex flex-wrap items-center justify-between gap-1">
                                            <span>Periode: <strong>{attendanceSummary.period_label}</strong></span>
                                            {attendanceSummary.linked ? (
                                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                                                    Akun: {attendanceSummary.user?.name}
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                                                    Akun user absensi belum ditautkan
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                                <p className="text-[11px] text-gray-500">Waktu Masuk</p>
                                                <p className="text-sm font-bold text-indigo-900">{attendanceSummary.total_present} hari</p>
                                            </div>
                                            <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                                <p className="text-[11px] text-gray-500">Tepat Waktu / Telat</p>
                                                <p className="text-sm font-bold text-gray-800">
                                                    <span className="text-emerald-600">{attendanceSummary.total_on_time}</span>
                                                    {' / '}
                                                    <span className={attendanceSummary.total_late > 0 ? 'text-amber-600' : 'text-gray-500'}>
                                                        {attendanceSummary.total_late}
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                                <p className="text-[11px] text-gray-500">Total Waktu Kerja</p>
                                                <p className="text-sm font-bold text-indigo-900">{attendanceSummary.total_hours_formatted}</p>
                                            </div>
                                            <div className="bg-white rounded-lg p-2 border border-indigo-100">
                                                <p className="text-[11px] text-gray-500">Rata-rata Masuk</p>
                                                <p className="text-sm font-bold text-gray-800">
                                                    {attendanceSummary.average_clock_in || '-'}
                                                </p>
                                            </div>
                                        </div>

                                        {attendanceSummary.total_late_minutes > 0 && (
                                            <p className="text-[11px] text-amber-700 font-medium">
                                                Total akumulasi keterlambatan: {attendanceSummary.total_late_minutes} menit
                                                {attendanceSummary.last_clock_in_at ? ` • Absen masuk terakhir: ${attendanceSummary.last_clock_in_at}` : ''}
                                            </p>
                                        )}

                                        {attendanceSummary.recent_records?.length > 0 && (
                                            <div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAttendanceDetails(prev => !prev)}
                                                    className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1"
                                                >
                                                    {showAttendanceDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    {showAttendanceDetails ? 'Sembunyikan' : 'Lihat'} rincian waktu masuk harian ({attendanceSummary.recent_records.length} hari)
                                                </button>
                                                {showAttendanceDetails && (
                                                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-indigo-100 bg-white">
                                                        <table className="w-full text-[11px]">
                                                            <thead className="bg-indigo-50 text-indigo-900">
                                                                <tr>
                                                                    <th className="text-left px-2 py-1.5">Tanggal</th>
                                                                    <th className="text-left px-2 py-1.5">Masuk</th>
                                                                    <th className="text-left px-2 py-1.5">Pulang</th>
                                                                    <th className="text-left px-2 py-1.5">Durasi</th>
                                                                    <th className="text-left px-2 py-1.5">Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {attendanceSummary.recent_records.map(r => (
                                                                    <tr key={r.id}>
                                                                        <td className="px-2 py-1 text-gray-700">{r.date_formatted || r.date}</td>
                                                                        <td className="px-2 py-1 font-medium text-gray-900">{r.clock_in_at || '-'}</td>
                                                                        <td className="px-2 py-1 text-gray-600">{r.clock_out_at || '-'}</td>
                                                                        <td className="px-2 py-1 text-gray-600">{r.work_duration_formatted || '-'}</td>
                                                                        <td className="px-2 py-1">
                                                                            <span className={`px-1.5 py-0.5 rounded font-medium ${
                                                                                r.clock_in_status === 'late'
                                                                                    ? 'bg-amber-100 text-amber-800'
                                                                                    : 'bg-emerald-100 text-emerald-700'
                                                                            }`}>
                                                                                {r.clock_in_status === 'late' ? `Telat ${r.clock_in_late_minutes}m` : 'Tepat'}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div>
                                            <input
                                                type="text"
                                                value={attendanceNote}
                                                onChange={(e) => setAttendanceNote(e.target.value)}
                                                placeholder="Catatan waktu kerja / lembur / izin (opsional)"
                                                className="w-full border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-indigo-400"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs text-gray-500">Data absensi belum tersedia.</p>
                                )}
                            </div>

                            <form onSubmit={handleProceedToConfirm} className="p-5 space-y-4">
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
                                            max={!isMonthly && unpaid > 0 ? unpaid : undefined}
                                            className="w-full border rounded-lg pl-10 pr-3 py-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-semibold"
                                            autoFocus
                                            required
                                        />
                                    </div>
                                    {fullSuggestedAmount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handlePayFull}
                                            className="mt-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            {isMonthly
                                                ? `Gunakan total gaji dihitung (${formatRupiah(fullSuggestedAmount)})`
                                                : `Bayar penuh (${formatRupiah(unpaid)})`}
                                        </button>
                                    )}
                                </div>

                                {loanOutstanding > 0 && (
                                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-3">
                                        <div>
                                            <p className="text-sm font-semibold text-blue-900">Karyawan punya pinjaman aktif</p>
                                            <p className="text-xs text-blue-700">
                                                {loanContext?.borrower?.name || member.nama} masih memiliki sisa pinjaman {formatRupiah(loanOutstanding)}.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setLoanHandling('deduct_loan');
                                                    const amount = Number(nominal || fullSuggestedAmount || unpaid || 0);
                                                    setLoanDeductionAmount(String(Math.min(amount, loanOutstanding)));
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
                                                    max={maxLoanDeduction > 0 ? maxLoanDeduction : undefined}
                                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                                />
                                                <p className="mt-1 text-xs text-blue-700">
                                                    Maksimal {formatRupiah(maxLoanDeduction)} atau tidak lebih dari jumlah payroll.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Informasi Bank Pegawai & Tujuan Pengiriman */}
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                                            <Building2 size={14} className="text-slate-600" />
                                            Tujuan Pembayaran &amp; Bank Pegawai
                                        </span>
                                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                                            <button
                                                type="button"
                                                onClick={() => setPaymentMethod('transfer')}
                                                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                                                    paymentMethod === 'transfer' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                Transfer Bank
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaymentMethod('cash')}
                                                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                                                    paymentMethod === 'cash' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                Tunai / Cash
                                            </button>
                                        </div>
                                    </div>

                                    {paymentMethod === 'transfer' ? (
                                        !editingBank && bankName ? (
                                            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                                                <div className="text-xs space-y-0.5">
                                                    <p className="font-bold text-slate-800">{bankName} {accountNumber ? `• ${accountNumber}` : ''}</p>
                                                    <p className="text-slate-500">a.n. {accountHolder || member.nama}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingBank(true)}
                                                    className="text-xs font-semibold text-blue-600 hover:underline"
                                                >
                                                    Ubah Bank
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-2.5 bg-white border border-slate-200 rounded-lg p-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-semibold text-amber-700">
                                                        {bankName ? 'Edit informasi rekening pegawai:' : 'Informasi bank pegawai belum diisi — isi di sini:'}
                                                    </p>
                                                    {bankName && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingBank(false)}
                                                            className="text-[11px] text-slate-500 hover:text-slate-700"
                                                        >
                                                            Selesai
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Nama Bank *</label>
                                                        <input
                                                            type="text"
                                                            list="pay-modal-bank-suggestions"
                                                            value={bankName}
                                                            onChange={(e) => setBankName(e.target.value)}
                                                            placeholder="BCA / BRI / Mandiri"
                                                            className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                                                        />
                                                        <datalist id="pay-modal-bank-suggestions">
                                                            {BANK_SUGGESTIONS.filter(b => b !== 'Cash / Tunai').map((bank) => (
                                                                <option key={bank} value={bank} />
                                                            ))}
                                                        </datalist>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Nomor Rekening</label>
                                                        <input
                                                            type="text"
                                                            value={accountNumber}
                                                            onChange={(e) => setAccountNumber(e.target.value)}
                                                            placeholder="Contoh: 1234567890"
                                                            className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Atas Nama Rekening</label>
                                                    <input
                                                        type="text"
                                                        value={accountHolder}
                                                        onChange={(e) => setAccountHolder(e.target.value)}
                                                        placeholder={`Nama pemilik rekening (default: ${member.nama})`}
                                                        className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <p className="text-[11px] text-slate-500">
                                                    Data rekening akan otomatis tersimpan ke profil payroll pegawai saat dibayar.
                                                </p>
                                            </div>
                                        )
                                    ) : (
                                        <p className="text-xs text-emerald-700 bg-white border border-emerald-200 rounded-lg px-3 py-2">
                                            Pembayaran akan dicatat sebagai <strong>Tunai / Cash langsung</strong> kepada {member.nama}.
                                        </p>
                                    )}
                                </div>

                                {/* Catatan */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Pembayaran</label>
                                    <input
                                        type="text"
                                        value={catatan}
                                        onChange={e => setCatatan(e.target.value)}
                                        placeholder="Catatan pembayaran (opsional)"
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                </div>

                                {/* WhatsApp Notification Toggle */}
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                                    <label className="flex items-start gap-2.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={sendWhatsapp}
                                            onChange={(e) => setSendWhatsapp(e.target.checked)}
                                            className="mt-0.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <div className="text-xs">
                                            <span className="font-semibold text-emerald-900 flex items-center gap-1">
                                                <MessageSquare size={13} /> Kirim Rincian Gaji ke WhatsApp Pegawai
                                            </span>
                                            <span className="text-emerald-700 block mt-0.5">
                                                Mengirim info waktu kerja (absensi), total gaji, potongan hutang / gaji diambil, gaji dibayar, dan bank tujuan.
                                            </span>
                                        </div>
                                    </label>
                                    {sendWhatsapp && (
                                        <div>
                                            <label className="block text-[11px] font-medium text-emerald-900 mb-1">Nomor WhatsApp Tujuan</label>
                                            <input
                                                type="text"
                                                value={employeePhone}
                                                onChange={(e) => setEmployeePhone(e.target.value)}
                                                placeholder="Contoh: 08123456789"
                                                className="w-full border border-emerald-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Preview */}
                                {numericNominal > 0 && (
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Jumlah gaji (bruto):</span>
                                            <span className="font-bold text-green-700">{formatRupiah(numericNominal)}</span>
                                        </div>
                                        {loanHandling === 'deduct_loan' && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">Potong pinjaman / hutang:</span>
                                                <span className="font-semibold text-blue-700">-{formatRupiah(requestedDeduction)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-sm pt-1 border-t border-green-200">
                                            <span className="font-semibold text-gray-800">Gaji yang harus dibayar:</span>
                                            <span className="font-bold text-emerald-800">{formatRupiah(netPayableAmount)}</span>
                                        </div>
                                        {(!isMonthly || unpaid > 0) && (
                                            <div className="flex justify-between text-xs text-gray-600">
                                                <span>Sisa upah proyek setelah bayar:</span>
                                                <span className="font-semibold">{formatRupiah(Math.max(0, unpaid - numericNominal))}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-3 justify-end pt-2">
                                    <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm">
                                        Batal
                                    </button>
                                    <button type="submit" className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm">
                                        Lanjut Konfirmasi
                                    </button>
                                </div>
                            </form>

                            {/* Riwayat Pembayaran */}
                            {payments.length > 0 && (
                                <div className="border-t px-5 pb-5 pt-4">
                                    <h4 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                                        <Clock size={14} /> Riwayat Pembayaran
                                    </h4>
                                    <div className="max-h-44 overflow-y-auto space-y-2">
                                        {payments.map(p => (
                                            <div key={p.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2 gap-2">
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-semibold text-green-700">{formatRupiah(p.nominal)}</span>
                                                        {p.payment_method === 'transfer' && p.bank_name && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                                                                {p.bank_name}{p.account_number ? ` • ${p.account_number}` : ''}
                                                            </span>
                                                        )}
                                                        {p.payment_method === 'cash' && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                                                                Tunai
                                                            </span>
                                                        )}
                                                        {p.whatsapp_status && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                                p.whatsapp_status === 'sent'
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : p.whatsapp_status === 'skipped'
                                                                        ? 'bg-gray-200 text-gray-600'
                                                                        : 'bg-red-100 text-red-700'
                                                            }`}>
                                                                WA: {p.whatsapp_status === 'sent' ? 'Terkirim' : p.whatsapp_status === 'skipped' ? 'Dilewati' : 'Gagal'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {Number(p.loan_deduction_amount || 0) > 0 && (
                                                        <p className="text-xs text-blue-600">
                                                            Potong pinjaman {formatRupiah(p.loan_deduction_amount)} | Diterima {formatRupiah(p.cash_paid_amount)}
                                                        </p>
                                                    )}
                                                    {p.attendance_summary && (
                                                        <p className="text-[11px] text-indigo-700">
                                                            Absensi: {p.attendance_summary.total_present ?? 0} hari masuk • {p.attendance_summary.total_hours_formatted || '0 mnt'}
                                                        </p>
                                                    )}
                                                    {p.allowance_breakdown?.items?.length > 0 && (
                                                        <p className="text-[11px] text-gray-500">
                                                            Pokok {formatRupiah(p.allowance_breakdown.gaji_pokok || 0)}
                                                            {p.allowance_breakdown.items
                                                                .map((it) => ` + ${it.nama} (${it.jenis === 'harian' ? `${it.multiplier ?? 0}hr×${formatRupiah(it.nominal)}` : 'bln'}: ${formatRupiah(it.subtotal)})`)
                                                                .join('')}
                                                        </p>
                                                    )}
                                                    {p.catatan && <p className="text-xs text-gray-400">{p.catatan}</p>}
                                                </div>
                                                <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(p.created_at)}</span>
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
                        </>
                    ) : (
                        /* STEP 2: KONFIRMASI WAKTU KERJA & JUMLAH GAJI */
                        <div className="p-5 space-y-4">
                            <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900">
                                Periksa dan konfirmasi kebenaran <strong>waktu kerja (absensi)</strong>, <strong>jumlah gaji</strong>,
                                <strong> potongan pinjaman</strong>, serta <strong>rekening tujuan</strong> sebelum memproses pembayaran.
                            </div>

                            {/* Konfirmasi Waktu Kerja */}
                            <div className="rounded-xl border border-indigo-200 bg-white p-3.5 space-y-2">
                                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide flex items-center gap-1.5">
                                    <Clock size={14} className="text-indigo-600" /> 1. Konfirmasi Waktu Kerja Karyawan
                                </h4>
                                <div className="text-xs space-y-1 text-gray-700">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Periode Absensi:</span>
                                        <span className="font-semibold">{attendanceSummary?.period_label || '-'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Jumlah Waktu Masuk / Hadir:</span>
                                        <span className="font-bold text-indigo-800">{attendanceSummary?.total_present ?? 0} hari</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Ketepatan Waktu:</span>
                                        <span className="font-medium">
                                            {attendanceSummary?.total_on_time ?? 0} tepat waktu, {attendanceSummary?.total_late ?? 0} terlambat
                                            {(attendanceSummary?.total_late_minutes ?? 0) > 0 ? ` (${attendanceSummary.total_late_minutes} mnt)` : ''}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Total Durasi Jam Kerja:</span>
                                        <span className="font-bold text-indigo-800">{attendanceSummary?.total_hours_formatted || '0 mnt'}</span>
                                    </div>
                                    {attendanceSummary?.average_clock_in && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Rata-rata Jam Masuk:</span>
                                            <span className="font-medium">{attendanceSummary.average_clock_in}</span>
                                        </div>
                                    )}
                                    {attendanceNote.trim() && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Catatan Absensi:</span>
                                            <span className="font-medium">{attendanceNote.trim()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Konfirmasi Rincian Gaji */}
                            <div className="rounded-xl border border-emerald-200 bg-white p-3.5 space-y-2">
                                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                                    <DollarSign size={14} className="text-emerald-600" /> 2. Konfirmasi Rincian Gaji &amp; Hutang
                                </h4>
                                {isMonthly && salaryBreakdown && (
                                    <div className="pb-2 mb-1 border-b border-emerald-100">
                                        <SalaryBreakdownItems breakdown={salaryBreakdown} />
                                        {member.tipe_gaji === 'campuran' && unpaid > 0 && (
                                            <div className="flex items-center justify-between text-xs text-gray-700 mt-1">
                                                <span>Upah Proyek Belum Dibayar</span>
                                                <span className="font-semibold text-gray-900">{formatRupiah(unpaid)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="text-xs space-y-1 text-gray-700">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Jumlah Gaji (Bruto):</span>
                                        <span className="font-bold text-gray-900">{formatRupiah(numericNominal)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Sudah Diambil Periode Ini:</span>
                                        <span className="font-medium">{formatRupiah(alreadyPaidInPeriod)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Potong Pinjaman / Hutang:</span>
                                        <span className="font-semibold text-blue-700">-{formatRupiah(requestedDeduction)}</span>
                                    </div>
                                    {loanOutstanding > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Sisa Pinjaman Setelah Bayar:</span>
                                            <span className="font-medium text-amber-700">{formatRupiah(remainingLoanAfter)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between pt-2 border-t border-emerald-100 text-sm">
                                        <span className="font-bold text-emerald-900">Gaji yang Dibayarkan (Bersih):</span>
                                        <span className="font-extrabold text-emerald-700">{formatRupiah(netPayableAmount)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Konfirmasi Bank & WA */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5 text-xs">
                                <h4 className="font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                                    <CreditCard size={14} className="text-slate-600" /> 3. Pengiriman Pembayaran &amp; WhatsApp
                                </h4>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Dikirim Ke:</span>
                                    <span className="font-semibold text-gray-900 text-right">
                                        {paymentMethod === 'transfer'
                                            ? `${bankName} ${accountNumber ? `(${accountNumber})` : ''} a.n. ${accountHolder || member.nama}`
                                            : 'Tunai / Cash Langsung'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Notifikasi WhatsApp Pegawai:</span>
                                    <span className={`font-semibold ${sendWhatsapp ? 'text-emerald-700' : 'text-gray-500'}`}>
                                        {sendWhatsapp ? `Ya -> ${employeePhone}` : 'Tidak dikirim'}
                                    </span>
                                </div>
                                {catatan.trim() && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Catatan:</span>
                                        <span className="font-medium text-gray-800">{catatan.trim()}</span>
                                    </div>
                                )}
                            </div>

                            {/* Confirmation Checkbox */}
                            <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={confirmWorkAndSalary}
                                    onChange={(e) => setConfirmWorkAndSalary(e.target.checked)}
                                    className="mt-0.5 rounded border-amber-400 text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="text-xs font-semibold text-amber-950">
                                    Saya konfirmasi data waktu kerja ({attendanceSummary?.total_present ?? 0} hari hadir,{' '}
                                    {attendanceSummary?.total_hours_formatted || '0 mnt'}) dan jumlah gaji bersih sebesar{' '}
                                    {formatRupiah(netPayableAmount)} sudah benar.
                                </span>
                            </label>

                            <div className="flex gap-3 justify-between pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setStep('form'); setFormError(''); }}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
                                >
                                    <ArrowLeft size={15} /> Kembali Ubah
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmAndPay}
                                    disabled={saving || !confirmWorkAndSalary}
                                    className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold text-sm"
                                >
                                    <CheckCircle size={15} />
                                    {saving ? 'Memproses...' : 'Konfirmasi & Bayar Sekarang'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {loanChoicePromptOpen && loanOutstanding > 0 && (
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
                                {loanContext?.borrower?.name || member.nama} masih memiliki sisa pinjaman {formatRupiah(loanOutstanding)}.
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

    const [activeTab, setActiveTab] = useState('karyawan');
    const [memberToEdit, setMemberToEdit] = useState(null);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const [paymentFeedback, setPaymentFeedback] = useState(null);

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

    const handleDeleteMember = async (id, nama) => {
        if (!confirm(`Hapus data karyawan "${nama}"?`)) return;
        try {
            const res = await fetch(`/api/payroll/members/${id}`, {
                method: 'DELETE',
                headers: API_HEADERS(),
            });
            const d = await res.json();
            if (res.ok) {
                fetchData();
            } else {
                alert(d.error || d.message || 'Gagal menghapus karyawan');
            }
        } catch {
            alert('Terjadi kesalahan');
        }
    };

    const handleEdit = (project) => {
        setEditProject(project);
        setShowProjectModal(true);
    };

    const handleMemberSaved = () => {
        fetchData();
    };

    const filteredProjects = data.projects.filter(p => filter === 'all' || p.status === filter);
    const totalUnpaidAll = data.unpaid_summary.reduce((sum, m) => sum + Number(m.total_unpaid || 0), 0);

    const activeMembers = members.filter(m => m.is_active !== false);
    const totalBebanGaji = activeMembers.reduce(
        (sum, m) => sum + Number(m.total_gaji_bulanan ?? ((Number(m.gaji_pokok || 0) + Number(m.tunjangan_bulanan_total ?? m.tunjangan ?? 0)))),
        0
    );
    const totalGajiPokok = activeMembers.reduce((sum, m) => sum + Number(m.gaji_pokok || 0), 0);
    const totalTunjanganBulanan = activeMembers.reduce(
        (sum, m) => sum + Number(m.tunjangan_bulanan_total ?? m.tunjangan ?? 0),
        0
    );
    const totalTunjanganHarianRate = activeMembers.reduce(
        (sum, m) => sum + Number(m.tunjangan_harian_per_hari || 0),
        0
    );

    const todayDateNum = new Date().getDate();

    const filteredMembersList = members.filter(m => {
        if (!memberSearchQuery.trim()) return true;
        const q = memberSearchQuery.toLowerCase();
        return (m.nama && m.nama.toLowerCase().includes(q)) ||
               (m.telepon && m.telepon.includes(q)) ||
               (m.nama_bank && m.nama_bank.toLowerCase().includes(q)) ||
               (m.nomor_rekening && m.nomor_rekening.toLowerCase().includes(q)) ||
               (m.atas_nama_rekening && m.atas_nama_rekening.toLowerCase().includes(q));
    });

    const handleOpenPayModal = (memberObj) => {
        const enriched = data.unpaid_summary.find(u => u.id === memberObj.id);
        setPayMember(enriched ? { ...memberObj, ...enriched } : memberObj);
    };

    const handleMemberPaid = (response) => {
        fetchData();
        if (response?.message) {
            const waStatus = response?.whatsapp?.status;
            const waText = waStatus === 'sent'
                ? `Slip gaji terkirim ke WhatsApp (${response.whatsapp.phone}).`
                : waStatus === 'skipped'
                    ? `WhatsApp dilewati: ${response.whatsapp.error}`
                    : waStatus === 'failed'
                        ? `WhatsApp gagal dikirim: ${response.whatsapp.error}`
                        : null;
            setPaymentFeedback({
                type: waStatus === 'failed' ? 'warning' : 'success',
                message: response.message,
                whatsappNote: waText,
            });
        }
    };

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
                    <h1 className="text-2xl font-bold text-gray-800">Manajemen Penggajian &amp; Payroll</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        Pengaturan gaji pokok, tanggal gajian per karyawan, dan upah proyek teknisi
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => { setMemberToEdit(null); setShowMemberModal(true); }}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 transition font-medium shadow-sm text-sm"
                    >
                        <Plus size={18} /> Tambah Karyawan &amp; Gaji
                    </button>
                    <button
                        onClick={() => { setEditProject(null); setShowProjectModal(true); }}
                        className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition font-medium shadow-sm text-sm"
                    >
                        <Plus size={18} /> Tambah Proyek
                    </button>
                </div>
            </div>

            {paymentFeedback && (
                <div className={`rounded-xl border px-4 py-3 flex items-start justify-between gap-3 ${
                    paymentFeedback.type === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}>
                    <div className="text-sm">
                        <p className="font-semibold">{paymentFeedback.message}</p>
                        {paymentFeedback.whatsappNote && (
                            <p className="text-xs mt-0.5 opacity-90">{paymentFeedback.whatsappNote}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setPaymentFeedback(null)}
                        className="p-1 rounded-lg hover:bg-black/5"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('karyawan')}
                    className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
                        activeTab === 'karyawan'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Users size={16} />
                    Data Karyawan &amp; Gaji Bulanan
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-bold">
                        {members.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('proyek')}
                    className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
                        activeTab === 'proyek'
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Wallet size={16} />
                    Upah Proyek Pemasangan
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-bold">
                        {data.projects.length}
                    </span>
                </button>
            </div>

            {/* ══════════════════ TAB 1: DATA KARYAWAN & GAJI BULANAN ══════════════════ */}
            {activeTab === 'karyawan' && (
                <div className="space-y-5">
                    {/* KPI Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-white rounded-xl p-4 border shadow-sm">
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                <Users size={14} className="text-blue-500" /> Total Karyawan
                            </div>
                            <div className="text-xl font-bold text-gray-900 mt-1">
                                {activeMembers.length} <span className="text-xs font-normal text-gray-500">orang aktif</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                                {members.length - activeMembers.length > 0 ? `${members.length - activeMembers.length} non-aktif` : 'Semua aktif'}
                            </div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border shadow-sm">
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                <Wallet size={14} className="text-emerald-500" /> Gaji Pokok Bulanan
                            </div>
                            <div className="text-xl font-bold text-gray-900 mt-1">
                                {formatRupiah(totalGajiPokok)}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">Total gaji pokok seluruh staf</div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border shadow-sm">
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                <DollarSign size={14} className="text-purple-500" /> Tunjangan Bulanan &amp; Harian
                            </div>
                            <div className="text-xl font-bold text-gray-900 mt-1">
                                {formatRupiah(totalTunjanganBulanan)} <span className="text-xs font-normal text-gray-500">/ bln</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                {totalTunjanganHarianRate > 0
                                    ? `+${formatRupiah(totalTunjanganHarianRate)} / hari masuk (tarif harian)`
                                    : 'Tunjangan tetap & tunjangan absen harian'}
                            </div>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 shadow-sm">
                            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                <Calendar size={14} className="text-blue-600" /> Beban Gaji Tetap / Bulan
                            </div>
                            <div className="text-xl font-bold text-blue-900 mt-1">
                                {formatRupiah(totalBebanGaji)}
                            </div>
                            <div className="text-xs text-blue-600 mt-0.5">Gaji pokok + tunjangan bulanan tetap</div>
                        </div>
                    </div>

                    {/* Search & Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Cari nama, no HP, atau rekening..."
                                value={memberSearchQuery}
                                onChange={e => setMemberSearchQuery(e.target.value)}
                                className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                        </div>
                        <span className="text-xs text-gray-500">
                            Menampilkan {filteredMembersList.length} karyawan
                        </span>
                    </div>

                    {/* Employee Table */}
                    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b text-xs uppercase text-gray-500 font-semibold tracking-wider">
                                    <tr>
                                        <th className="text-left px-4 py-3">Karyawan</th>
                                        <th className="text-left px-4 py-3">Sistem Gaji</th>
                                        <th className="text-right px-4 py-3">Gaji Pokok</th>
                                        <th className="text-right px-4 py-3">Tunjangan</th>
                                        <th className="text-right px-4 py-3">Total / Bulan</th>
                                        <th className="text-center px-4 py-3">🗓️ Tanggal Gajian</th>
                                        <th className="text-left px-4 py-3">Rekening</th>
                                        <th className="text-center px-4 py-3">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredMembersList.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="text-center py-10 text-gray-400">
                                                Belum ada data karyawan. Klik tombol "+ Tambah Karyawan &amp; Gaji" untuk menambahkan.
                                            </td>
                                        </tr>
                                    ) : filteredMembersList.map(m => {
                                        const isPaydayToday = Number(m.tanggal_gajian) === todayDateNum;
                                        const monthlyAllowanceTotal = Number(m.tunjangan_bulanan_total ?? m.tunjangan ?? 0);
                                        const dailyAllowanceRate = Number(m.tunjangan_harian_per_hari || 0);
                                        const totalGaji = (Number(m.gaji_pokok) || 0) + monthlyAllowanceTotal;
                                        return (
                                            <tr key={m.id} className={`hover:bg-gray-50 transition ${isPaydayToday ? 'bg-amber-50/40' : ''}`}>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm flex-shrink-0">
                                                            {m.nama.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                                                                {m.nama}
                                                                {m.is_active === false && (
                                                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-200 text-gray-600">Non-aktif</span>
                                                                )}
                                                            </div>
                                                            {m.telepon && (
                                                                <a
                                                                    href={`https://wa.me/${m.telepon.replace(/\D/g, '')}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-xs text-blue-600 hover:underline"
                                                                >
                                                                    {m.telepon}
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 whitespace-nowrap">
                                                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                                                        m.tipe_gaji === 'bulanan'
                                                            ? 'bg-blue-100 text-blue-700'
                                                            : m.tipe_gaji === 'campuran'
                                                            ? 'bg-purple-100 text-purple-700'
                                                            : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {m.tipe_gaji === 'bulanan' ? 'Bulanan Tetap' : m.tipe_gaji === 'campuran' ? 'Pokok + Proyek' : 'Upah Proyek'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-right font-medium text-gray-700 whitespace-nowrap">
                                                    {formatRupiah(m.gaji_pokok || 0)}
                                                </td>
                                                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                    <AllowanceTagList
                                                        allowances={m.allowances}
                                                        fallbackMonthlyTotal={monthlyAllowanceTotal}
                                                        align="right"
                                                    />
                                                </td>
                                                <td className="px-4 py-3.5 text-right font-bold text-gray-900 whitespace-nowrap">
                                                    <div>{formatRupiah(totalGaji)}</div>
                                                    {dailyAllowanceRate > 0 && (
                                                        <div className="text-[11px] font-medium text-amber-700">
                                                            +{formatRupiah(dailyAllowanceRate)}/hr masuk
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${
                                                        isPaydayToday
                                                            ? 'bg-green-100 text-green-800 ring-1 ring-green-400 animate-pulse'
                                                            : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        🗓️ Tgl {m.tanggal_gajian || 1}
                                                        {isPaydayToday && ' (Hari Ini 🎉)'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-xs text-gray-600 whitespace-nowrap">
                                                    {m.nama_bank ? (
                                                        <div>
                                                            <span className="font-semibold text-gray-800">{m.nama_bank}</span>
                                                            {m.nomor_rekening && <span className="block text-gray-500">{m.nomor_rekening}</span>}
                                                            {m.atas_nama_rekening && <span className="block text-[11px] text-gray-400">a.n. {m.atas_nama_rekening}</span>}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setMemberToEdit(m); setShowMemberModal(true); }}
                                                            className="text-xs px-2 py-1 rounded-lg border border-dashed border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium"
                                                        >
                                                            + Isi Rekening
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button
                                                            onClick={() => handleOpenPayModal(m)}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition"
                                                            title="Bayar Gaji Karyawan"
                                                        >
                                                            <DollarSign size={13} /> Bayar
                                                        </button>
                                                        <button
                                                            onClick={() => { setMemberToEdit(m); setShowMemberModal(true); }}
                                                            className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
                                                            title="Edit Pengaturan Gaji"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteMember(m.id, m.nama)}
                                                            className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition"
                                                            title="Hapus Karyawan"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ TAB 2: UPAH PROYEK PEMASANGAN ══════════════════ */}
            {activeTab === 'proyek' && (
                <div className="space-y-6">
                    {/* Unpaid Summary Cards */}
                    {data.unpaid_summary.filter(m => Number(m.total_unpaid) > 0).length > 0 && (
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-orange-800 flex items-center gap-2">
                                    <Wallet size={20} /> Upah Proyek Belum Dibayarkan
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
                                            onClick={() => handleOpenPayModal(m)}
                                            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                                        >
                                            <DollarSign size={15} /> Bayar Upah
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
                </div>
            )}

            {/* Modals */}
            <ProjectFormModal
                isOpen={showProjectModal}
                onClose={() => { setShowProjectModal(false); setEditProject(null); }}
                onSaved={fetchData}
                editProject={editProject}
                allMembers={members}
                inventoryItems={inventoryItems}
                onAddMember={() => { setMemberToEdit(null); setShowMemberModal(true); }}
            />
            <MemberSalaryModal
                isOpen={showMemberModal}
                onClose={() => { setShowMemberModal(false); setMemberToEdit(null); }}
                onSaved={handleMemberSaved}
                memberToEdit={memberToEdit}
            />
            <PayMemberModal
                isOpen={!!payMember}
                onClose={() => setPayMember(null)}
                onPaid={handleMemberPaid}
                member={payMember}
            />
        </div>
    );
}
