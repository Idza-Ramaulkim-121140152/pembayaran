import { useState, useEffect, useRef } from 'react';
import { Search, FileText, Send, Check, X, Eye, Clock, AlertTriangle, Users, ChevronDown, ChevronUp, Copy, ExternalLink, ShieldAlert } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import {
    AdminConsoleActionRow,
    AdminConsoleField,
    AdminConsoleNotice,
    AdminConsoleSurface,
    adminConsoleButtonClassNames,
    adminConsoleCheckboxClassName,
    adminConsoleInputClassName,
    adminConsoleReadOnlyClassName,
    adminConsoleSelectClassName,
    adminConsoleTextareaClassName,
} from '../../components/common/AdminConsoleUI';
import Modal from '../../components/common/Modal';
import ResponsiveDataView from '../../components/common/ResponsiveDataView';
import billingService from '../../services/billingService';

function BillingPage() {
    const userRole = window.appUserRole || 'admin';
    const isSuperAdmin = userRole === 'superadmin';
    const canChoosePaymentMutation = isSuperAdmin || !!window.appCanChoosePaymentMutation;
    const canChoosePaymentReceiver = isSuperAdmin || !!window.appCanChoosePaymentReceiver;
    const canEditInvoiceAmount = userRole === 'finance' || userRole === 'superadmin' || userRole === 'admin';

    const [customers, setCustomers] = useState({ late: [], almostLate: [], others: [], paid: [] });
    const [activePackages, setActivePackages] = useState([]);
    const [loadingActivePackages, setLoadingActivePackages] = useState(false);
    const [paymentReceiptOptions, setPaymentReceiptOptions] = useState([]);
    const [loadingPaymentReceiptOptions, setLoadingPaymentReceiptOptions] = useState(false);
    const [paymentReceivers, setPaymentReceivers] = useState([]);
    const [loadingPaymentReceivers, setLoadingPaymentReceivers] = useState(false);
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
    const [proofPreviewModal, setProofPreviewModal] = useState({
        open: false,
        url: '',
        externalUrl: '',
        invoiceId: null,
        type: null, // 'image' | 'pdf' | 'other'
        contentType: '',
        loading: false,
        fallbackTried: false,
        error: '',
    });
    const [permissionModal, setPermissionModal] = useState({ open: false, message: '' });
    const [otherReceiverModal, setOtherReceiverModal] = useState({ open: false, selectedReceiver: null });
    const [receiverConflictModal, setReceiverConflictModal] = useState({ open: false, message: '' });
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
    const [paymentReceiverUserId, setPaymentReceiverUserId] = useState('');
    const [includeInMutation, setIncludeInMutation] = useState(true);
    const [newInvoiceAmount, setNewInvoiceAmount] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [updatingCustomerService, setUpdatingCustomerService] = useState(false);
    const [autoSubmitting, setAutoSubmitting] = useState(false);
    const [updatingCustomerAutomation, setUpdatingCustomerAutomation] = useState({});
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
        if (canChoosePaymentReceiver) {
            fetchPaymentReceivers();
        }
    }, [canChoosePaymentReceiver]);

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

    const fetchPaymentReceivers = async () => {
        try {
            setLoadingPaymentReceivers(true);
            const response = await billingService.getPaymentReceivers();
            const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
            setPaymentReceivers(rows);

            if (!paymentReceiverUserId && window.appUserId) {
                setPaymentReceiverUserId(String(window.appUserId));
            }
        } catch (err) {
            console.error('Gagal memuat penerima pembayaran', err);
            setPaymentReceivers([]);
        } finally {
            setLoadingPaymentReceivers(false);
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

    const getPaymentReceiverLabel = (receiver) => {
        if (!receiver) return '-';
        const role = receiver.role ? ` (${receiver.role})` : '';
        const companyTag = receiver.is_company_finance_receiver ? ' [Keuangan Perusahaan]' : '';
        return `${receiver.name || receiver.email || receiver.id}${role}${companyTag}`;
    };

    const closeConfirmModal = () => {
        setConfirmModal({ open: false, invoice: null, customer: null });
        setPaidAmount('');
        setPaymentReceiptOptionId('');
        setPaymentReceiverUserId(window.appUserId ? String(window.appUserId) : '');
        setIncludeInMutation(true);
        setOtherReceiverModal({ open: false, selectedReceiver: null });
        setReceiverConflictModal({ open: false, message: '' });
    };

    const closeProofPreviewModal = () => {
        setProofPreviewModal({
            open: false,
            url: '',
            externalUrl: '',
            invoiceId: null,
            type: null,
            contentType: '',
            loading: false,
            fallbackTried: false,
            error: '',
        });
    };

    const openConfirmModal = (invoice, customer) => {
        setConfirmModal({ open: true, invoice, customer });

        // Parse amount dari invoice (handle decimal dari database)
        const amount = parseFloat(invoice.amount);
        setPaidAmount(isNaN(amount) ? '' : Math.round(amount).toString());
        setPaymentReceiptOptionId(resolveDefaultPaymentReceiptOptionId(paymentReceiptOptions));
        setPaymentReceiverUserId(window.appUserId ? String(window.appUserId) : '');
        setIncludeInMutation(true);
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
            const status = err?.response?.status;
            const backendMessage = err?.response?.data?.error || err?.response?.data?.message;
            const deniedPermission = err?.response?.data?.permission;

            if (status === 403) {
                const permissionSuffix = deniedPermission ? ` (${deniedPermission})` : '';
                setError(`${backendMessage || 'Akses ditolak oleh access policy.'}${permissionSuffix}. Hubungi superadmin untuk grant akses.`);
            } else if (status === 401) {
                setError('Sesi login Anda berakhir. Silakan login ulang lalu buka menu penagihan lagi.');
            } else if (status >= 500) {
                setError('Server sedang bermasalah saat memuat data penagihan. Coba lagi beberapa saat.');
            } else {
                setError('Gagal memuat data penagihan.');
            }
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

    const handleCustomerAutomationToggle = async (customer, checked) => {
        if (!isSuperAdmin || !customer?.id) return;

        try {
            setUpdatingCustomerAutomation((prev) => ({ ...prev, [customer.id]: true }));
            setError(null);
            setSuccess(null);

            const response = await billingService.updateCustomerAutomation(customer.id, checked);

            updateCustomerInLists({
                ...customer,
                billing_auto_disabled: checked,
            });

            setSuccess(response?.data?.message || (checked
                ? 'Tindakan otomatis customer dinonaktifkan.'
                : 'Tindakan otomatis customer diaktifkan kembali.'));
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memperbarui pengaturan tindakan otomatis customer.');
        } finally {
            setUpdatingCustomerAutomation((prev) => ({ ...prev, [customer.id]: false }));
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

    const submitConfirmPayment = async (options = {}) => {
        if (paymentReceiptOptions.length > 0 && !paymentReceiptOptionId) {
            setError('Pilih metode pada Terima via sebelum konfirmasi pembayaran.');
            return;
        }

        const selectedPaymentReceiverUserId = paymentReceiverUserId ? parseInt(paymentReceiverUserId, 10) : null;
        const normalizedPaymentReceiverUserId = Number.isNaN(selectedPaymentReceiverUserId) ? null : selectedPaymentReceiverUserId;
        const selectedReceiver = paymentReceivers.find((receiver) => Number(receiver.id) === normalizedPaymentReceiverUserId) || null;

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
                normalizedPaymentReceiptOptionId,
                includeInMutation,
                normalizedPaymentReceiverUserId,
                options
            );

            closeConfirmModal();
            const data = response.data;
            setSuccess(data.message || 'Pembayaran berhasil dikonfirmasi');
            fetchBillingData(search);
        } catch (err) {
            const status = err.response?.status;
            const message = err.response?.data?.message || err.response?.data?.error || 'Gagal mengkonfirmasi pembayaran';
            const actionRequired = err.response?.data?.action_required;

            if (status === 403) {
                closeConfirmModal();
                setPermissionModal({
                    open: true,
                    message: message || 'Anda tidak diizinkan melakukan konfirmasi pembayaran.',
                });
            } else if (status === 422 && actionRequired === 'confirm_other_receiver') {
                setOtherReceiverModal({ open: true, selectedReceiver });
            } else if (status === 422 && actionRequired === 'resolve_invalid_receiver') {
                setReceiverConflictModal({
                    open: true,
                    message,
                });
            } else {
                setError(message);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmPayment = async (e) => {
        e.preventDefault();
        await submitConfirmPayment();
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

    const normalizePaymentProofPath = (rawPath) => {
        const value = (rawPath || '').toString().trim();
        if (!value) return '';

        const lowered = value.toLowerCase();
        if (['0', '1', 'false', 'null'].includes(lowered)) return '';

        return value;
    };

    const resolvePaymentProofUrl = (invoice) => {
        if (!invoice) return '';

        const primaryProofUrl = (invoice.payment_proof_url || '').toString().trim();
        if (primaryProofUrl) {
            if (/^https?:\/\//i.test(primaryProofUrl)) return primaryProofUrl;
            if (primaryProofUrl.startsWith('/')) return `${window.location.origin}${primaryProofUrl}`;
            return `${window.location.origin}/${primaryProofUrl}`;
        }

        const proofUrl = (invoice.bukti_pembayaran_url || '').toString().trim();
        if (proofUrl) {
            if (/^https?:\/\//i.test(proofUrl)) return proofUrl;
            if (proofUrl.startsWith('/')) return `${window.location.origin}${proofUrl}`;
            return `${window.location.origin}/${proofUrl}`;
        }

        const rawProofPath = normalizePaymentProofPath(invoice.bukti_pembayaran);
        const invoiceId = invoice.id;

        if (invoiceId && rawProofPath) {
            return `${window.location.origin}/billing/invoice/${invoiceId}/payment-proof`;
        }

        if (!rawProofPath) return '';

        if (/^https?:\/\//i.test(rawProofPath)) {
            return rawProofPath;
        }

        let normalizedPath = rawProofPath.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!normalizedPath) return '';

        if (normalizedPath.startsWith('storage/')) {
            return `${window.location.origin}/${normalizedPath}`;
        }

        if (normalizedPath.startsWith('public/')) {
            normalizedPath = normalizedPath.slice('public/'.length);
        }

        if (!normalizedPath) return '';

        return `${window.location.origin}/storage/${normalizedPath}`;
    };

    const hasValidPaymentProof = (invoice) => {
        if (!invoice) return false;
        if (invoice.has_payment_proof !== true) return false;

        return resolvePaymentProofUrl(invoice) !== '';
    };

    const resolvePublicPaymentProofUrl = (invoice) => {
        const publicUrl = (invoice?.payment_proof_public_url || '').toString().trim();
        if (!publicUrl) return '';
        if (/^https?:\/\//i.test(publicUrl)) return publicUrl;
        if (publicUrl.startsWith('/')) return `${window.location.origin}${publicUrl}`;
        return `${window.location.origin}/${publicUrl}`;
    };

    const inferPreviewType = (contentType = '', url = '', extension = '', proofPath = '', hasPaymentProof = false) => {
        const normalizedType = contentType.toLowerCase();
        if (normalizedType.includes('image/heic') || normalizedType.includes('image/heif')) return 'other';
        if (normalizedType.startsWith('image/')) return 'image';
        if (normalizedType.includes('application/pdf')) return 'pdf';

        const normalizedExtension = extension.toLowerCase().replace(/^\./, '');
        if (['heic', 'heif'].includes(normalizedExtension)) return 'other';
        if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(normalizedExtension)) return 'image';
        if (normalizedExtension === 'pdf') return 'pdf';

        const pathForExtension = (proofPath || url || '').toString().split('?')[0].toLowerCase();
        if (/\.(heic|heif)$/i.test(pathForExtension)) return 'other';
        if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(pathForExtension)) return 'image';
        if (/\.pdf$/i.test(pathForExtension)) return 'pdf';

        if (hasPaymentProof) return 'image';

        return 'other';
    };

    const appendPreviewCacheBuster = (url) => {
        if (!url) return '';
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}preview=1`;
    };

    const openProofPreview = (invoice) => {
        const publicUrl = resolvePublicPaymentProofUrl(invoice);
        const fallbackUrl = publicUrl || resolvePaymentProofUrl(invoice);
        if (!fallbackUrl) {
            setProofPreviewModal({
                open: true,
                url: '',
                externalUrl: '',
                invoiceId: null,
                type: null,
                contentType: '',
                loading: false,
                fallbackTried: false,
                error: 'URL bukti pembayaran tidak valid.',
            });
            return;
        }

        const contentType = (invoice?.payment_proof_mime_type || '').toString().trim();
        const extension = (invoice?.payment_proof_extension || '').toString().trim();
        const proofPath = normalizePaymentProofPath(invoice?.bukti_pembayaran);
        const previewType = (invoice?.payment_proof_preview_type || '').toString().trim()
            || inferPreviewType(contentType, fallbackUrl, extension, proofPath, invoice?.has_payment_proof === true);
        const previewUrl = appendPreviewCacheBuster(fallbackUrl);

        setProofPreviewModal({
            open: true,
            url: previewType === 'other' ? '' : previewUrl,
            externalUrl: fallbackUrl,
            invoiceId: invoice?.id || null,
            type: previewType,
            contentType,
            loading: false,
            fallbackTried: false,
            error: '',
        });
    };

    const loadPaymentProofDataUrlFallback = async () => {
        const invoiceId = proofPreviewModal.invoiceId;
        if (!invoiceId || proofPreviewModal.fallbackTried) {
            setProofPreviewModal((prev) => ({
                ...prev,
                url: '',
                type: 'other',
                loading: false,
                error: '',
                fallbackTried: true,
            }));
            return;
        }

        setProofPreviewModal((prev) => ({
            ...prev,
            loading: true,
            fallbackTried: true,
            error: '',
        }));

        try {
            const response = await billingService.getPaymentProofPreview(invoiceId);
            const dataUrl = response?.data?.data?.data_url || '';
            if (!dataUrl) {
                throw new Error('Data preview kosong.');
            }

            setProofPreviewModal((prev) => ({
                ...prev,
                url: dataUrl,
                type: 'image',
                loading: false,
                error: '',
            }));
        } catch (err) {
            setProofPreviewModal((prev) => ({
                ...prev,
                url: '',
                type: 'other',
                loading: false,
                error: '',
            }));
        }
    };

    const generateTemplate = (customer, invoiceOrLink) => {
        const invoiceUrl = resolveInvoiceUrl(invoiceOrLink);
        const amountValue = Number(invoiceOrLink?.amount || invoiceOrLink?.active_invoice?.amount || 0);
        const amountLine = amountValue > 0
            ? `\nNominal tagihan: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amountValue)}\n`
            : '\n';

        return `Yth. Bapak/Ibu ${customer.name.toUpperCase()}
Username PPPoE: ${customer.pppoe_username || '-'}

Terima kasih telah menjadi bagian dari pelanggan prioritas kami.
Layanan internet anda aktif sampai ${formatDate(customer.due_date)}.
${amountLine}

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

    const waitingMap = new Map();
    [...(customers.late || []), ...(customers.almostLate || []), ...(customers.others || []), ...(customers.paid || [])].forEach((item) => {
        const customerId = item?.customer?.id;
        const invoiceForAction = item?.pending_confirmation_invoice || item?.active_invoice || null;
        const invoiceStatus = (invoiceForAction?.status || '').toString().trim().toLowerCase();
        if (!customerId || invoiceStatus !== 'menunggu konfirmasi') return;
        if (!waitingMap.has(customerId)) {
            waitingMap.set(customerId, item);
        }
    });

    const waitingConfirmation = Array.from(waitingMap.values());
    const waitingCustomerIds = new Set(waitingConfirmation.map((item) => item?.customer?.id).filter(Boolean));

    const lateFiltered = (customers.late || []).filter((item) => !waitingCustomerIds.has(item?.customer?.id));
    const almostLateFiltered = (customers.almostLate || []).filter((item) => !waitingCustomerIds.has(item?.customer?.id));
    const othersFiltered = (customers.others || []).filter((item) => !waitingCustomerIds.has(item?.customer?.id));
    const paidFiltered = (customers.paid || []).filter((item) => !waitingCustomerIds.has(item?.customer?.id));

    const invalidServiceColumns = [
        {
            key: 'customer',
            label: 'Pelanggan',
            render: (row) => (
                <div>
                    <p className="font-medium text-slate-900">{row.customer_name}</p>
                    <p className="text-xs text-slate-500">{row.pppoe_username || '-'}</p>
                </div>
            ),
            cellClassName: 'px-4 py-3 text-sm text-slate-700',
        },
        { key: 'service_label', label: 'Layanan Saat Ini', render: (row) => row.service_label || '-', cellClassName: 'px-4 py-3 text-sm text-slate-700' },
    ];

    const autoResultColumns = [
        { key: 'customer_id', label: 'Customer ID', cellClassName: 'px-4 py-3 text-sm text-slate-700' },
        { key: 'status', label: 'Status', cellClassName: 'px-4 py-3 text-sm text-slate-700' },
        { key: 'reason', label: 'Reason', render: (row) => row.reason || '-', cellClassName: 'px-4 py-3 text-sm text-slate-700' },
        { key: 'wa_status', label: 'WA', render: (row) => row.wa_status || '-', cellClassName: 'px-4 py-3 text-sm text-slate-700' },
    ];

    const resolveInvoiceActionState = (invoice) => {
        const normalizedInvoiceStatus = (invoice?.status || '').toString().trim().toLowerCase();
        const canReject = normalizedInvoiceStatus === 'menunggu konfirmasi';
        const canPreviewProof = canReject && hasValidPaymentProof(invoice);
        const missingProofReason = canReject && !canPreviewProof ? 'Bukti tidak tersedia' : '';

        return {
            normalizedInvoiceStatus,
            canReject,
            canPreviewProof,
            missingProofReason,
        };
    };

    const CustomerTable = ({ title, data, icon: Icon, iconColor, segment, defaultCollapsed = false }) => {
        const sectionKey = title.toLowerCase().replace(/[^a-z]/g, '');
        const isCollapsed = collapsed[sectionKey] ?? defaultCollapsed;
        const canRunAutoInvoice = segment === 'late' || segment === 'almostLate';
        const isLateCustomer = segment === 'late';
        const isAlmostLateCustomer = segment === 'almostLate';

        const buildRowMeta = (item) => {
            const customer = item?.customer;
            const latestInvoice = item?.invoice || null;
            const activeInvoice = item?.active_invoice || null;
            const pendingConfirmationInvoice = item?.pending_confirmation_invoice || null;
            const invoiceToUse = pendingConfirmationInvoice || activeInvoice || null;
            const latestInvoiceStatus = (latestInvoice?.status || '').toString().trim().toLowerCase();
            const canCreateInvoice = !!item?.can_create_invoice;
            const paidMonthLabel = formatPaidMonth(latestInvoice?.paid_at || latestInvoice?.updated_at || latestInvoice?.created_at);
            const statusInfo = isolationStatus[customer?.id];
            const actionState = resolveInvoiceActionState(invoiceToUse);

            const statusBadge = (() => {
                if (invoiceToUse) {
                    if (actionState.normalizedInvoiceStatus === 'menunggu konfirmasi') {
                        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">Menunggu Konfirmasi</span>;
                    }
                    if (actionState.normalizedInvoiceStatus === 'paid') {
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
            })();

            const isolirBadge = (() => {
                if (!isLateCustomer) return null;

                if (loadingIsolationStatus && !statusInfo) {
                    return (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                            Cek status...
                        </span>
                    );
                }

                if (statusInfo?.isolated) {
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
                        onClick={() => handleIsolateCustomer(customer.id)}
                        disabled={submitting}
                    >
                        <ShieldAlert size={14} className="mr-1" />
                        Lakukan Isolir
                    </Button>
                );
            })();

            return {
                customer,
                invoiceToUse,
                canCreateInvoice,
                statusBadge,
                isolirBadge,
                actionState,
                isAutoDisabled: Boolean(customer?.billing_auto_disabled),
            };
        };

        const tableColumns = [
            {
                key: 'no',
                label: 'No',
                render: (_, index) => index + 1,
                headerClassName: 'px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider',
                cellClassName: 'px-4 py-3 text-sm text-gray-600',
            },
            {
                key: 'name',
                label: 'Nama',
                render: (item) => buildRowMeta(item).customer?.name || '-',
            },
            {
                key: 'pppoe',
                label: 'PPPoE',
                render: (item) => buildRowMeta(item).customer?.pppoe_username || '-',
            },
            {
                key: 'due',
                label: 'Jatuh Tempo',
                render: (item) => formatDate(buildRowMeta(item).customer?.due_date),
            },
            {
                key: 'status',
                label: 'Status',
                render: (item) => buildRowMeta(item).statusBadge,
            },
            {
                key: 'automation',
                label: 'Auto',
                render: (item) => {
                    const meta = buildRowMeta(item);
                    if (!isSuperAdmin) {
                        return meta.isAutoDisabled
                            ? <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Auto Off</span>
                            : <span className="px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">Auto On</span>;
                    }

                    const customerId = meta.customer?.id;
                    return (
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                            <input
                                type="checkbox"
                                checked={meta.isAutoDisabled}
                                disabled={Boolean(updatingCustomerAutomation[customerId])}
                                onChange={(event) => handleCustomerAutomationToggle(meta.customer, event.target.checked)}
                            />
                            <span>{meta.isAutoDisabled ? 'Auto Off' : 'Auto On'}</span>
                        </label>
                    );
                },
            },
            {
                key: 'isolir',
                label: 'Isolir',
                render: (item) => buildRowMeta(item).isolirBadge,
            },
        ];

        const themedTableColumns = tableColumns.map((column) => ({
            ...column,
            headerClassName: column.headerClassName || 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500',
            cellClassName: column.cellClassName || 'px-4 py-3 text-sm text-slate-700',
        }));

        return (
            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="w-full flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${iconColor}`}>
                            <Icon size={20} className="text-white" />
                        </div>
                        <div className="text-left">
                            <h3 className="font-semibold text-slate-900">{title}</h3>
                            <p className="text-sm text-slate-500">{data.length} pelanggan</p>
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
                        className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                        {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </button>
                </div>

                {!isCollapsed && (
                    <ResponsiveDataView
                        rows={data}
                        columns={themedTableColumns}
                        keyField="customer.id"
                        priorityFields={['name', 'status', 'due']}
                        emptyMessage="Tidak ada data"
                        tableClassName="w-full min-w-[980px] text-sm"
                        headClassName="border-b border-slate-200 bg-slate-50"
                        bodyClassName="divide-y divide-slate-100"
                        emptyDesktopClassName="px-4 py-8 text-center text-slate-500"
                        mobileCardClassName="border border-slate-200 bg-white"
                        mobileLabelClassName="text-slate-500"
                        mobileValueClassName="text-slate-900"
                        mobileEmptyClassName="border border-slate-200 bg-white text-slate-500"
                        mobileActionBarClassName="border-slate-100 bg-slate-50 pt-3"
                        rowHoverClassName="hover:bg-orange-50/50"
                        actionsHeaderClassName="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                        actionsCellClassName="px-4 py-3 text-sm text-slate-700"
                        actions={(item) => {
                            const meta = buildRowMeta(item);
                            const customer = meta.customer;
                            const invoiceToUse = meta.invoiceToUse;
                            const canCreateInvoice = meta.canCreateInvoice;
                            const actionState = meta.actionState;
                            const secondaryActionClassName = '!border-slate-200 !bg-white !text-slate-700 !shadow-none hover:!bg-slate-50 hover:!text-slate-900 disabled:!bg-slate-100 disabled:!text-slate-400';

                            return (
                                <div className="flex flex-wrap gap-1">
                                    {canCreateInvoice && (
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() => handleOpenCreateInvoice(customer)}
                                        >
                                            <FileText size={14} className="mr-1" />
                                            <span>Buat</span>
                                        </Button>
                                    )}
                                    {invoiceToUse && (
                                        <>
                                            {actionState.normalizedInvoiceStatus !== 'paid' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="success"
                                                        onClick={() => setLinkModal({ open: true, invoice: invoiceToUse, customer })}
                                                    >
                                                        <Send size={14} className="mr-1" />
                                                        <span>Kirim</span>
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="warning"
                                                        onClick={() => openConfirmModal(invoiceToUse, customer)}
                                                    >
                                                        <Check size={14} className="mr-1" />
                                                        <span>Konfirmasi</span>
                                                    </Button>
                                                </>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className={secondaryActionClassName}
                                                onClick={() => {
                                                    const invoiceUrl = resolveInvoiceUrl(invoiceToUse);
                                                    if (invoiceUrl) {
                                                        window.open(invoiceUrl, '_blank');
                                                    }
                                                }}
                                            >
                                                <Eye size={14} className="mr-1" />
                                                <span>Lihat</span>
                                            </Button>
                                            {actionState.canPreviewProof && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className={secondaryActionClassName}
                                                    onClick={() => openProofPreview(invoiceToUse)}
                                                >
                                                    <Eye size={14} className="mr-1" />
                                                    <span>Lihat Bukti</span>
                                                </Button>
                                            )}
                                            {canEditInvoiceAmount && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className={secondaryActionClassName}
                                                    onClick={() => {
                                                        setEditAmountModal({ open: true, invoice: invoiceToUse, customer });
                                                        const amount = parseFloat(invoiceToUse.amount);
                                                        setNewInvoiceAmount(isNaN(amount) ? '' : Math.round(amount).toString());
                                                    }}
                                                >
                                                    <FileText size={14} className="mr-1" />
                                                    <span>Nominal</span>
                                                </Button>
                                            )}
                                            {actionState.canReject && (
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    onClick={() => setRejectModal({ open: true, invoice: invoiceToUse })}
                                                >
                                                    <X size={14} className="mr-1" />
                                                    <span>Tolak</span>
                                                </Button>
                                            )}
                                            {actionState.missingProofReason && (
                                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                                                    {actionState.missingProofReason}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        }}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 min-w-0">
            {/* Header */}
            <div className="app-section-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Menu Penagihan</h1>
                    <p className="text-gray-600 mt-1">Kelola tagihan dan pembayaran pelanggan</p>
                    <p className="text-xs text-slate-500 mt-2">Auto invoice 08:00 WIB (3 hari sebelum jatuh tempo, WA valid saja)</p>
                    <p className="text-xs text-slate-500">Auto isolir terlambat 3 hari (WA valid saja)</p>
                    {isSuperAdmin && <p className="text-xs text-amber-700 mt-1">Checklist Auto Off tersedia per pelanggan pada kolom Auto.</p>}
                </div>
            </div>

            {/* Alerts */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            {/* Search */}
            <AdminConsoleSurface accent="cyan" className="p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input
                        type="text"
                        placeholder="Cari nama atau PPPoE..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={`${adminConsoleInputClassName} pl-10`}
                    />
                </div>
                {loading && hasLoadedOnce && (
                    <p className="mt-2 text-xs text-slate-400">Memuat hasil pencarian...</p>
                )}
                {loadingIsolationStatus && (
                    <p className="mt-1 text-xs text-slate-400">Memuat status isolir pelanggan...</p>
                )}
            </AdminConsoleSurface>

            {/* Tables */}
            <div className="space-y-4">
                <CustomerTable
                    title="Pelanggan Menunggu Konfirmasi"
                    data={waitingConfirmation}
                    segment="waitingConfirmation"
                    icon={Clock}
                    iconColor="bg-amber-500"
                />
                <CustomerTable
                    title="Pelanggan Telat"
                    data={lateFiltered}
                    segment="late"
                    icon={AlertTriangle}
                    iconColor="bg-red-500"
                />
                <CustomerTable
                    title="Pelanggan Kurang dari 5 Hari Menuju Jatuh Tempo"
                    data={almostLateFiltered}
                    segment="almostLate"
                    icon={Clock}
                    iconColor="bg-orange-500"
                />
                <CustomerTable
                    title="Pelanggan Lainnya"
                    data={othersFiltered}
                    segment="others"
                    icon={Users}
                    iconColor="bg-blue-500"
                    defaultCollapsed={true}
                />
                <CustomerTable
                    title="Pelanggan Sudah Bayar"
                    data={paidFiltered}
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
                theme="dashboard"
            >
                <div className="space-y-4">
                    <AdminConsoleNotice tone="info" title="Job Status">
                        <p className="font-semibold">
                            Section: {autoProcessModal.segment === 'late' ? 'Pelanggan Telat' : 'Pelanggan Kurang dari 5 Hari Menuju Jatuh Tempo'}
                        </p>
                        <p className="mt-1">Status: {autoProcessModal.state}</p>
                        <p>Fase: {phaseLabel(autoProcessModal.phase)}</p>
                        {autoProcessModal.jobId && <p>Job ID: {autoProcessModal.jobId}</p>}
                    </AdminConsoleNotice>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <AdminConsoleSurface className="p-3" accent="cyan">Total: <strong>{autoProcessModal.summary?.total ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="cyan">Diproses: <strong>{autoProcessModal.summary?.processed ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="emerald">Lolos WA: <strong>{autoProcessModal.summary?.verified_wa ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="emerald">Dibuat: <strong>{autoProcessModal.summary?.created ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="emerald">WA Sukses: <strong>{autoProcessModal.summary?.wa_sent ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="rose">WA Gagal: <strong>{autoProcessModal.summary?.wa_failed ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="amber">Skip No WA: <strong>{autoProcessModal.summary?.skipped_no_phone ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="amber">Skip Auto Off: <strong>{autoProcessModal.summary?.skipped_auto_disabled ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="amber">Skip Layanan: <strong>{autoProcessModal.summary?.skipped_invalid_service ?? 0}</strong></AdminConsoleSurface>
                    </div>
                    {autoProcessModal.errorMessage && (
                        <AdminConsoleNotice tone="danger">
                            {autoProcessModal.errorMessage}
                        </AdminConsoleNotice>
                    )}
                    {(autoProcessModal.state === 'processing' || autoProcessModal.state === 'queued') && (
                        <p className="text-xs text-slate-400">Proses sedang berjalan di background, popup ini update otomatis.</p>
                    )}
                    {(autoProcessModal.state === 'completed' || autoProcessModal.state === 'failed') && (
                        <AdminConsoleActionRow className="border-t-0 pt-0">
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
                                className={adminConsoleButtonClassNames.secondary}
                            >
                                Tutup
                            </Button>
                        </AdminConsoleActionRow>
                    )}
                </div>
            </Modal>

            {/* Invalid Service Modal */}
            <Modal
                isOpen={invalidServiceModal.open}
                onClose={() => setInvalidServiceModal({ open: false, segment: null, rows: [] })}
                title="Layanan Belum Valid"
                size="lg"
                theme="dashboard"
            >
                <div className="space-y-4">
                    <AdminConsoleNotice tone="warning" title="Perlu Perbaikan">
                        <p>
                            Proses auto invoice dihentikan karena ada layanan pelanggan yang belum terdaftar di paket aktif.
                            Set layanan terlebih dahulu lalu jalankan ulang.
                        </p>
                    </AdminConsoleNotice>
                    <AdminConsoleSurface className="max-h-80 overflow-y-auto p-2" accent="amber">
                        <ResponsiveDataView
                            rows={invalidServiceModal.rows}
                            columns={invalidServiceColumns}
                            keyField="customer_id"
                            priorityFields={['customer', 'service_label']}
                            emptyMessage="Tidak ada data."
                            tableClassName="w-full md:min-w-[680px] text-sm"
                            actions={(row) => (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="primary"
                                    onClick={() => openServicePackageModalFromInvalid(row)}
                                    className={adminConsoleButtonClassNames.primary}
                                >
                                    Set Layanan
                                </Button>
                            )}
                        />
                    </AdminConsoleSurface>
                    <AdminConsoleActionRow className="border-t-0 pt-0">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setInvalidServiceModal({ open: false, segment: null, rows: [] })}
                            className={adminConsoleButtonClassNames.secondary}
                        >
                            Tutup
                        </Button>
                    </AdminConsoleActionRow>
                </div>
            </Modal>

            {/* Auto Invoice Result Modal */}
            <Modal
                isOpen={autoResultModal.open}
                onClose={() => setAutoResultModal({ open: false, segment: null, summary: null, results: [] })}
                title="Hasil Proses Auto Invoice"
                size="lg"
                theme="dashboard"
            >
                <div className="space-y-4">
                    <AdminConsoleNotice tone="info" title="Ringkasan Hasil">
                        Section: {autoResultModal.segment === 'late' ? 'Pelanggan Telat' : 'Pelanggan Kurang dari 5 Hari Menuju Jatuh Tempo'}
                    </AdminConsoleNotice>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <AdminConsoleSurface className="p-3" accent="cyan">Total: <strong>{autoResultModal.summary?.total ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="emerald">Lolos WA: <strong>{autoResultModal.summary?.verified_wa ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="emerald">Dibuat: <strong>{autoResultModal.summary?.created ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="emerald">WA Sukses: <strong>{autoResultModal.summary?.wa_sent ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="rose">WA Gagal: <strong>{autoResultModal.summary?.wa_failed ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="amber">Skip No WA: <strong>{autoResultModal.summary?.skipped_no_phone ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="amber">Skip Auto Off: <strong>{autoResultModal.summary?.skipped_auto_disabled ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="amber">Skip Invoice Aktif: <strong>{autoResultModal.summary?.skipped_existing_open_invoice ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="amber">Skip Layanan: <strong>{autoResultModal.summary?.skipped_invalid_service ?? 0}</strong></AdminConsoleSurface>
                        <AdminConsoleSurface className="p-3" accent="rose">Error: <strong>{autoResultModal.summary?.errors_count ?? 0}</strong></AdminConsoleSurface>
                    </div>
                    <AdminConsoleSurface className="max-h-72 overflow-y-auto p-2" accent="violet">
                        <ResponsiveDataView
                            rows={(autoResultModal.results || []).map((row, idx) => ({ ...row, __rowKey: `${row.customer_id}-${idx}` }))}
                            columns={autoResultColumns}
                            keyField="__rowKey"
                            priorityFields={['customer_id', 'status', 'wa_status']}
                            emptyMessage="Tidak ada detail hasil."
                            tableClassName="w-full md:min-w-[760px] text-sm"
                        />
                    </AdminConsoleSurface>
                </div>
            </Modal>

            {/* Create Invoice Modal */}
            <Modal
                isOpen={createModal.open}
                onClose={closeCreateModal}
                title="Buat Tagihan"
                theme="dashboard"
            >
                {createModal.customer && (
                    <form onSubmit={handleCreateInvoice} className="space-y-4">
                        <AdminConsoleSurface accent="cyan" className="p-4">
                            <p className="font-semibold text-slate-900">{createModal.customer.name}</p>
                            <p className="text-sm text-slate-600">PPPoE: {createModal.customer.pppoe_username || '-'}</p>
                            <p className="text-sm text-slate-600">Paket: {createModal.customer.package_type || createModal.customer.custom_package || '-'}</p>
                        </AdminConsoleSurface>
                        <AdminConsoleField label="Nominal (Rp)">
                            <input
                                type="text"
                                value={formatNumberWithComma(amount)}
                                onChange={(e) => handleAmountChange(e, setAmount)}
                                required
                                className={adminConsoleInputClassName}
                                placeholder="Masukkan nominal tagihan"
                            />
                            {amount && <p className="mt-1 text-xs text-slate-400">Rp {formatNumberWithComma(amount)}</p>}
                            {createModal.suggestedPackage && (
                                <p className="mt-1 text-xs text-blue-600">
                                    Sugesti dari paket {createModal.suggestedPackage.name}: {formatCurrency(createModal.suggestedPackage.price)}.
                                    Anda tetap bisa ubah nominal jika diperlukan.
                                </p>
                            )}
                        </AdminConsoleField>
                        <AdminConsoleActionRow>
                            <Button type="button" variant="secondary" onClick={closeCreateModal} className={adminConsoleButtonClassNames.secondary}>
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={submitting} className={adminConsoleButtonClassNames.primary}>
                                {submitting ? 'Memproses...' : 'Buat Tagihan'}
                            </Button>
                        </AdminConsoleActionRow>
                    </form>
                )}
            </Modal>

            {/* Select Customer Service Package Modal */}
            <Modal
                isOpen={servicePackageModal.open}
                onClose={closeServicePackageModal}
                title="Pilih Layanan Pelanggan"
                theme="dashboard"
            >
                {servicePackageModal.customer && (
                    <form onSubmit={handleServicePackageSubmit} className="space-y-4">
                        <AdminConsoleNotice tone="warning" title="Data Layanan">
                            <p>
                                Layanan pelanggan saat ini tidak ditemukan pada daftar paket aktif.
                                Pilih layanan yang tersedia untuk memperbarui data pelanggan sebelum membuat tagihan.
                            </p>
                        </AdminConsoleNotice>
                        <AdminConsoleSurface accent="amber" className="p-4">
                            <p className="font-semibold text-slate-900">{servicePackageModal.customer.name}</p>
                            <p className="text-sm text-slate-600">
                                Layanan saat ini: {getCustomerServiceLabel(servicePackageModal.customer) || '-'}
                            </p>
                        </AdminConsoleSurface>
                        <AdminConsoleField label="Layanan Tersedia">
                            <select
                                value={servicePackageModal.selectedPackageId}
                                onChange={(e) => setServicePackageModal((prev) => ({ ...prev, selectedPackageId: e.target.value }))}
                                required
                                className={adminConsoleSelectClassName}
                            >
                                <option value="">Pilih layanan</option>
                                {activePackages.map((pkg) => (
                                    <option key={pkg.id} value={pkg.id}>
                                        {pkg.name} ({formatCurrency(pkg.price)})
                                    </option>
                                ))}
                            </select>
                        </AdminConsoleField>
                        <AdminConsoleActionRow>
                            <Button type="button" variant="secondary" onClick={closeServicePackageModal} className={adminConsoleButtonClassNames.secondary}>
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={updatingCustomerService} className={adminConsoleButtonClassNames.primary}>
                                {updatingCustomerService ? 'Menyimpan...' : 'Simpan Layanan'}
                            </Button>
                        </AdminConsoleActionRow>
                    </form>
                )}
            </Modal>

            {/* Send Link Modal */}
            <Modal
                isOpen={linkModal.open}
                onClose={() => setLinkModal({ open: false, invoice: null, customer: null })}
                title="Kirim Link Penagihan"
                theme="dashboard"
            >
                {linkModal.invoice && linkModal.customer && (
                    <div className="space-y-4">
                        <AdminConsoleField label="Link Invoice">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={resolveInvoiceUrl(linkModal.invoice)}
                                    className={`flex-1 ${adminConsoleReadOnlyClassName}`}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => copyToClipboard(resolveInvoiceUrl(linkModal.invoice), 'Link')}
                                    className={adminConsoleButtonClassNames.secondary}
                                >
                                    <Copy size={16} />
                                </Button>
                            </div>
                        </AdminConsoleField>
                        <AdminConsoleField label="Template Pesan">
                            <textarea
                                readOnly
                                value={generateTemplate(linkModal.customer, linkModal.invoice)}
                                rows={8}
                                className={adminConsoleReadOnlyClassName}
                            />
                        </AdminConsoleField>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => copyToClipboard(generateTemplate(linkModal.customer, linkModal.invoice), 'Template')}
                                className={adminConsoleButtonClassNames.secondary}
                            >
                                <Copy size={16} className="mr-1" /> Copy Template
                            </Button>
                            <a
                                href={getWhatsAppLink(linkModal.customer, linkModal.invoice)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-2 text-white shadow-sm transition hover:bg-emerald-700"
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
                theme="dashboard"
            >
                {confirmModal.invoice && (
                    <form onSubmit={handleConfirmPayment} className="space-y-4">
                        {(() => {
                            const actionState = resolveInvoiceActionState(confirmModal.invoice);
                            const modalProofUrl = actionState.canPreviewProof ? resolvePaymentProofUrl(confirmModal.invoice) : '';

                            if (actionState.canPreviewProof) {
                                return (
                                    <AdminConsoleNotice tone="info" title="Bukti Pembayaran">
                                        <p className="mb-2">Pelanggan telah mengupload bukti pembayaran</p>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => openProofPreview(confirmModal.invoice)}
                                                className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                                            >
                                                <Eye size={14} /> Lihat Bukti Pembayaran
                                            </button>
                                            <a
                                                href={modalProofUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-slate-600 hover:underline"
                                            >
                                                Buka di tab baru
                                            </a>
                                        </div>
                                    </AdminConsoleNotice>
                                );
                            }

                            if (actionState.canReject) {
                                return (
                                    <AdminConsoleNotice tone="warning">
                                        <p>
                                            Status menunggu konfirmasi, tetapi file bukti pembayaran tidak tersedia atau tidak valid.
                                        </p>
                                    </AdminConsoleNotice>
                                );
                            }

                            return null;
                        })()}
                        <AdminConsoleField label="Nominal Dibayarkan">
                            <input
                                type="text"
                                value={formatNumberWithComma(paidAmount)}
                                onChange={(e) => handleAmountChange(e, setPaidAmount)}
                                required
                                className={adminConsoleInputClassName}
                            />
                            <p className="mt-1 text-xs text-slate-400">Rp {formatNumberWithComma(paidAmount)} - Nominal default sesuai invoice, bisa diubah jika pembayaran berbeda.</p>
                        </AdminConsoleField>
                        <AdminConsoleField label="Terima via">
                            <select
                                value={paymentReceiptOptionId}
                                onChange={(e) => setPaymentReceiptOptionId(e.target.value)}
                                required={paymentReceiptOptions.length > 0}
                                disabled={loadingPaymentReceiptOptions}
                                className={adminConsoleSelectClassName}
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
                            <p className="mt-1 text-xs text-slate-400">Daftar diambil dari menu Pengaturan Penerimaan Pembayaran.</p>
                            {!loadingPaymentReceiptOptions && paymentReceiptOptions.length === 0 && (
                                <p className="mt-1 text-xs text-amber-600">Tambahkan atau aktifkan opsi penerimaan pembayaran di menu pengaturan terlebih dahulu.</p>
                            )}
                        </AdminConsoleField>
                        {canChoosePaymentReceiver && (
                            <AdminConsoleField label="Penerima Pembayaran">
                                <select
                                    value={paymentReceiverUserId}
                                    onChange={(e) => setPaymentReceiverUserId(e.target.value)}
                                    disabled={loadingPaymentReceivers}
                                    className={adminConsoleSelectClassName}
                                >
                                    <option value="">
                                        {loadingPaymentReceivers ? 'Memuat penerima...' : 'Akun saya (default)'}
                                    </option>
                                    {paymentReceivers.map((receiver) => (
                                        <option key={receiver.id} value={receiver.id}>
                                        {getPaymentReceiverLabel(receiver)}
                                    </option>
                                ))}
                                </select>
                                <p className="mt-1 text-xs text-slate-400">Jika dikosongkan, penerima otomatis akun Anda.</p>
                            </AdminConsoleField>
                        )}
                        {canChoosePaymentMutation && (
                            <label className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={includeInMutation}
                                    onChange={(e) => setIncludeInMutation(e.target.checked)}
                                    className={adminConsoleCheckboxClassName}
                                />
                                <div>
                                    <p className="text-sm font-medium text-slate-900">Masukkan ke Mutasi</p>
                                    <p className="text-xs text-slate-500">Jika tidak dicentang, invoice dibayar tanpa mutasi dan tanpa hutang penerima.</p>
                                </div>
                            </label>
                        )}
                        <AdminConsoleActionRow>
                            <Button type="button" variant="secondary" onClick={closeConfirmModal} className={adminConsoleButtonClassNames.secondary}>
                                Batal
                            </Button>
                            <Button type="submit" variant="warning" disabled={submitting} className={adminConsoleButtonClassNames.warning}>
                                {submitting ? 'Memproses...' : 'Konfirmasi'}
                            </Button>
                        </AdminConsoleActionRow>
                    </form>
                )}
            </Modal>

            {/* Proof Preview Modal */}
            <Modal
                isOpen={proofPreviewModal.open}
                onClose={closeProofPreviewModal}
                title="Preview Bukti Pembayaran"
                theme="dashboard"
            >
                <div className="space-y-3">
                    {proofPreviewModal.loading && (
                        <div className="py-8">
                            <LoadingSpinner text="Memuat bukti pembayaran..." />
                        </div>
                    )}

                    {!proofPreviewModal.loading && proofPreviewModal.error && (
                        <AdminConsoleNotice tone="danger">
                            {proofPreviewModal.error}
                        </AdminConsoleNotice>
                    )}

                    {!proofPreviewModal.loading && !proofPreviewModal.error && proofPreviewModal.type === 'image' && (
                        <AdminConsoleSurface className="max-h-[70vh] overflow-auto p-2" accent="cyan">
                            <img
                                src={proofPreviewModal.url}
                                alt="Bukti pembayaran"
                                className="w-full h-auto object-contain rounded"
                                onError={loadPaymentProofDataUrlFallback}
                            />
                        </AdminConsoleSurface>
                    )}

                    {!proofPreviewModal.loading && !proofPreviewModal.error && proofPreviewModal.type === 'pdf' && (
                        <AdminConsoleSurface className="h-[70vh] overflow-hidden p-0" accent="violet">
                            <iframe
                                src={proofPreviewModal.url}
                                title="Preview Bukti Pembayaran PDF"
                                className="w-full h-full"
                            />
                        </AdminConsoleSurface>
                    )}

                    {!proofPreviewModal.loading && proofPreviewModal.type === 'other' && (
                        <AdminConsoleNotice tone="warning">
                            Format file tidak bisa dipreview di modal. Gunakan "Buka di tab baru".
                        </AdminConsoleNotice>
                    )}

                    {proofPreviewModal.externalUrl && (
                        <AdminConsoleActionRow className="border-t-0 pt-0">
                            <a
                                href={proofPreviewModal.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-xl border border-blue-200 bg-blue-600 px-3 py-2 text-sm text-white shadow-sm transition hover:bg-blue-700"
                            >
                                Buka di tab baru
                            </a>
                        </AdminConsoleActionRow>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={otherReceiverModal.open}
                onClose={() => setOtherReceiverModal({ open: false, selectedReceiver: null })}
                title="Konfirmasi Akun Penerima"
                theme="dashboard"
            >
                <div className="space-y-4">
                    <AdminConsoleNotice tone="warning" title="Penerima Bukan Akun Sendiri">
                        <p>Anda memilih akun penerima selain akun Anda sendiri. Pilih apakah mutasi menunggu konfirmasi akun penerima atau langsung dimasukkan ke hutang.</p>
                        {otherReceiverModal.selectedReceiver?.is_company_finance_receiver && (
                            <p className="mt-2">Akun yang dipilih adalah akun keuangan perusahaan. Jika akun ini menyetujui, mutasi akan menjadi confirmed tanpa membuat hutang.</p>
                        )}
                    </AdminConsoleNotice>
                    <AdminConsoleActionRow className="border-t-0 pt-0">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setOtherReceiverModal({ open: false, selectedReceiver: null })}
                            className={adminConsoleButtonClassNames.secondary}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            variant="warning"
                            disabled={submitting}
                            onClick={async () => {
                                setOtherReceiverModal({ open: false, selectedReceiver: null });
                                await submitConfirmPayment({
                                    otherReceiverConfirmed: true,
                                    receiverConflictResolution: 'approval',
                                });
                            }}
                            className={adminConsoleButtonClassNames.warning}
                        >
                            {submitting ? 'Memproses...' : 'Tunggu Konfirmasi Penerima'}
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            disabled={submitting}
                            onClick={async () => {
                                setOtherReceiverModal({ open: false, selectedReceiver: null });
                                await submitConfirmPayment({
                                    otherReceiverConfirmed: true,
                                    receiverConflictResolution: 'debt',
                                });
                            }}
                            className={adminConsoleButtonClassNames.danger}
                        >
                            {submitting ? 'Memproses...' : 'Masukkan ke Hutang'}
                        </Button>
                    </AdminConsoleActionRow>
                </div>
            </Modal>

            <Modal
                isOpen={receiverConflictModal.open}
                onClose={() => setReceiverConflictModal({ open: false, message: '' })}
                title="Akun Penerima Tidak Diizinkan"
                theme="dashboard"
            >
                <div className="space-y-4">
                    <AdminConsoleNotice tone="warning" title="Butuh Keputusan">
                        <p>{receiverConflictModal.message || 'Akun penerima yang dipilih tidak termasuk mapping yang diizinkan.'}</p>
                    </AdminConsoleNotice>
                    <AdminConsoleActionRow className="border-t-0 pt-0">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setReceiverConflictModal({ open: false, message: '' })}
                            className={adminConsoleButtonClassNames.secondary}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            variant="warning"
                            disabled={submitting}
                            onClick={async () => {
                                setReceiverConflictModal({ open: false, message: '' });
                                await submitConfirmPayment({
                                    otherReceiverConfirmed: true,
                                    receiverConflictResolution: 'approval',
                                });
                            }}
                            className={adminConsoleButtonClassNames.warning}
                        >
                            {submitting ? 'Memproses...' : 'Jangan Masuk Hutang'}
                        </Button>
                        <Button
                            type="button"
                            variant="danger"
                            disabled={submitting}
                            onClick={async () => {
                                setReceiverConflictModal({ open: false, message: '' });
                                await submitConfirmPayment({
                                    otherReceiverConfirmed: true,
                                    receiverConflictResolution: 'debt',
                                });
                            }}
                            className={adminConsoleButtonClassNames.danger}
                        >
                            {submitting ? 'Memproses...' : 'Masukkan ke Hutang'}
                        </Button>
                    </AdminConsoleActionRow>
                </div>
            </Modal>

            {/* Unauthorized Confirm Payment Modal */}
            <Modal
                isOpen={permissionModal.open}
                onClose={() => setPermissionModal({ open: false, message: '' })}
                title="Akses Ditolak"
                theme="dashboard"
            >
                <div className="space-y-4">
                    <AdminConsoleNotice tone="danger" title="Akses Ditolak">
                        <p>
                            {permissionModal.message || 'Anda tidak diizinkan melakukan konfirmasi pembayaran.'}
                        </p>
                    </AdminConsoleNotice>
                    <AdminConsoleActionRow className="border-t-0 pt-0">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setPermissionModal({ open: false, message: '' })}
                            className={adminConsoleButtonClassNames.secondary}
                        >
                            Tutup
                        </Button>
                    </AdminConsoleActionRow>
                </div>
            </Modal>

            {/* Reject Payment Modal */}
            <Modal
                isOpen={rejectModal.open}
                onClose={() => setRejectModal({ open: false, invoice: null })}
                title="Tolak Pembayaran"
                theme="dashboard"
            >
                <form onSubmit={handleRejectPayment} className="space-y-4">
                    <AdminConsoleNotice tone="danger" title="Konfirmasi">
                        <p>
                            Yakin ingin menolak bukti pembayaran ini? Pelanggan akan diminta upload ulang bukti pembayaran yang valid.
                        </p>
                    </AdminConsoleNotice>
                    <AdminConsoleField label="Alasan Penolakan (opsional)">
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            className={adminConsoleTextareaClassName}
                            placeholder="Masukkan alasan penolakan..."
                        />
                    </AdminConsoleField>
                    <AdminConsoleActionRow>
                        <Button type="button" variant="secondary" onClick={() => setRejectModal({ open: false, invoice: null })} className={adminConsoleButtonClassNames.secondary}>
                            Batal
                        </Button>
                        <Button type="submit" variant="danger" disabled={submitting} className={adminConsoleButtonClassNames.danger}>
                            {submitting ? 'Memproses...' : 'Tolak'}
                        </Button>
                    </AdminConsoleActionRow>
                </form>
            </Modal>

            {/* Result Modal */}
            <Modal
                isOpen={resultModal.open}
                onClose={() => setResultModal({ open: false, data: null })}
                title="Tagihan Berhasil Dibuat"
                theme="dashboard"
            >
                {resultModal.data && (
                    <div className="space-y-4">
                        <AdminConsoleNotice tone="success" title="Berhasil">
                            <p>Tagihan berhasil dibuat! Kirim link ke pelanggan melalui WhatsApp.</p>
                        </AdminConsoleNotice>
                        <AdminConsoleSurface accent="emerald" className="p-4">
                            <p className="font-semibold text-slate-900">{resultModal.data.customer?.name || '-'}</p>
                            <p className="text-sm text-slate-600">PPPoE: {resultModal.data.customer?.pppoe_username || '-'}</p>
                            <p className="text-sm text-slate-600">No. WA: {resultModal.data.customer?.phone || '-'}</p>
                        </AdminConsoleSurface>
                        <AdminConsoleField label="Link Invoice">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={resolveInvoiceUrl(resultModal.data.invoice_link)}
                                    className={`flex-1 ${adminConsoleReadOnlyClassName}`}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => copyToClipboard(resolveInvoiceUrl(resultModal.data.invoice_link), 'Link')}
                                    className={adminConsoleButtonClassNames.secondary}
                                >
                                    <Copy size={16} />
                                </Button>
                            </div>
                        </AdminConsoleField>
                        <AdminConsoleField label="Template Pesan">
                            <textarea
                                readOnly
                                value={resultModal.data.template}
                                rows={8}
                                className={adminConsoleReadOnlyClassName}
                            />
                        </AdminConsoleField>
                        <AdminConsoleActionRow className="border-t-0 pt-0 flex-wrap justify-end">
                            <a
                                href={resultModal.data.customer ? getWhatsAppLink(resultModal.data.customer, resultModal.data.invoice_link) : '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center rounded-xl px-4 py-2 font-medium transition ${resultModal.data.customer ? 'border border-emerald-200 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700' : 'pointer-events-none bg-slate-100 text-slate-400'}`}
                            >
                                <Send size={16} className="mr-1" /> Kirim ke WhatsApp
                            </a>
                            <Button type="button" variant="secondary" onClick={() => setResultModal({ open: false, data: null })} className={adminConsoleButtonClassNames.secondary}>
                                Tutup
                            </Button>
                        </AdminConsoleActionRow>
                    </div>
                )}
            </Modal>

            {/* Edit Invoice Amount Modal */}
            <Modal
                isOpen={editAmountModal.open}
                onClose={() => setEditAmountModal({ open: false, invoice: null, customer: null })}
                title="Ubah Nominal Invoice"
                theme="dashboard"
            >
                {editAmountModal.invoice && (
                    <form onSubmit={handleUpdateInvoiceAmount} className="space-y-4">
                        <AdminConsoleSurface accent="violet" className="p-4 text-sm">
                            <p className="font-semibold text-slate-900">{editAmountModal.customer?.name || '-'}</p>
                            <p className="text-slate-600">Status invoice: {editAmountModal.invoice.status}</p>
                        </AdminConsoleSurface>
                        <AdminConsoleField label="Nominal Baru">
                            <input
                                type="text"
                                value={formatNumberWithComma(newInvoiceAmount)}
                                onChange={(e) => handleAmountChange(e, setNewInvoiceAmount)}
                                required
                                className={adminConsoleInputClassName}
                                placeholder="Masukkan nominal"
                            />
                        </AdminConsoleField>
                        <AdminConsoleActionRow>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setEditAmountModal({ open: false, invoice: null, customer: null })}
                                className={adminConsoleButtonClassNames.secondary}
                            >
                                Batal
                            </Button>
                            <Button type="submit" variant="primary" disabled={submitting} className={adminConsoleButtonClassNames.primary}>
                                {submitting ? 'Menyimpan...' : 'Simpan Nominal'}
                            </Button>
                        </AdminConsoleActionRow>
                    </form>
                )}
            </Modal>
        </div>
    );
}

export default BillingPage;
