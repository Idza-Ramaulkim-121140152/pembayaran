import { useState, useEffect, useRef } from 'react';
import { Search, FileText, Send, Check, X, Eye, Clock, AlertTriangle, Users, ChevronDown, ChevronUp, Copy, ExternalLink, ShieldAlert } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import billingService from '../../services/billingService';

function BillingPage() {
    const userRole = window.appUserRole || 'admin';
    const canEditInvoiceAmount = userRole === 'finance' || userRole === 'superadmin' || userRole === 'admin';

    const [customers, setCustomers] = useState({ late: [], almostLate: [], others: [], paid: [] });
    const [activePackages, setActivePackages] = useState([]);
    const [loadingActivePackages, setLoadingActivePackages] = useState(false);
    const [paymentReceiptOptions, setPaymentReceiptOptions] = useState([]);
    const [loadingPaymentReceiptOptions, setLoadingPaymentReceiptOptions] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [loadingIsolationStatus, setLoadingIsolationStatus] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [search, setSearch] = useState('');
    const [isolationStatus, setIsolationStatus] = useState({});
    const latestBillingRequestRef = useRef(0);
    const skipFirstSearchFetchRef = useRef(true);
    
    // Modal states
    const [createModal, setCreateModal] = useState({ open: false, customer: null, suggestedPackage: null });
    const [servicePackageModal, setServicePackageModal] = useState({ open: false, customer: null, selectedPackageId: '' });
    const [confirmModal, setConfirmModal] = useState({ open: false, invoice: null, customer: null });
    const [permissionModal, setPermissionModal] = useState({ open: false, message: '' });
    const [rejectModal, setRejectModal] = useState({ open: false, invoice: null });
    const [linkModal, setLinkModal] = useState({ open: false, invoice: null, customer: null });
    const [resultModal, setResultModal] = useState({ open: false, data: null });
    const [editAmountModal, setEditAmountModal] = useState({ open: false, invoice: null, customer: null });
    const [invalidServiceModal, setInvalidServiceModal] = useState({ open: false, segment: null, rows: [] });
    const [autoResultModal, setAutoResultModal] = useState({ open: false, segment: null, summary: null, results: [] });
    const [autoProcessModal, setAutoProcessModal] = useState({
        open: false,
        segment: null,
        jobId: null,
        state: 'queued',
        phase: 'queued',
        summary: null,
        errorMessage: null,
    });
    
    // Form states
    const [amount, setAmount] = useState('');
    const [paidAmount, setPaidAmount] = useState('');
    const [paymentReceiptOptionId, setPaymentReceiptOptionId] = useState('');
    const [newInvoiceAmount, setNewInvoiceAmount] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [updatingCustomerService, setUpdatingCustomerService] = useState(false);
    const [autoSubmitting, setAutoSubmitting] = useState(false);
    const autoPollingTimerRef = useRef(null);

    // Collapsed sections
    const [collapsed, setCollapsed] = useState({ late: false, almostLate: false, others: true, paid: true });

    useEffect(() => {
        fetchBillingData('', { isInitialLoad: true });
    }, []);

    useEffect(() => {
        if (!hasLoadedOnce) return;
        if (skipFirstSearchFetchRef.current) {
            skipFirstSearchFetchRef.current = false;
            return;
        }

        const timer = setTimeout(() => {
            fetchBillingData(search);
        }, 350);

        return () => clearTimeout(timer);
    }, [search, hasLoadedOnce]);

    useEffect(() => {
        fetchPaymentReceiptOptions();
    }, []);

    useEffect(() => {
        fetchActivePackages();
    }, []);

    useEffect(() => {
        return () => {
            if (autoPollingTimerRef.current) {
                clearTimeout(autoPollingTimerRef.current);
                autoPollingTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!confirmModal.open || paymentReceiptOptionId || paymentReceiptOptions.length === 0) {
            return;
        }

        setPaymentReceiptOptionId(resolveDefaultPaymentReceiptOptionId(paymentReceiptOptions));
    }, [confirmModal.open, paymentReceiptOptionId, paymentReceiptOptions]);

    const fetchPaymentReceiptOptions = async () => {
        try {
            setLoadingPaymentReceiptOptions(true);
            const response = await billingService.getActivePaymentReceiptOptions();
            setPaymentReceiptOptions(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            console.error('Gagal memuat opsi penerimaan pembayaran aktif', err);
        } finally {
            setLoadingPaymentReceiptOptions(false);
        }
    };

    const fetchActivePackages = async () => {
        try {
            setLoadingActivePackages(true);
            const response = await billingService.getActivePackages();
            const packageData = Array.isArray(response?.data?.data) ? response.data.data : [];
            setActivePackages(packageData);
        } catch (err) {
            console.error('Gagal memuat data paket aktif', err);
        } finally {
            setLoadingActivePackages(false);
        }
    };

    const resolveDefaultPaymentReceiptOptionId = (options) => {
        if (!Array.isArray(options) || options.length === 0) {
            return '';
        }

        const defaultOption = options.find((option) => option.is_default) || options[0];
        return defaultOption ? String(defaultOption.id) : '';
    };

    const getPaymentReceiptOptionLabel = (option) => {
        if (!option) return '-';
        return option.name || '-';
    };

    const closeConfirmModal = () => {
        setConfirmModal({ open: false, invoice: null, customer: null });
        setPaidAmount('');
        setPaymentReceiptOptionId('');
    };

    const openConfirmModal = (invoice, customer) => {
        setConfirmModal({ open: true, invoice, customer });

        // Parse amount dari invoice (handle decimal dari database)
        const amount = parseFloat(invoice.amount);
        setPaidAmount(isNaN(amount) ? '' : Math.round(amount).toString());
        setPaymentReceiptOptionId(resolveDefaultPaymentReceiptOptionId(paymentReceiptOptions));
    };

    const fetchIsolationStatusBulk = async (lateItems, requestId) => {
        const customerIds = (lateItems || [])
            .map((item) => item?.customer?.id)
            .filter(Boolean);

        if (customerIds.length === 0) {
            if (requestId === latestBillingRequestRef.current) {
                setIsolationStatus({});
                setLoadingIsolationStatus(false);
            }
            return;
        }

        try {
            if (requestId === latestBillingRequestRef.current) {
                setLoadingIsolationStatus(true);
            }

            const response = await billingService.getBulkIsolationStatus(customerIds);
            if (requestId !== latestBillingRequestRef.current) return;

            setIsolationStatus(response?.data?.data || {});
        } catch (err) {
            if (requestId !== latestBillingRequestRef.current) return;
            setIsolationStatus({});
            console.error('Gagal memuat status isolir pelanggan', err);
        } finally {
            if (requestId === latestBillingRequestRef.current) {
                setLoadingIsolationStatus(false);
            }
        }
    };

    const fetchBillingData = async (searchValue = '', options = {}) => {
        const { isInitialLoad = false } = options;
        const requestId = latestBillingRequestRef.current + 1;
        latestBillingRequestRef.current = requestId;

        try {
            setLoading(true);
            if (!isInitialLoad) {
                setLoadingIsolationStatus(false);
            }

            const response = await billingService.getAll({
                search: searchValue,
                include_isolation_status: false,
            });
            if (requestId !== latestBillingRequestRef.current) return;

            const payload = response?.data?.data || {};
            setCustomers({
                late: payload.late || [],
                almostLate: payload.almostLate || [],
                others: payload.others || [],
                paid: payload.paid || [],
            });

            setIsolationStatus({});
            fetchIsolationStatusBulk(payload.late || [], requestId);
        } catch (err) {
            if (requestId !== latestBillingRequestRef.current) return;
            setError('Gagal memuat data penagihan');
            console.error(err);
        } finally {
            if (requestId === latestBillingRequestRef.current) {
                setLoading(false);
                setHasLoadedOnce(true);
            }
        }
    };

    const normalizeServiceLabel = (value) => (value || '').toString().trim().toLowerCase();

    const getCustomerServiceLabel = (customer) => {
        if (!customer) return '';
        return customer.package_type || customer.custom_package || '';
    };

    const findMatchingPackage = (serviceLabel) => {
        const normalizedService = normalizeServiceLabel(serviceLabel);
        if (!normalizedService) return null;
        return activePackages.find((pkg) => normalizeServiceLabel(pkg.name) === normalizedService) || null;
    };

    const resolveSuggestedAmount = (price) => {
        const numericPrice = parseFloat(price);
        if (isNaN(numericPrice) || numericPrice <= 0) return '';
        return Math.round(numericPrice).toString();
    };

    const updateCustomerInLists = (updatedCustomer) => {
        const mergeCustomerItem = (item) => {
            if (item?.customer?.id !== updatedCustomer.id) return item;
            return {
                ...item,
                customer: {
                    ...item.customer,
                    ...updatedCustomer,
                },
            };
        };

        setCustomers((prev) => ({
            ...prev,
            late: (prev.late || []).map(mergeCustomerItem),
            almostLate: (prev.almostLate || []).map(mergeCustomerItem),
            others: (prev.others || []).map(mergeCustomerItem),
            paid: (prev.paid || []).map(mergeCustomerItem),
        }));
    };

    const openCreateModalWithSuggestion = (customer, matchedPackage) => {
        const suggestedAmount = resolveSuggestedAmount(matchedPackage?.price);
        setCreateModal({
            open: true,
            customer,
            suggestedPackage: matchedPackage || null,
        });
        setAmount(suggestedAmount);
    };

    const handleOpenCreateInvoice = (customer) => {
        if (loadingActivePackages) {
            setError('Data paket sedang dimuat. Coba lagi beberapa detik.');
            return;
        }

        const serviceLabel = getCustomerServiceLabel(customer);
        const matchedPackage = findMatchingPackage(serviceLabel);

        if (matchedPackage) {
            openCreateModalWithSuggestion(customer, matchedPackage);
            return;
        }

        if (activePackages.length === 0) {
            setError('Belum ada paket aktif di pengaturan paket. Tambahkan paket terlebih dahulu.');
            return;
        }

        setServicePackageModal({
            open: true,
            customer,
            selectedPackageId: String(activePackages[0].id),
        });
    };

    const closeCreateModal = () => {
        setCreateModal({ open: false, customer: null, suggestedPackage: null });
        setAmount('');
    };

    const closeServicePackageModal = () => {
        setServicePackageModal({ open: false, customer: null, selectedPackageId: '' });
    };

    const handleServicePackageSubmit = async (e) => {
        e.preventDefault();
        if (!servicePackageModal.customer?.id) return;

        const selectedPackage = activePackages.find(
            (pkg) => String(pkg.id) === String(servicePackageModal.selectedPackageId)
        );

        if (!selectedPackage) {
            setError('Pilih layanan yang tersedia terlebih dahulu.');
            return;
        }

        try {
            setUpdatingCustomerService(true);
            setError(null);
            setSuccess(null);

            const response = await billingService.updateCustomerServicePackage(
                servicePackageModal.customer.id,
                selectedPackage.id
            );

            const updatedCustomer = response?.data?.data?.customer || {
                ...servicePackageModal.customer,
                package_type: selectedPackage.name,
                custom_package: null,
            };

            updateCustomerInLists(updatedCustomer);
            closeServicePackageModal();
            setSuccess(response?.data?.message || `Layanan pelanggan diperbarui ke ${selectedPackage.name}.`);
            openCreateModalWithSuggestion(updatedCustomer, selectedPackage);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui layanan pelanggan.');
        } finally {
            setUpdatingCustomerService(false);
        }
    };

    const handleIsolateCustomer = async (customerId) => {
        if (!confirm('Yakin ingin melakukan isolir pelanggan ini?')) return;
        try {
            setSubmitting(true);
            setError(null);
            setSuccess(null);
            const response = await billingService.isolateCustomer(customerId);
            const data = response.data;
            const savedProfile = data.data?.saved_profile || '';
            setSuccess(
                `${data.message || 'Berhasil diisolir'}` +
                (savedProfile ? ` (profil "${savedProfile}" tersimpan untuk pemulihan)` : '')
            );
            
            // Refresh data to get updated isolation status
            await fetchBillingData(search);
        } catch (err) {
            const msg = err.response?.data?.message || err.response?.data?.error || 'Gagal melakukan isolir';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const phaseLabel = (phase) => {
        switch (phase) {
            case 'verify_wa':
                return 'Verifikasi nomor WA';
            case 'verify_service':
                return 'Verifikasi layanan & nominal';
            case 'create_invoice':
                return 'Membuat invoice';
            case 'send_wa':
                return 'Mengirim WhatsApp';
            case 'done':
                return 'Selesai';
            default:
                return 'Menunggu antrean';
        }
    };

    const stopAutoPolling = () => {
        if (autoPollingTimerRef.current) {
            clearTimeout(autoPollingTimerRef.current);
            autoPollingTimerRef.current = null;
        }
    };

    const pollAutoInvoiceStatus = async (jobId, segment) => {
        try {
            const response = await billingService.getAutoInvoiceStatus(jobId);
            const payload = response?.data || {};
            const summary = payload.summary || {};
            const results = Array.isArray(payload.results) ? payload.results : [];
            const invalidServices = Array.isArray(payload.invalid_services) ? payload.invalid_services : [];

            setAutoProcessModal((prev) => ({
                ...prev,
                open: true,
                segment,
                jobId,
                state: payload.state || 'queued',
                phase: payload.phase || 'queued',
                summary,
                errorMessage: payload.error_message || null,
            }));

            if (payload.state === 'completed' || payload.state === 'failed') {
                stopAutoPolling();
                setAutoSubmitting(false);

                setAutoProcessModal((prev) => ({
                    ...prev,
                    state: payload.state || prev.state,
                    phase: payload.phase || prev.phase,
                    summary,
                    errorMessage: payload.error_message || null,
                }));

                if (invalidServices.length > 0) {
                    setInvalidServiceModal({
                        open: true,
                        segment,
                        rows: invalidServices,
                    });
                }

                setAutoResultModal({
                    open: true,
                    segment,
                    summary,
                    results,
                });

                if (payload.state === 'failed') {
                    setError(payload.error_message || 'Proses auto invoice gagal.');
                } else if (invalidServices.length > 0) {
                    setError(payload.error_message || 'Ada layanan pelanggan yang belum valid.');
                } else {
                    setSuccess('Proses auto invoice selesai.');
                }

                fetchBillingData(search);
                return;
            }

            autoPollingTimerRef.current = setTimeout(() => {
                pollAutoInvoiceStatus(jobId, segment);
            }, 1500);
        } catch (err) {
            stopAutoPolling();
            setAutoSubmitting(false);
            setAutoProcessModal((prev) => ({
                ...prev,
                state: 'failed',
                phase: 'done',
                errorMessage: err.response?.data?.message || 'Gagal membaca status proses auto invoice.',
            }));
            setError(err.response?.data?.message || 'Gagal membaca status proses auto invoice.');
        }
    };

    const runAutoInvoice = async (segment) => {
        const source = segment === 'late' ? (customers.late || []) : (customers.almostLate || []);
        const customerIds = source
            .map((item) => item?.customer?.id)
            .filter(Boolean);

        if (customerIds.length === 0) {
            setError('Tidak ada pelanggan pada section ini.');
            return;
        }

        try {
            setAutoSubmitting(true);
            setError(null);
            setSuccess(null);
            stopAutoPolling();

            const response = await billingService.startAutoInvoice({
                segment,
                customer_ids: customerIds,
                search_context: search || null,
            });

            const payload = response?.data || {};
            const jobId = payload.job_id;
            if (!jobId) {
                throw new Error('Job ID tidak diterima dari server.');
            }

            setAutoProcessModal({
                open: true,
                segment,
                jobId,
                state: payload.state || 'queued',
                phase: payload.phase || 'queued',
                summary: payload.summary || null,
                errorMessage: null,
            });

            pollAutoInvoiceStatus(jobId, segment);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menjalankan auto invoice.');
            setAutoSubmitting(false);
        } finally {
        }
    };

    const openServicePackageModalFromInvalid = (invalidRow) => {
        const customer = [...customers.late, ...customers.almostLate, ...customers.others, ...customers.paid]
            .map((item) => item?.customer)
            .find((row) => row?.id === invalidRow.customer_id);

        if (!customer) {
            setError('Data pelanggan tidak ditemukan di daftar saat ini. Refresh halaman lalu coba lagi.');
            return;
        }

        if (activePackages.length === 0) {
            setError('Belum ada paket aktif di pengaturan paket. Tambahkan paket terlebih dahulu.');
            return;
        }

        setServicePackageModal({
            open: true,
            customer,
            selectedPackageId: String(activePackages[0].id),
        });
    };

    const handleCreateInvoice = async (e) => {
        e.preventDefault();
        // Parse amount untuk mendapatkan angka murni (hapus semua titik/koma)
        const numericAmount = amount ? parseInt(amount.toString().replace(/[^\d]/g, ''), 10) : 0;
        
        if (!numericAmount || numericAmount <= 0) {
            setError('Nominal tagihan harus diisi');
            return;
        }
        
        try {
            setSubmitting(true);
            const response = await billingService.createInvoice(createModal.customer.id, numericAmount);
            const createdInvoiceData = response.data.data;
            const responseMessage = response.data?.message;
            closeCreateModal();
            setResultModal({
                open: true,
                data: {
                    ...createdInvoiceData,
                    customer: createModal.customer,
                },
            });
            if (responseMessage) {
                setSuccess(responseMessage);
            }
            fetchBillingData(search);
        } catch (err) {
            setError(err.response?.data?.error || err.response?.data?.message || 'Gagal membuat tagihan');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmPayment = async (e) => {
        e.preventDefault();

        if (paymentReceiptOptions.length > 0 && !paymentReceiptOptionId) {
            setError('Pilih metode pada Terima via sebelum konfirmasi pembayaran.');
            return;
        }

        try {
            setSubmitting(true);
            setError(null);
            setSuccess(null);
            // Parse paidAmount untuk mendapatkan angka murni (hapus semua titik/koma)
            const numericAmount = paidAmount ? parseInt(paidAmount.toString().replace(/[^\d]/g, ''), 10) : confirmModal.invoice.amount;
            const selectedPaymentReceiptOptionId = paymentReceiptOptionId ? parseInt(paymentReceiptOptionId, 10) : null;
            const normalizedPaymentReceiptOptionId = Number.isNaN(selectedPaymentReceiptOptionId) ? null : selectedPaymentReceiptOptionId;

            const response = await billingService.confirmPayment(
                confirmModal.invoice.id,
                numericAmount,
                normalizedPaymentReceiptOptionId
            );

            closeConfirmModal();
            const data = response.data;
            setSuccess(data.message || 'Pembayaran berhasil dikonfirmasi');
            fetchBillingData(search);
        } catch (err) {
            const status = err.response?.status;
            const message = err.response?.data?.message || err.response?.data?.error || 'Gagal mengkonfirmasi pembayaran';

            if (status === 403) {
                closeConfirmModal();
                setPermissionModal({
                    open: true,
                    message: message || 'Anda tidak diizinkan melakukan konfirmasi pembayaran.',
                });
            } else {
                setError(message);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectPayment = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            await billingService.rejectPayment(rejectModal.invoice.id, rejectReason);
            setRejectModal({ open: false, invoice: null });
            setRejectReason('');
            setSuccess('Pembayaran berhasil ditolak');
            fetchBillingData(search);
        } catch (err) {
            setError(err.response?.data?.error || 'Gagal menolak pembayaran');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateInvoiceAmount = async (e) => {
        e.preventDefault();

        const numericAmount = newInvoiceAmount ? parseInt(newInvoiceAmount.toString().replace(/[^\d]/g, ''), 10) : 0;
        if (!numericAmount || numericAmount <= 0) {
            setError('Nominal invoice harus lebih dari 0');
            return;
        }

        try {
            setSubmitting(true);
            const response = await billingService.updateInvoiceAmount(editAmountModal.invoice.id, numericAmount);
            setSuccess(response.data?.message || 'Nominal invoice berhasil diperbarui');
            setEditAmountModal({ open: false, invoice: null, customer: null });
            setNewInvoiceAmount('');
            fetchBillingData(search);
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui nominal invoice');
        } finally {
            setSubmitting(false);
        }
    };

    const copyToClipboard = (text, type) => {
        navigator.clipboard.writeText(text);
        setSuccess(`${type} berhasil disalin!`);
        setTimeout(() => setSuccess(null), 2000);
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatPaidMonth = (date) => {
        if (!date) return '';
        const monthLabel = new Date(date).toLocaleDateString('id-ID', { month: 'long' }).trim();
        return monthLabel ? monthLabel.toLowerCase() : '';
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    };

    // Format angka dengan separator ribuan (titik untuk Indonesia)
    const formatNumberWithComma = (value) => {
        if (!value && value !== 0) return '';
        // Konversi ke number dulu untuk handle decimal dari database (misal 200000.00)
        let numericValue = parseFloat(value);
        if (isNaN(numericValue)) return '';
        // Bulatkan ke integer (hapus desimal)
        numericValue = Math.round(numericValue);
        // Format dengan locale Indonesia (menggunakan titik sebagai pemisah ribuan)
        return new Intl.NumberFormat('id-ID').format(numericValue);
    };

    // Parse angka dari format dengan titik kembali ke number string
    const parseFormattedNumber = (value) => {
        if (!value) return '';
        // Konversi ke number dulu untuk handle decimal
        const num = parseFloat(value);
        if (isNaN(num)) return value.toString().replace(/[^\d]/g, '');
        return Math.round(num).toString();
    };

    // Handler untuk input dengan format
    const handleAmountChange = (e, setter) => {
        const rawValue = e.target.value.replace(/[^\d]/g, '');
        setter(rawValue);
    };

    const resolveInvoiceUrl = (invoiceOrLink) => {
        const rawLink = typeof invoiceOrLink === 'string'
            ? invoiceOrLink
            : invoiceOrLink?.invoice_link;

        if (!rawLink) return '';

        const link = rawLink.toString().trim();
        if (/^https?:\/\//i.test(link)) {
            return link;
        }

        return `${window.location.origin}/invoice/${link}`;
    };

    const generateTemplate = (customer, invoiceOrLink) => {
        const invoiceUrl = resolveInvoiceUrl(invoiceOrLink);

        return `Yth. Bapak/Ibu ${customer.name.toUpperCase()}
Username PPPoE: ${customer.pppoe_username || '-'}

Terima kasih telah menjadi bagian dari pelanggan prioritas kami.
Layanan internet anda aktif sampai ${formatDate(customer.due_date)}.

> ⓘ Informasi lengkap dan metode pembayaran tersedia pada link berikut:
${invoiceUrl}

Segera lakukan pembayaran. Jika lewat tanggal pembayaran maka layanan akan dinonaktifkan otomatis. Segera bayar untuk menghindari nonaktif otomatis.

Layanan Call Center 085158025553

Salam Hangat,
Tim Layanan Pelanggan Rumah Kita Net`;
    };

    const getWhatsAppLink = (customer, invoiceOrLink) => {
        const phone = customer.phone?.replace(/[^0-9]/g, '');
        const template = generateTemplate(customer, invoiceOrLink);
        return `https://wa.me/${phone}?text=${encodeURIComponent(template)}`;
    };

    if (loading && !hasLoadedOnce) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <LoadingSpinner text="Memuat data penagihan..." />
            </div>
        );
    }

    const CustomerTable = ({ title, data, icon: Icon, iconColor, segment, defaultCollapsed = false }) => {
        const sectionKey = title.toLowerCase().replace(/[^a-z]/g, '');
        const isCollapsed = collapsed[sectionKey] ?? defaultCollapsed;
        const canRunAutoInvoice = segment === 'late' || segment === 'almostLate';
        
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="w-full flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${iconColor}`}>
                            <Icon size={20} className="text-white" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-semibold text-gray-900">{title}</h3>
                            <p className="text-sm text-gray-500">{data.length} pelanggan</p>
                        </div>
                        {canRunAutoInvoice && (
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={() => runAutoInvoice(segment)}
                                disabled={autoSubmitting || data.length === 0}
                            >
                                <Send size={14} className="mr-1" />
                                <span className="hidden sm:inline">{autoSubmitting ? 'Memproses...' : 'Kirim Invoice Auto'}</span>
                                <span className="sm:hidden">Auto</span>
                            </Button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setCollapsed(prev => ({ ...prev, [sectionKey]: !isCollapsed }))}
                        className="p-1 rounded hover:bg-gray-100"
                    >
                        {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </button>
                </div>
                
                {!isCollapsed && (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-t border-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">No</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nama</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">PPPoE</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">Isolir</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Jatuh Tempo</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                                            Tidak ada data
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((item, index) => (
                                        <CustomerRow 
                                            key={item.customer.id} 
                                            item={item} 
                                            index={index}
                                            onIsolate={handleIsolateCustomer}
                                            isolationStatus={isolationStatus[item.customer.id]}
                                            loadingIsolationStatus={loadingIsolationStatus}
                                            isLateCustomer={title === "Pelanggan Telat"}
                                            isAlmostLateCustomer={title === "Pelanggan Hampir Telat (H-5)"}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const CustomerRow = ({ item, index, onIsolate, isolationStatus, loadingIsolationStatus, isLateCustomer, isAlmostLateCustomer }) => {
        const customer = item?.customer;
        const latestInvoice = item?.invoice || null;
        const activeInvoice = item?.active_invoice || null;
        const invoiceToUse = activeInvoice || null;
        const latestInvoiceStatus = (latestInvoice?.status || '').toString().trim().toLowerCase();
        const normalizedInvoiceStatus = (invoiceToUse?.status || '').toString().trim().toLowerCase();
        const canCreateInvoice = !!item?.can_create_invoice;
        const paidMonthLabel = formatPaidMonth(latestInvoice?.paid_at || latestInvoice?.updated_at || latestInvoice?.created_at);
        
        const getStatusBadge = () => {
            if (invoiceToUse) {
                if (normalizedInvoiceStatus === 'menunggu konfirmasi') {
                    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">Menunggu Konfirmasi</span>;
                }
                if (normalizedInvoiceStatus === 'paid') {
                    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Sudah Bayar</span>;
                }
                return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">Belum Bayar</span>;
            }

            if (isLateCustomer) {
                return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Belum Ada Tagihan Aktif</span>;
            }

            if (latestInvoiceStatus === 'paid' || item?.has_paid_this_month) {
                if (isAlmostLateCustomer && paidMonthLabel) {
                    return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Sudah Bayar bulan {paidMonthLabel}</span>;
                }
                return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Sudah Bayar</span>;
            }

            if (isAlmostLateCustomer) {
                return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Belum Ada Tagihan</span>;
            }

            return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">Belum Ada Tagihan</span>;
        };

        const getIsolirButton = () => {
            // Only show for late customers
            if (!isLateCustomer) return null;

            if (loadingIsolationStatus && !isolationStatus) {
                return (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                        Cek status...
                    </span>
                );
            }
            
            const isIsolated = isolationStatus?.isolated;
            
            if (isIsolated) {
                return (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                        <ShieldAlert size={12} />
                        Sedang Isolir
                    </span>
                );
            }
            
            return (
                <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onIsolate(customer.id)}
                    disabled={submitting}
                >
                    <ShieldAlert size={14} className="mr-1" />
                    Lakukan Isolir
                </Button>
            );
        };

        return (
            <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{customer.name}</div>
                    <div className="text-xs text-gray-500 md:hidden">{customer.pppoe_username}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{customer.pppoe_username || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{getIsolirButton()}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(customer.due_date)}</td>
                <td className="px-4 py-3">{getStatusBadge()}</td>
                <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                        {canCreateInvoice && (
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleOpenCreateInvoice(customer)}
                            >
                                <FileText size={14} className="mr-1" />
                                <span className="hidden sm:inline">Buat Tagihan</span>
                                <span className="sm:hidden">Buat</span>
                            </Button>
                        )}
                        {invoiceToUse && (
                            <>
                                {normalizedInvoiceStatus !== 'paid' && (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() => setLinkModal({ open: true, invoice: invoiceToUse, customer })}
                                        >
                                            <Send size={14} className="mr-1" />
                                            <span className="hidden sm:inline">Kirim</span>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="warning"
                                            onClick={() => openConfirmModal(invoiceToUse, customer)}
                                        >
                                            <Check size={14} className="mr-1" />
                                            <span className="hidden sm:inline">Konfirmasi</span>
                                        </Button>
                                    </>
                                )}
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        const invoiceUrl = resolveInvoiceUrl(invoiceToUse);
                                        if (invoiceUrl) {
                                            window.open(invoiceUrl, '_blank');
                                        }
                                    }}
                                >
                                    <Eye size={14} className="mr-1" />
                                    <span className="hidden sm:inline">Lihat</span>
                                </Button>
                                {canEditInvoiceAmount && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                            setEditAmountModal({ open: true, invoice: invoiceToUse, customer });
                                            const amount = parseFloat(invoiceToUse.amount);
                                            setNewInvoiceAmount(isNaN(amount) ? '' : Math.round(amount).toString());
                                        }}
                                    >
                                        <FileText size={14} className="mr-1" />
                                        <span className="hidden sm:inline">Nominal</span>
                                    </Button>
                                )}
                                {normalizedInvoiceStatus === 'menunggu konfirmasi' && invoiceToUse.bukti_pembayaran && (
                                    <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => setRejectModal({ open: true, invoice: invoiceToUse })}
                                    >
                                        <X size={14} />
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Menu Penagihan</h1>
                    <p className="text-gray-600 mt-1">Kelola tagihan dan pembayaran pelanggan</p>
                </div>
            </div>

            {/* Alerts */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Cari nama atau PPPoE..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                </div>
                {loading && hasLoadedOnce && (
                    <p className="text-xs text-gray-500 mt-2">Memuat hasil pencarian...</p>
                )}
                {loadingIsolationStatus && (
                    <p className="text-xs text-gray-500 mt-1">Memuat status isolir pelanggan...</p>
                )}
            </div>

            {/* Tables */}
            <div className="space-y-4">
                <CustomerTable
                    title="Pelanggan Telat"
                    data={customers.late}
                    segment="late"
                    icon={AlertTriangle}
                    iconColor="bg-red-500"
                />
                <CustomerTable
                    title="Pelanggan Hampir Telat (H-5)"
                    data={customers.almostLate}
                    segment="almostLate"
                    icon={Clock}
                    iconColor="bg-orange-500"
                />
                <CustomerTable
                    title="Pelanggan Lainnya"
                    data={customers.others}
                    segment="others"
                    icon={Users}
                    iconColor="bg-blue-500"
                    defaultCollapsed={true}
                />
                <CustomerTable
                    title="Pelanggan Sudah Bayar"
                    data={customers.paid}
                    segment="paid"
                    icon={Check}
                    iconColor="bg-green-500"
                    defaultCollapsed={true}
                />
            </div>

            {/* Auto Invoice Process Modal */}
            <Modal
                isOpen={autoProcessModal.open}
                onClose={() => {
                    if (autoProcessModal.state === 'processing' || autoProcessModal.state === 'queued') {
                        return;
                    }
                    setAutoProcessModal({
                        open: false,
                        segment: null,
                        jobId: null,
                        state: 'queued',
                        phase: 'queued',
                        summary: null,
                        errorMessage: null,
                    });
                }}
                title="Proses Auto Invoice"
                size="md"
            >
                <div className="space-y-4">
                    <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-900">
                        <p className="font-semibold">
                            Section: {autoProcessModal.segment === 'late' ? 'Pelanggan Telat' : 'Pelanggan Hampir Telat (H-5)'}
                        </p>
                        <p className="mt-1">Status: {autoProcessModal.state}</p>
                        <p>Fase: {phaseLabel(autoProcessModal.phase)}</p>
                        {autoProcessModal.jobId && <p>Job ID: {autoProcessModal.jobId}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded border border-gray-200 p-2">Total: <strong>{autoProcessModal.summary?.total ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Diproses: <strong>{autoProcessModal.summary?.processed ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Lolos WA: <strong>{autoProcessModal.summary?.verified_wa ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Dibuat: <strong>{autoProcessModal.summary?.created ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">WA Sukses: <strong>{autoProcessModal.summary?.wa_sent ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">WA Gagal: <strong>{autoProcessModal.summary?.wa_failed ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Skip No WA: <strong>{autoProcessModal.summary?.skipped_no_phone ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Skip Layanan: <strong>{autoProcessModal.summary?.skipped_invalid_service ?? 0}</strong></div>
                    </div>
                    {autoProcessModal.errorMessage && (
                        <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
                            {autoProcessModal.errorMessage}
                        </div>
                    )}
                    {(autoProcessModal.state === 'processing' || autoProcessModal.state === 'queued') && (
                        <p className="text-xs text-gray-500">Proses sedang berjalan di background, popup ini update otomatis.</p>
                    )}
                    {(autoProcessModal.state === 'completed' || autoProcessModal.state === 'failed') && (
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setAutoProcessModal({
                                    open: false,
                                    segment: null,
                                    jobId: null,
                                    state: 'queued',
                                    phase: 'queued',
                                    summary: null,
                                    errorMessage: null,
                                })}
                            >
                                Tutup
                            </Button>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Invalid Service Modal */}
            <Modal
                isOpen={invalidServiceModal.open}
                onClose={() => setInvalidServiceModal({ open: false, segment: null, rows: [] })}
                title="Layanan Belum Valid"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="bg-amber-50 rounded-lg p-4">
                        <p className="text-sm text-amber-800">
                            Proses auto invoice dihentikan karena ada layanan pelanggan yang belum terdaftar di paket aktif.
                            Set layanan terlebih dahulu lalu jalankan ulang.
                        </p>
                    </div>
                    <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left">Pelanggan</th>
                                    <th className="px-3 py-2 text-left">Layanan Saat Ini</th>
                                    <th className="px-3 py-2 text-left">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {invalidServiceModal.rows.map((row) => (
                                    <tr key={row.customer_id}>
                                        <td className="px-3 py-2">
                                            <p className="font-medium text-gray-900">{row.customer_name}</p>
                                            <p className="text-xs text-gray-500">{row.pppoe_username || '-'}</p>
                                        </td>
                                        <td className="px-3 py-2">{row.service_label || '-'}</td>
                                        <td className="px-3 py-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="primary"
                                                onClick={() => openServicePackageModalFromInvalid(row)}
                                            >
                                                Set Layanan
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {invalidServiceModal.rows.length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="px-3 py-6 text-center text-gray-500">Tidak ada data.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setInvalidServiceModal({ open: false, segment: null, rows: [] })}
                        >
                            Tutup
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Auto Invoice Result Modal */}
            <Modal
                isOpen={autoResultModal.open}
                onClose={() => setAutoResultModal({ open: false, segment: null, summary: null, results: [] })}
                title="Hasil Proses Auto Invoice"
                size="lg"
            >
                <div className="space-y-4">
                    <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-900">
                        Section: {autoResultModal.segment === 'late' ? 'Pelanggan Telat' : 'Pelanggan Hampir Telat (H-5)'}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="rounded border border-gray-200 p-2">Total: <strong>{autoResultModal.summary?.total ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Lolos WA: <strong>{autoResultModal.summary?.verified_wa ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Dibuat: <strong>{autoResultModal.summary?.created ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">WA Sukses: <strong>{autoResultModal.summary?.wa_sent ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">WA Gagal: <strong>{autoResultModal.summary?.wa_failed ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Skip No WA: <strong>{autoResultModal.summary?.skipped_no_phone ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Skip Invoice Aktif: <strong>{autoResultModal.summary?.skipped_existing_open_invoice ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Skip Layanan: <strong>{autoResultModal.summary?.skipped_invalid_service ?? 0}</strong></div>
                        <div className="rounded border border-gray-200 p-2">Error: <strong>{autoResultModal.summary?.errors_count ?? 0}</strong></div>
                    </div>
                    <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left">Customer ID</th>
                                    <th className="px-3 py-2 text-left">Status</th>
                                    <th className="px-3 py-2 text-left">Reason</th>
                                    <th className="px-3 py-2 text-left">WA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(autoResultModal.results || []).map((row, idx) => (
                                    <tr key={`${row.customer_id}-${idx}`}>
                                        <td className="px-3 py-2">{row.customer_id}</td>
                                        <td className="px-3 py-2">{row.status}</td>
                                        <td className="px-3 py-2">{row.reason || '-'}</td>
                                        <td className="px-3 py-2">{row.wa_status || '-'}</td>
                                    </tr>
                                ))}
                                {(autoResultModal.results || []).length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-3 py-6 text-center text-gray-500">Tidak ada detail hasil.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* Create Invoice Modal */}
            <Modal
                isOpen={createModal.open}
                onClose={closeCreateModal}
                title="Buat Tagihan"
            >
                {createModal.customer && (
                    <form onSubmit={handleCreateInvoice} className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4">
                            <p className="font-semibold text-gray-900">{createModal.customer.name}</p>
                            <p className="text-sm text-gray-600">PPPoE: {createModal.customer.pppoe_username || '-'}</p>
                            <p className="text-sm text-gray-600">Paket: {createModal.customer.package_type || createModal.customer.custom_package || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp)</label>
                            <input
                                type="text"
                                value={formatNumberWithComma(amount)}
                                onChange={(e) => handleAmountChange(e, setAmount)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Masukkan nominal tagihan"
                            />
                            {amount && <p className="text-xs text-gray-500 mt-1">Rp {formatNumberWithComma(amount)}</p>}
                            {createModal.suggestedPackage && (
                                <p className="text-xs text-blue-600 mt-1">
                                    Sugesti dari paket {createModal.suggestedPackage.name}: {formatCurrency(createModal.suggestedPackage.price)}.
                                    Anda tetap bisa ubah nominal jika diperlukan.
                                </p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={closeCreateModal}>
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={submitting}>
                                {submitting ? 'Memproses...' : 'Buat Tagihan'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Select Customer Service Package Modal */}
            <Modal
                isOpen={servicePackageModal.open}
                onClose={closeServicePackageModal}
                title="Pilih Layanan Pelanggan"
            >
                {servicePackageModal.customer && (
                    <form onSubmit={handleServicePackageSubmit} className="space-y-4">
                        <div className="bg-amber-50 rounded-lg p-4">
                            <p className="text-sm text-amber-800">
                                Layanan pelanggan saat ini tidak ditemukan pada daftar paket aktif.
                                Pilih layanan yang tersedia untuk memperbarui data pelanggan sebelum membuat tagihan.
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <p className="font-semibold text-gray-900">{servicePackageModal.customer.name}</p>
                            <p className="text-sm text-gray-600">
                                Layanan saat ini: {getCustomerServiceLabel(servicePackageModal.customer) || '-'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Layanan Tersedia</label>
                            <select
                                value={servicePackageModal.selectedPackageId}
                                onChange={(e) => setServicePackageModal((prev) => ({ ...prev, selectedPackageId: e.target.value }))}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Pilih layanan</option>
                                {activePackages.map((pkg) => (
                                    <option key={pkg.id} value={pkg.id}>
                                        {pkg.name} ({formatCurrency(pkg.price)})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={closeServicePackageModal}>
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={updatingCustomerService}>
                                {updatingCustomerService ? 'Menyimpan...' : 'Simpan Layanan'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Send Link Modal */}
            <Modal
                isOpen={linkModal.open}
                onClose={() => setLinkModal({ open: false, invoice: null, customer: null })}
                title="Kirim Link Penagihan"
            >
                {linkModal.invoice && linkModal.customer && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Link Invoice</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={resolveInvoiceUrl(linkModal.invoice)}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => copyToClipboard(resolveInvoiceUrl(linkModal.invoice), 'Link')}
                                >
                                    <Copy size={16} />
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Template Pesan</label>
                            <textarea
                                readOnly
                                value={generateTemplate(linkModal.customer, linkModal.invoice)}
                                rows={8}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => copyToClipboard(generateTemplate(linkModal.customer, linkModal.invoice), 'Template')}
                            >
                                <Copy size={16} className="mr-1" /> Copy Template
                            </Button>
                            <a
                                href={getWhatsAppLink(linkModal.customer, linkModal.invoice)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                            >
                                <ExternalLink size={16} className="mr-1" /> Kirim via WhatsApp
                            </a>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Confirm Payment Modal */}
            <Modal
                isOpen={confirmModal.open}
                onClose={closeConfirmModal}
                title="Konfirmasi Pembayaran"
            >
                {confirmModal.invoice && (
                    <form onSubmit={handleConfirmPayment} className="space-y-4">
                        {confirmModal.invoice.bukti_pembayaran && (
                            <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-sm text-blue-700 mb-2">Pelanggan telah mengupload bukti pembayaran</p>
                                <a
                                    href={`/storage/${confirmModal.invoice.bukti_pembayaran}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                                >
                                    <Eye size={14} /> Lihat Bukti Pembayaran
                                </a>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal Dibayarkan</label>
                            <input
                                type="text"
                                value={formatNumberWithComma(paidAmount)}
                                onChange={(e) => handleAmountChange(e, setPaidAmount)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <p className="text-xs text-gray-500 mt-1">Rp {formatNumberWithComma(paidAmount)} - Nominal default sesuai invoice, bisa diubah jika pembayaran berbeda.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Terima via</label>
                            <select
                                value={paymentReceiptOptionId}
                                onChange={(e) => setPaymentReceiptOptionId(e.target.value)}
                                required={paymentReceiptOptions.length > 0}
                                disabled={loadingPaymentReceiptOptions}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                            >
                                <option value="">
                                    {loadingPaymentReceiptOptions
                                        ? 'Memuat opsi penerimaan pembayaran...'
                                        : paymentReceiptOptions.length > 0
                                            ? 'Pilih metode penerimaan'
                                            : 'Belum ada opsi penerimaan aktif'}
                                </option>
                                {paymentReceiptOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {getPaymentReceiptOptionLabel(option)}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Daftar diambil dari menu Pengaturan Penerimaan Pembayaran.</p>
                            {!loadingPaymentReceiptOptions && paymentReceiptOptions.length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">Tambahkan atau aktifkan opsi penerimaan pembayaran di menu pengaturan terlebih dahulu.</p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={closeConfirmModal}>
                                Batal
                            </Button>
                            <Button type="submit" variant="warning" disabled={submitting}>
                                {submitting ? 'Memproses...' : 'Konfirmasi'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Unauthorized Confirm Payment Modal */}
            <Modal
                isOpen={permissionModal.open}
                onClose={() => setPermissionModal({ open: false, message: '' })}
                title="Akses Ditolak"
            >
                <div className="space-y-4">
                    <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                            {permissionModal.message || 'Anda tidak diizinkan melakukan konfirmasi pembayaran.'}
                        </p>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setPermissionModal({ open: false, message: '' })}
                        >
                            Tutup
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Reject Payment Modal */}
            <Modal
                isOpen={rejectModal.open}
                onClose={() => setRejectModal({ open: false, invoice: null })}
                title="Tolak Pembayaran"
            >
                <form onSubmit={handleRejectPayment} className="space-y-4">
                    <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm text-red-700">
                            Yakin ingin menolak bukti pembayaran ini? Pelanggan akan diminta upload ulang bukti pembayaran yang valid.
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Alasan Penolakan (opsional)</label>
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            placeholder="Masukkan alasan penolakan..."
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setRejectModal({ open: false, invoice: null })}>
                            Batal
                        </Button>
                        <Button type="submit" variant="danger" disabled={submitting}>
                            {submitting ? 'Memproses...' : 'Tolak'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Result Modal */}
            <Modal
                isOpen={resultModal.open}
                onClose={() => setResultModal({ open: false, data: null })}
                title="Tagihan Berhasil Dibuat"
            >
                {resultModal.data && (
                    <div className="space-y-4">
                        <div className="bg-green-50 rounded-lg p-4">
                            <p className="text-sm text-green-700">Tagihan berhasil dibuat! Kirim link ke pelanggan melalui WhatsApp.</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4">
                            <p className="font-semibold text-gray-900">{resultModal.data.customer?.name || '-'}</p>
                            <p className="text-sm text-gray-600">PPPoE: {resultModal.data.customer?.pppoe_username || '-'}</p>
                            <p className="text-sm text-gray-600">No. WA: {resultModal.data.customer?.phone || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Link Invoice</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={resolveInvoiceUrl(resultModal.data.invoice_link)}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => copyToClipboard(resolveInvoiceUrl(resultModal.data.invoice_link), 'Link')}
                                >
                                    <Copy size={16} />
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Template Pesan</label>
                            <textarea
                                readOnly
                                value={resultModal.data.template}
                                rows={8}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
                            />
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                            <a
                                href={resultModal.data.customer ? getWhatsAppLink(resultModal.data.customer, resultModal.data.invoice_link) : '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${resultModal.data.customer ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-300 text-gray-500 pointer-events-none'}`}
                            >
                                <Send size={16} className="mr-1" /> Kirim ke WhatsApp
                            </a>
                            <Button type="button" variant="secondary" onClick={() => setResultModal({ open: false, data: null })}>
                                Tutup
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Edit Invoice Amount Modal */}
            <Modal
                isOpen={editAmountModal.open}
                onClose={() => setEditAmountModal({ open: false, invoice: null, customer: null })}
                title="Ubah Nominal Invoice"
            >
                {editAmountModal.invoice && (
                    <form onSubmit={handleUpdateInvoiceAmount} className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
                            <p className="font-semibold text-gray-900">{editAmountModal.customer?.name || '-'}</p>
                            <p>Status invoice: {editAmountModal.invoice.status}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nominal Baru</label>
                            <input
                                type="text"
                                value={formatNumberWithComma(newInvoiceAmount)}
                                onChange={(e) => handleAmountChange(e, setNewInvoiceAmount)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Masukkan nominal"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setEditAmountModal({ open: false, invoice: null, customer: null })}
                            >
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={submitting}>
                                {submitting ? 'Menyimpan...' : 'Simpan Nominal'}
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
}

export default BillingPage;
