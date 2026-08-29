import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, MapPin, ExternalLink, AlertCircle, Upload, Scan, Sparkles, Check, X, Loader2 } from 'lucide-react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { HOME_ROUTER_OPTIONS, getHomeRouterPreset } from '../../constants/homeRouterPresets';

const DEFAULT_FORM_DATA = {
    google_sheets_timestamp: '',
    name: '',
    area_code: '',
    kecamatan_id: '',
    desa_id: '',
    dusun_id: '',
    email: '',
    phone: '',
    address: '',
    gender: '',
    package_type: '',
    custom_package: '',
    activation_date: '',
    due_date: '',
    pppoe_username: '',
    home_router_type: 'mikrotik',
    home_router_host: '',
    home_router_port: '8728',
    home_router_username: '',
    home_router_password: '',
    home_router_wan_interface: '',
    home_router_monitoring_enabled: false,
    enable_home_router: false,
    enable_installation_team: false,
    odp: '',
    installation_fee: '',
    is_active: true,
    latitude: '',
    longitude: '',
    installer_member_ids: [],
    installation_router_item_id: '',
    installation_cable_item_id: '',
    installation_cable_used: '',
    installation_labor_fee: '',
    installation_cable_rate: '',
    installation_notes: '',
    contract_ktp_number: '',
    contract_router_mac: '',
    contract_device_serial: '',
    contract_device_notes: '',
    contract_installation_photos: [],
    contract_photo_front_url: '',
    contract_photo_modem_url: '',
    contract_photo_ktp_url: '',
};

function CustomerVerificationForm() {
    const { timestamp } = useParams();
    const navigate = useNavigate();
    const userRole = window.appUserRole || 'admin';
    const isSuperAdmin = userRole === 'superadmin';
    const canChoosePaymentReceiver = isSuperAdmin || !!window.appCanChoosePaymentReceiver;
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [paymentReceiptOptions, setPaymentReceiptOptions] = useState([]);
    const [paymentReceivers, setPaymentReceivers] = useState([]);
    const [loadingPaymentReceivers, setLoadingPaymentReceivers] = useState(false);
    const [paymentReceiptOptionId, setPaymentReceiptOptionId] = useState('');
    const [paymentReceiverUserId, setPaymentReceiverUserId] = useState(window.appUserId ? String(window.appUserId) : '');
    const [installationPaymentModal, setInstallationPaymentModal] = useState({ open: false });
    const [otherReceiverModal, setOtherReceiverModal] = useState({ open: false, selectedReceiver: null });
    const [receiverConflictModal, setReceiverConflictModal] = useState({ open: false, message: '' });
    const [packageList, setPackageList] = useState([]);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [sheetsReference, setSheetsReference] = useState(null);
    const [secretInfo, setSecretInfo] = useState(null);
    const [agreementInfo, setAgreementInfo] = useState(null);
    const [showSecretModal, setShowSecretModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);
    const [errorModalMessage, setErrorModalMessage] = useState('');
    const [payrollMembers, setPayrollMembers] = useState([]);
    const [kecamatanOptions, setKecamatanOptions] = useState([]);
    const [desaOptions, setDesaOptions] = useState([]);
    const [dusunOptions, setDusunOptions] = useState([]);
    const [odpList, setOdpList] = useState([]);
    const [odpLoading, setOdpLoading] = useState(false);
    const [odpScope, setOdpScope] = useState('dusun');
    const [odpDropdownOpen, setOdpDropdownOpen] = useState(false);
    const [odpSearch, setOdpSearch] = useState('');
    const [showExpandOdp, setShowExpandOdp] = useState(false);
    const [analyzingMac, setAnalyzingMac] = useState(false);
    const [detectedMac, setDetectedMac] = useState(null);
    const [macAnalysisMeta, setMacAnalysisMeta] = useState(null);
    const [installInventoryOptions, setInstallInventoryOptions] = useState({
        all_items: [],
        router_items: [],
        cable_items: [],
        default_pricing: {
            installation_labor_fee_default: 0,
            installation_cable_rate_default: 0,
        },
    });

    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const selectedRouterPreset = getHomeRouterPreset(formData.home_router_type);

    const routerStockOptions = installInventoryOptions.router_items?.length > 0
        ? installInventoryOptions.router_items
        : installInventoryOptions.all_items;
    const cableStockOptions = installInventoryOptions.cable_items?.length > 0
        ? installInventoryOptions.cable_items
        : installInventoryOptions.all_items;

    const odpDropdownRef = useRef(null);
    const odpListContainerRef = useRef(null);

    useEffect(() => {
        fetchPackageList();
        fetchPayrollMembers();
        fetchInstallInventoryOptions();
        fetchKecamatanOptions();
        fetchPaymentReceiptOptions();
        fetchCustomerData();
    }, [timestamp]);

    useEffect(() => {
        if (canChoosePaymentReceiver) {
            fetchPaymentReceivers();
        }
    }, [canChoosePaymentReceiver]);

    useEffect(() => {
        if (!formData.desa_id || !formData.dusun_id) {
            setOdpList([]);
            setOdpScope('dusun');
            setShowExpandOdp(false);
            setFormData((prev) => ({ ...prev, odp: '' }));
            return;
        }

        fetchOdpOptions('dusun');
    }, [formData.desa_id, formData.dusun_id]);

    useEffect(() => {
        const handler = (event) => {
            if (odpDropdownRef.current && !odpDropdownRef.current.contains(event.target)) {
                setOdpDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!odpDropdownOpen || odpScope !== 'dusun' || odpLoading) {
            return;
        }

        const el = odpListContainerRef.current;
        if (!el) {
            return;
        }

        if (el.scrollHeight <= el.clientHeight) {
            setShowExpandOdp(true);
        }
    }, [odpDropdownOpen, odpScope, odpLoading, odpList]);

    useEffect(() => {
        if (!formData.kecamatan_id) {
            setDesaOptions([]);
            setDusunOptions([]);
            setFormData((prev) => ({ ...prev, desa_id: '', dusun_id: '' }));
            return;
        }

        fetchDesaOptions(formData.kecamatan_id);
    }, [formData.kecamatan_id]);

    useEffect(() => {
        if (!formData.desa_id) {
            setDusunOptions([]);
            setFormData((prev) => ({ ...prev, dusun_id: '' }));
            return;
        }

        fetchDusunOptions(formData.desa_id);
    }, [formData.desa_id]);

    const fetchPackageList = async () => {
        try {
            const response = await fetch('/api/packages/active');
            const data = await response.json();
            setPackageList(data.data || []);
        } catch (err) {
            console.error('Failed to load package list', err);
        }
    };

    const fetchPaymentReceiptOptions = async () => {
        try {
            const response = await fetch('/api/payment-receipt-options/active', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            const data = await response.json();
            const rows = Array.isArray(data) ? data : [];
            setPaymentReceiptOptions(rows);
            const defaultOption = rows.find((option) => option.is_default) || rows[0];
            setPaymentReceiptOptionId(defaultOption ? String(defaultOption.id) : '');
        } catch (err) {
            setPaymentReceiptOptions([]);
        }
    };

    const fetchPaymentReceivers = async () => {
        try {
            setLoadingPaymentReceivers(true);
            const response = await fetch('/api/payment-receivers', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            const data = await response.json();
            const rows = Array.isArray(data?.data) ? data.data : [];
            setPaymentReceivers(rows);
            if (!paymentReceiverUserId && window.appUserId) {
                setPaymentReceiverUserId(String(window.appUserId));
            }
        } catch (err) {
            setPaymentReceivers([]);
        } finally {
            setLoadingPaymentReceivers(false);
        }
    };

    const fetchKecamatanOptions = async () => {
        try {
            const response = await fetch('/api/master-wilayah/kecamatan', {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat master kecamatan');
            }

            const data = await response.json();
            setKecamatanOptions(data.data || []);
        } catch (err) {
            console.error('Failed to load kecamatan options', err);
        }
    };

    const fetchDesaOptions = async (kecamatanId) => {
        try {
            const response = await fetch(`/api/master-wilayah/desa?kecamatan_id=${encodeURIComponent(kecamatanId)}`, {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat master desa');
            }

            const data = await response.json();
            setDesaOptions(data.data || []);
        } catch (err) {
            console.error('Failed to load desa options', err);
        }
    };

    const fetchDusunOptions = async (desaId) => {
        try {
            const response = await fetch(`/api/master-wilayah/dusun?desa_id=${encodeURIComponent(desaId)}`, {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat master dusun');
            }

            const data = await response.json();
            setDusunOptions(data.data || []);
        } catch (err) {
            console.error('Failed to load dusun options', err);
        }
    };

    const fetchOdpOptions = async (scope = 'dusun') => {
        try {
            setOdpLoading(true);
            setShowExpandOdp(false);
            const url = `/api/customer-verification/odps/options?desa_id=${encodeURIComponent(formData.desa_id)}&dusun_id=${encodeURIComponent(formData.dusun_id)}&scope=${scope}`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat opsi ODP');
            }

            const data = await response.json();
            setOdpList(data.data || []);
            setOdpScope(data?.meta?.scope || scope);
        } catch (err) {
            console.error('Failed to load ODP options', err);
            setOdpList([]);
        } finally {
            setOdpLoading(false);
        }
    };

    const filteredOdpOptions = useMemo(() => {
        const keyword = odpSearch.trim().toLowerCase();
        if (keyword === '') {
            return odpList;
        }

        return odpList.filter((item) =>
            (item.nama || '').toLowerCase().includes(keyword)
            || (item.alamat_detail || '').toLowerCase().includes(keyword)
        );
    }, [odpList, odpSearch]);

    const selectedOdpLabel = useMemo(() => {
        if (!formData.odp) {
            return 'Pilih ODP';
        }

        const found = odpList.find((item) => item.nama === formData.odp);
        if (!found) {
            return formData.odp;
        }

        return `${found.nama}${found.rasio_distribusi ? ` (${found.rasio_distribusi})` : ''}`;
    }, [formData.odp, odpList]);

    const fetchPayrollMembers = async () => {
        try {
            const response = await fetch('/api/payroll/members-lite', {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat data pelaksana payroll');
            }

            const data = await response.json();
            setPayrollMembers(data.data || []);
        } catch (err) {
            console.error('Failed to load payroll members', err);
        }
    };

    const fetchInstallInventoryOptions = async () => {
        try {
            const response = await fetch('/api/inventory/items/install-options', {
                headers: {
                    'Accept': 'application/json',
                },
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Gagal memuat opsi stok inventori instalasi');
            }

            const data = await response.json();
            const defaultPricing = {
                installation_labor_fee_default: data?.default_pricing?.installation_labor_fee_default ?? 0,
                installation_cable_rate_default: data?.default_pricing?.installation_cable_rate_default ?? 0,
            };

            setInstallInventoryOptions({
                all_items: data.all_items || [],
                router_items: data.router_items || [],
                cable_items: data.cable_items || [],
                default_pricing: defaultPricing,
            });

            setFormData((prev) => {
                const hasLaborFee = prev.installation_labor_fee !== ''
                    && prev.installation_labor_fee !== null
                    && prev.installation_labor_fee !== undefined;
                const hasCableRate = prev.installation_cable_rate !== ''
                    && prev.installation_cable_rate !== null
                    && prev.installation_cable_rate !== undefined;

                return {
                    ...prev,
                    installation_labor_fee: hasLaborFee
                        ? prev.installation_labor_fee
                        : String(defaultPricing.installation_labor_fee_default ?? 0),
                    installation_cable_rate: hasCableRate
                        ? prev.installation_cable_rate
                        : String(defaultPricing.installation_cable_rate_default ?? 0),
                };
            });
        } catch (err) {
            console.error('Failed to load inventory install options', err);
        }
    };

    const fetchCustomerData = async () => {
        try {
            const response = await fetch(`/api/customer-verification/get/${timestamp}`, {
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch customer data');
            }

            const data = await response.json();
            
            // Ensure all values are not null (convert null to empty string)
            const sanitizedData = {};
            for (const key in data.customer_data) {
                sanitizedData[key] = data.customer_data[key] ?? '';
            }

            const hasSanitizedLaborFee = sanitizedData.installation_labor_fee !== ''
                && sanitizedData.installation_labor_fee !== null
                && sanitizedData.installation_labor_fee !== undefined;
            const hasSanitizedCableRate = sanitizedData.installation_cable_rate !== ''
                && sanitizedData.installation_cable_rate !== null
                && sanitizedData.installation_cable_rate !== undefined;
            
            setFormData((prev) => ({
                ...DEFAULT_FORM_DATA,
                ...sanitizedData,
                contract_ktp_number: sanitizedData.contract_ktp_number || data.sheets_reference?.nik || '',
                contract_photo_front_url: data.sheets_reference?.photo_front_url || sanitizedData.photo_front_url || '',
                contract_photo_modem_url: data.sheets_reference?.photo_modem_url || sanitizedData.photo_modem_url || '',
                contract_photo_ktp_url: data.sheets_reference?.photo_ktp_url || sanitizedData.photo_ktp_url || '',
                installation_labor_fee: hasSanitizedLaborFee
                    ? sanitizedData.installation_labor_fee
                    : prev.installation_labor_fee,
                installation_cable_rate: hasSanitizedCableRate
                    ? sanitizedData.installation_cable_rate
                    : prev.installation_cable_rate,
            }));
            setSheetsReference(data.sheets_reference);
        } catch (err) {
            setError(err.message || 'Gagal memuat data pelanggan');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const composeAddressFromSelection = (dusunId, desaId, kecamatanId) => {
        const selectedDusun = dusunOptions.find((item) => String(item.id) === String(dusunId));
        const selectedDesa = desaOptions.find((item) => String(item.id) === String(desaId));
        const selectedKecamatan = kecamatanOptions.find((item) => String(item.id) === String(kecamatanId));
        const parts = [
            selectedDusun?.name,
            selectedDesa?.name,
            selectedKecamatan?.name,
        ].filter(Boolean);
        return parts.join(', ');
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        // Auto-calculate due_date when activation_date changes (+30 days)
        if (name === 'activation_date' && value) {
            const activationDate = new Date(value);
            activationDate.setDate(activationDate.getDate() + 30);
            const dueDate = activationDate.toISOString().split('T')[0];
            setFormData((prev) => ({
                ...prev,
                [name]: value,
                due_date: dueDate,
            }));
            return;
        }

        if (name === 'home_router_type') {
            const nextPreset = getHomeRouterPreset(value);

            setFormData((prev) => {
                const currentPreset = getHomeRouterPreset(prev.home_router_type);
                const shouldReplacePort = !prev.home_router_port || prev.home_router_port === currentPreset.defaultPort;
                const shouldReplaceUsername = !prev.home_router_username || prev.home_router_username === currentPreset.defaultUsername;
                const shouldReplacePassword = !prev.home_router_password || prev.home_router_password === currentPreset.defaultPassword;

                return {
                    ...prev,
                    home_router_type: value,
                    home_router_port: shouldReplacePort ? nextPreset.defaultPort : prev.home_router_port,
                    home_router_username: shouldReplaceUsername ? nextPreset.defaultUsername : prev.home_router_username,
                    home_router_password: shouldReplacePassword ? nextPreset.defaultPassword : prev.home_router_password,
                };
            });

            return;
        }

        if (name === 'enable_home_router') {
            setFormData((prev) => {
                if (checked) {
                    return {
                        ...prev,
                        enable_home_router: true,
                    };
                }

                return {
                    ...prev,
                    enable_home_router: false,
                    home_router_monitoring_enabled: false,
                    home_router_type: 'mikrotik',
                    home_router_host: '',
                    home_router_port: '8728',
                    home_router_username: '',
                    home_router_password: '',
                    home_router_wan_interface: '',
                };
            });

            return;
        }

        if (name === 'enable_installation_team') {
            setFormData((prev) => {
                if (checked) {
                    return {
                        ...prev,
                        enable_installation_team: true,
                    };
                }

                return {
                    ...prev,
                    enable_installation_team: false,
                    installer_member_ids: [],
                    installation_router_item_id: '',
                    installation_cable_item_id: '',
                    installation_cable_used: '',
                    installation_labor_fee: '',
                    installation_cable_rate: '',
                    installation_notes: '',
                };
            });

            return;
        }

        if (name === 'kecamatan_id') {
            setFormData((prev) => ({
                ...prev,
                kecamatan_id: value,
                desa_id: '',
                dusun_id: '',
            }));
            return;
        }

        if (name === 'desa_id') {
            setFormData((prev) => ({
                ...prev,
                desa_id: value,
                dusun_id: '',
            }));
            return;
        }

        if (name === 'dusun_id') {
            setFormData((prev) => ({
                ...prev,
                dusun_id: value,
                address: composeAddressFromSelection(value, prev.desa_id, prev.kecamatan_id),
            }));
            return;
        }
        
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleFileChange = (e) => {
        const { name, files } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: Array.from(files || []),
        }));
    };

    const contractPhotoNames = formData.contract_installation_photos || [];

    const handleInstallerToggle = (memberId) => {
        setFormData((prev) => {
            const current = Array.isArray(prev.installer_member_ids) ? prev.installer_member_ids : [];
            const numericMemberId = Number(memberId);

            if (current.includes(numericMemberId)) {
                return {
                    ...prev,
                    installer_member_ids: current.filter((id) => id !== numericMemberId),
                };
            }

            return {
                ...prev,
                installer_member_ids: [...current, numericMemberId],
            };
        });
    };

    const handleOdpListScroll = (event) => {
        if (odpScope !== 'dusun') {
            return;
        }

        const element = event.currentTarget;
        const reachedBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 4;
        setShowExpandOdp(reachedBottom);
    };

    const handleExpandOdp = async () => {
        await fetchOdpOptions('desa');
    };

    const selectOdp = (odpName) => {
        setFormData((prev) => ({ ...prev, odp: odpName }));
        setOdpDropdownOpen(false);
    };

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Geolocation tidak didukung oleh browser Anda');
            return;
        }
        setGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setFormData((prev) => ({
                    ...prev,
                    latitude: position.coords.latitude.toString(),
                    longitude: position.coords.longitude.toString(),
                }));
                setGettingLocation(false);
            },
            (err) => {
                setError('Gagal mendapatkan lokasi: ' + err.message);
                setGettingLocation(false);
            },
            { enableHighAccuracy: true }
        );
    };

    const getPaymentReceiverLabel = (receiver) => {
        if (!receiver) return '-';
        const role = receiver.role ? ` (${receiver.role})` : '';
        const companyTag = receiver.is_company_finance_receiver ? ' [Keuangan Perusahaan]' : '';
        return `${receiver.name || receiver.email || receiver.id}${role}${companyTag}`;
    };

    const handleAnalyzeMacFromModemPhoto = async (file) => {
        if (!file) return;
        setAnalyzingMac(true);
        setDetectedMac(null);
        setMacAnalysisMeta(null);

        const body = new FormData();
        body.append('photo', file);

        try {
            const res = await fetch('/api/customer-verification/analyze-mac', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
                body,
            });

            const json = await res.json();
            if (json.mac_address) {
                setDetectedMac(json.mac_address);
                setMacAnalysisMeta(json);
            }
        } catch (err) {
            console.error('MAC analysis failed', err);
        } finally {
            setAnalyzingMac(false);
        }
    };

    const handleApplyDetectedMac = () => {
        if (detectedMac) {
            setFormData((prev) => ({ ...prev, contract_router_mac: detectedMac }));
            setDetectedMac(null);
        }
    };

    const closeInstallationPaymentFlow = () => {
        setInstallationPaymentModal({ open: false });
        setOtherReceiverModal({ open: false, selectedReceiver: null });
        setReceiverConflictModal({ open: false, message: '' });
    };

    const performVerification = async (options = {}) => {
        setSubmitting(true);
        setError(null);
        setShowErrorModal(false);
        setErrorModalMessage('');

        try {
            if (!formData.contract_router_mac || !formData.contract_router_mac.trim()) {
                throw new Error('MAC Address Router/Modem wajib diisi untuk verifikasi dan aktivasi.');
            }

            const payload = {
                ...formData,
                kecamatan_id: formData.kecamatan_id ? Number(formData.kecamatan_id) : null,
                desa_id: formData.desa_id ? Number(formData.desa_id) : null,
                dusun_id: formData.dusun_id ? Number(formData.dusun_id) : null,
                enable_home_router: Boolean(formData.enable_home_router),
                enable_installation_team: Boolean(formData.enable_installation_team),
                installer_member_ids: Array.isArray(formData.installer_member_ids)
                    ? formData.installer_member_ids
                    : [],
                installation_router_item_id: formData.installation_router_item_id || null,
                installation_cable_item_id: formData.installation_cable_item_id || null,
                installation_cable_used: formData.installation_cable_used === '' ? null : formData.installation_cable_used,
                installation_labor_fee: formData.installation_labor_fee === '' ? null : formData.installation_labor_fee,
                installation_cable_rate: formData.installation_cable_rate === '' ? null : formData.installation_cable_rate,
                installation_notes: formData.installation_notes || null,
            };

            if (!payload.enable_home_router) {
                payload.home_router_type = null;
                payload.home_router_host = null;
                payload.home_router_port = null;
                payload.home_router_username = null;
                payload.home_router_password = null;
                payload.home_router_wan_interface = null;
                payload.home_router_monitoring_enabled = false;
            }

            if (!payload.enable_installation_team) {
                payload.installer_member_ids = [];
                payload.installation_router_item_id = null;
                payload.installation_cable_item_id = null;
                payload.installation_cable_used = null;
                payload.installation_labor_fee = null;
                payload.installation_cable_rate = null;
                payload.installation_notes = null;
            }

            const installationFee = Number(payload.installation_fee || 0);
            if (installationFee > 0) {
                if (paymentReceiptOptions.length > 0 && !paymentReceiptOptionId) {
                    throw new Error('Pilih metode pada Terima via untuk biaya pemasangan.');
                }

                payload.payment_receipt_option_id = paymentReceiptOptionId ? Number(paymentReceiptOptionId) : null;
                payload.payment_receiver_user_id = canChoosePaymentReceiver && paymentReceiverUserId
                    ? Number(paymentReceiverUserId)
                    : null;
                payload.other_receiver_confirmed = options.otherReceiverConfirmed ? '1' : '0';
                payload.receiver_conflict_resolution = options.receiverConflictResolution || '';
            }

            const formPayload = new FormData();
            Object.entries(payload).forEach(([key, value]) => {
                if (key === 'contract_installation_photos') return;
                if (Array.isArray(value)) {
                    value.forEach((item) => formPayload.append(`${key}[]`, item));
                    return;
                }
                if (typeof value === 'boolean') {
                    formPayload.append(key, value ? '1' : '0');
                    return;
                }
                formPayload.append(key, value ?? '');
            });

            (formData.contract_installation_photos || []).forEach((file) => {
                formPayload.append('contract_installation_photos[]', file);
            });

            const response = await fetch('/api/customer-verification/verify', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                    Accept: 'application/json',
                },
                body: formPayload,
            });

            const result = await response.json();

            if (!response.ok) {
                if (response.status === 422 && result?.action_required === 'confirm_other_receiver') {
                    const selectedReceiver = paymentReceivers.find((receiver) => Number(receiver.id) === Number(paymentReceiverUserId)) || null;
                    setOtherReceiverModal({ open: true, selectedReceiver });
                    setInstallationPaymentModal({ open: false });
                    return;
                }

                if (response.status === 422 && result?.action_required === 'resolve_invalid_receiver') {
                    setReceiverConflictModal({
                        open: true,
                        message: result?.message || 'Akun penerima yang dipilih tidak termasuk mapping yang diizinkan.',
                    });
                    setInstallationPaymentModal({ open: false });
                    return;
                }

                const message = result.message || 'Failed to verify customer';
                throw new Error(message);
            }

            if (!result?.secret?.name || !result?.secret?.password) {
                throw new Error('Secret PPPoE tidak tersedia pada respons verifikasi.');
            }

            closeInstallationPaymentFlow();
            setSecretInfo(result.secret || null);
            setAgreementInfo(result.agreement || null);
            setShowSecretModal(true);
            setSuccess(true);
        } catch (err) {
            const message = err.message || 'Gagal memverifikasi pelanggan';
            setError(message);
            setErrorModalMessage(message);
            setShowErrorModal(true);
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.enable_installation_team && Number(formData.installation_cable_used || 0) <= 0) {
            const message = 'Habis Kabel wajib diisi untuk pemasangan.';
            setError(message);
            setErrorModalMessage(message);
            setShowErrorModal(true);
            return;
        }

        if (Number(formData.installation_fee || 0) > 0) {
            setInstallationPaymentModal({ open: true });
            return;
        }

        await performVerification();
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <LoadingSpinner text="Memuat data pelanggan..." />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 overflow-x-hidden">
            <div className="max-w-4xl mx-auto min-w-0">
                {/* Header */}
                <div className="app-section-header mb-6">
                    <button
                        onClick={() => navigate('/customer-verification')}
                        className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
                    >
                        <ArrowLeft size={20} className="mr-2" />
                        Kembali ke Daftar
                    </button>
                    <h1 className="text-3xl font-bold text-gray-900">Verifikasi Pelanggan</h1>
                    <p className="text-gray-600 mt-1">Lengkapi data dan verifikasi pelanggan baru</p>
                </div>

                {error && (
                    <Alert variant="error" className="mb-6">
                        {error}
                    </Alert>
                )}

                {success && !showSecretModal && (
                    <Alert variant="success" className="mb-6">
                        Pelanggan berhasil diverifikasi dan disimpan!
                    </Alert>
                )}

                {/* Google Sheets Reference - Read Only Info */}
                {sheetsReference && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                        <div className="flex items-start gap-3 mb-4">
                            <AlertCircle className="text-blue-600 mt-1" size={20} />
                            <div>
                                <h3 className="font-semibold text-blue-900 mb-2">Data dari Google Sheets (Referensi)</h3>
                                <p className="text-sm text-blue-800 mb-3">
                                    Data sensitif berikut tersimpan aman di Google Sheets dan TIDAK disimpan di database aplikasi:
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    {sheetsReference.nik && (
                                        <div>
                                            <span className="font-medium text-blue-900">NIK:</span>{' '}
                                            <span className="text-blue-700">{sheetsReference.nik}</span>
                                        </div>
                                    )}
                                    {sheetsReference.photo_ktp_url && (
                                        <div>
                                            <a 
                                                href={sheetsReference.photo_ktp_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1 break-all"
                                            >
                                                Lihat Foto KTP <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                    {sheetsReference.photo_front_url && (
                                        <div>
                                            <a 
                                                href={sheetsReference.photo_front_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1 break-all"
                                            >
                                                Lihat Foto Depan <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                    {sheetsReference.photo_modem_url && (
                                        <div>
                                            <a 
                                                href={sheetsReference.photo_modem_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1 break-all"
                                            >
                                                Lihat Foto Modem <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                    {sheetsReference.photo_opm_url && (
                                        <div>
                                            <a 
                                                href={sheetsReference.photo_opm_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1 break-all"
                                            >
                                                Lihat Foto OPM <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="app-card p-6 space-y-8 min-w-0 overflow-visible">
                    {/* Personal Information */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Informasi Pribadi</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nama <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Masukkan nama lengkap"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Kecamatan <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="kecamatan_id"
                                    value={formData.kecamatan_id}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Pilih Kecamatan</option>
                                    {kecamatanOptions.map((kecamatan) => (
                                        <option key={kecamatan.id} value={kecamatan.id}>
                                            {kecamatan.name} ({kecamatan.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Desa <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="desa_id"
                                    value={formData.desa_id}
                                    onChange={handleChange}
                                    required
                                    disabled={!formData.kecamatan_id}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                                >
                                    <option value="">Pilih Desa</option>
                                    {desaOptions.map((desa) => (
                                        <option key={desa.id} value={desa.id}>
                                            {desa.name} ({desa.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Dusun <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="dusun_id"
                                    value={formData.dusun_id}
                                    onChange={handleChange}
                                    required
                                    disabled={!formData.desa_id}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                                >
                                    <option value="">Pilih Dusun</option>
                                    {dusunOptions.map((dusun) => (
                                        <option key={dusun.id} value={dusun.id}>
                                            {dusun.name} ({dusun.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="email@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nomor Telepon <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="08xxxxxxxxxx"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Jenis Kelamin
                                </label>
                                <select
                                    name="gender"
                                    value={formData.gender}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Pilih</option>
                                    <option value="male">Laki-laki</option>
                                    <option value="female">Perempuan</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Alamat
                                </label>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address}
                                    readOnly
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                                    placeholder="Alamat otomatis dari master wilayah"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Format username otomatis: KODEKEC+KODEDES+KODEDUS-namadepan003.
                        </p>
                    </div>

                    {/* Service Information */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Informasi Layanan</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tipe Paket
                                </label>
                                <select
                                    name="package_type"
                                    value={formData.package_type}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Pilih Paket</option>
                                    {packageList.map(pkg => (
                                        <option key={pkg.id} value={pkg.name}>
                                            {pkg.name} - {pkg.speed} (Rp {Number(pkg.price).toLocaleString('id-ID')})
                                        </option>
                                    ))}
                                    <option value="Custom">Custom</option>
                                </select>
                            </div>
                            {formData.package_type === 'Custom' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Detail Paket Custom
                                    </label>
                                    <input
                                        type="text"
                                        name="custom_package"
                                        value={formData.custom_package}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Jelaskan paket custom"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    ODP
                                </label>
                                <div ref={odpDropdownRef} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setOdpDropdownOpen((prev) => !prev)}
                                        disabled={!formData.desa_id || !formData.dusun_id}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-left focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                                    >
                                        {selectedOdpLabel}
                                    </button>
                                    {odpDropdownOpen && (
                                        <div className="absolute z-[80] mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                                            <div className="p-2 border-b border-gray-100">
                                                <input
                                                    type="text"
                                                    value={odpSearch}
                                                    onChange={(e) => setOdpSearch(e.target.value)}
                                                    placeholder="Cari ODP..."
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm"
                                                />
                                            </div>
                                            <div
                                                ref={odpListContainerRef}
                                                className="max-h-52 overflow-y-auto"
                                                onScroll={handleOdpListScroll}
                                            >
                                                {odpLoading ? (
                                                    <div className="px-3 py-3 text-sm text-gray-500">Memuat ODP...</div>
                                                ) : filteredOdpOptions.length === 0 ? (
                                                    <div className="px-3 py-3 text-sm text-gray-500">Tidak ada ODP sesuai wilayah.</div>
                                                ) : (
                                                    filteredOdpOptions.map((odp) => (
                                                        <button
                                                            key={odp.id}
                                                            type="button"
                                                            onClick={() => selectOdp(odp.nama)}
                                                            className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                                                        >
                                                            <div className="font-medium text-gray-900">
                                                                {odp.nama} {odp.rasio_distribusi ? `(${odp.rasio_distribusi})` : ''}
                                                            </div>
                                                            {odp.alamat_detail && (
                                                                <div className="text-xs text-gray-500 truncate">{odp.alamat_detail}</div>
                                                            )}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                            {odpScope === 'dusun' && showExpandOdp && (
                                                <div className="border-t border-gray-100 p-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleExpandOdp}
                                                        className="w-full rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                                                    >
                                                        Tampilkan lebih lengkap (semua ODP di desa)
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Default menampilkan ODP di dusun terpilih. Scroll ke bawah untuk opsi desa lengkap.
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Biaya Pemasangan
                                </label>
                                <input
                                    type="number"
                                    name="installation_fee"
                                    value={formData.installation_fee}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tanggal Aktivasi
                                </label>
                                <input
                                    type="date"
                                    name="activation_date"
                                    value={formData.activation_date}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <p className="text-xs text-gray-500 mt-1">Tanggal jatuh tempo otomatis +30 hari dari tanggal aktivasi</p>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                            <input
                                type="checkbox"
                                name="enable_home_router"
                                checked={formData.enable_home_router}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Aktifkan Router Rumah Pelanggan</span>
                        </label>

                        {formData.enable_home_router && (
                            <div className="mt-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Router Rumah Pelanggan</h2>
                                        <p className="mt-1 text-sm text-gray-600">
                                            Opsional, tapi disarankan jika portal pelanggan ingin menampilkan traffic WAN dan jumlah perangkat langsung dari rumah.
                                        </p>
                                    </div>
                                    <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                                        <input
                                            type="checkbox"
                                            name="home_router_monitoring_enabled"
                                            checked={formData.home_router_monitoring_enabled}
                                            onChange={handleChange}
                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Monitoring router rumah aktif</span>
                                    </label>
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Tipe Router
                                        </label>
                                        <select
                                            name="home_router_type"
                                            value={formData.home_router_type}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                            {HOME_ROUTER_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="mt-1 text-xs text-gray-500">{selectedRouterPreset.helper}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Host / IP Router
                                        </label>
                                        <input
                                            type="text"
                                            name="home_router_host"
                                            value={formData.home_router_host}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="192.168.88.1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Port API
                                        </label>
                                        <input
                                            type="number"
                                            name="home_router_port"
                                            value={formData.home_router_port}
                                            onChange={handleChange}
                                            min="1"
                                            max="65535"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="8728"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Username API
                                        </label>
                                        <input
                                            type="text"
                                            name="home_router_username"
                                            value={formData.home_router_username}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="admin"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Password API
                                        </label>
                                        <input
                                            type="password"
                                            name="home_router_password"
                                            value={formData.home_router_password}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Password router"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Interface WAN
                                        </label>
                                        <input
                                            type="text"
                                            name="home_router_wan_interface"
                                            value={formData.home_router_wan_interface}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="pppoe-out1"
                                        />
                                        <p className="mt-1 text-xs text-gray-500">Opsional. Kosongkan jika ingin dideteksi otomatis.</p>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                                    {selectedRouterPreset.managementMode === 'api'
                                        ? 'Monitoring langsung dari router rumah paling akurat jika pelanggan memakai MikroTik dengan API port 8728 yang bisa dijangkau server.'
                                        : 'Untuk router web-managed seperti VSOL/GL-01, portal akan probe panel admin dan menyiapkan pembacaan status model-specific.'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Location */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Lokasi Rumah</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Latitude
                                </label>
                                <input
                                    type="text"
                                    name="latitude"
                                    value={formData.latitude}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="-6.xxxxxx"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Longitude
                                </label>
                                <input
                                    type="text"
                                    name="longitude"
                                    value={formData.longitude}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="106.xxxxxx"
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={getCurrentLocation}
                            disabled={gettingLocation}
                            className="mt-3 flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                        >
                            {gettingLocation ? (
                                <Loader size={18} className="animate-spin" />
                            ) : (
                                <MapPin size={18} />
                            )}
                            {gettingLocation ? 'Mendapatkan lokasi...' : 'Gunakan Lokasi Saat Ini'}
                        </button>
                        {formData.latitude && formData.longitude && (
                            <a
                                href={`https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-block text-sm text-blue-600 hover:underline"
                            >
                                Lihat di Google Maps →
                            </a>
                        )}
                    </div>

                    {/* Contract Data */}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Data Kontrak & Perangkat</h2>
                        <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
                            Data ini akan masuk ke PDF kontrak pelanggan beserta QR tanda tangan digital. Foto dari Google Sheets otomatis disertakan sebagai link lampiran.
                        </div>
                        {(formData.contract_photo_front_url || formData.contract_photo_modem_url || formData.contract_photo_ktp_url) && (
                            <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                                <p className="font-semibold">Foto dari Google Sheets sudah terdeteksi:</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {formData.contract_photo_front_url && (
                                        <a href={formData.contract_photo_front_url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
                                            Poto Depan Rumah
                                        </a>
                                    )}
                                    {formData.contract_photo_modem_url && (
                                        <a href={formData.contract_photo_modem_url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
                                            Poto Modem
                                        </a>
                                    )}
                                    {formData.contract_photo_ktp_url && (
                                        <a href={formData.contract_photo_ktp_url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
                                            Poto KTP
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Nomor KTP
                                </label>
                                <input
                                    type="text"
                                    name="contract_ktp_number"
                                    value={formData.contract_ktp_number}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Nomor KTP pelanggan"
                                />
                            </div>
                            <div className="md:col-span-2 bg-purple-50/60 p-4 rounded-xl border border-purple-200 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="block text-sm font-semibold text-purple-900">
                                        MAC Address Router/Modem <span className="text-red-500">*</span>
                                    </label>
                                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-semibold hover:bg-purple-200 cursor-pointer transition">
                                        <Scan size={14} />
                                        Scan dari Foto Modem
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="sr-only"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleAnalyzeMacFromModemPhoto(file);
                                            }}
                                        />
                                    </label>
                                </div>

                                <input
                                    type="text"
                                    name="contract_router_mac"
                                    required
                                    value={formData.contract_router_mac}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2.5 bg-white border border-purple-300 font-mono text-sm uppercase rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent tracking-wider"
                                    placeholder="Contoh: BC:54:51:7A:B2:90"
                                />

                                {analyzingMac && (
                                    <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-purple-200 text-purple-700 text-xs">
                                        <Loader2 size={15} className="animate-spin text-purple-600" />
                                        Menganalisis foto modem...
                                    </div>
                                )}

                                {detectedMac && (
                                    <div className="p-3 bg-white rounded-xl border-2 border-purple-400 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={18} className="text-purple-600 shrink-0" />
                                            <div>
                                                <p className="text-xs text-gray-500">MAC Address Terdeteksi:</p>
                                                <p className="text-sm font-bold font-mono text-purple-900">{detectedMac}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <button
                                                type="button"
                                                onClick={handleApplyDetectedMac}
                                                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition"
                                            >
                                                <Check size={14} />
                                                Gunakan MAC Ini
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDetectedMac(null)}
                                                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Serial Number Perangkat
                                </label>
                                <input
                                    type="text"
                                    name="contract_device_serial"
                                    value={formData.contract_device_serial}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Serial router/ONU/perangkat"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tambah Foto Lain (Opsional)
                                </label>
                                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
                                    <input
                                        id="contract_installation_photos"
                                        type="file"
                                        name="contract_installation_photos"
                                        accept="image/*"
                                        multiple
                                        onChange={handleFileChange}
                                        className="sr-only"
                                    />
                                    <label
                                        htmlFor="contract_installation_photos"
                                        className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                                    >
                                        <Upload size={16} className="mr-2" />
                                        Pilih Foto Instalasi
                                    </label>
                                    <span className="ml-3 text-sm text-gray-600">
                                        {contractPhotoNames.length > 0
                                            ? `${contractPhotoNames.length} file dipilih`
                                            : 'Tidak perlu jika foto sudah ada di Google Sheets'}
                                    </span>
                                    {contractPhotoNames.length > 0 && (
                                        <div className="mt-3 space-y-1">
                                            {contractPhotoNames.slice(0, 4).map((file, index) => (
                                                <p key={`${file.name}-${index}`} className="truncate text-xs text-gray-600">
                                                    • {file.name}
                                                </p>
                                            ))}
                                            {contractPhotoNames.length > 4 && (
                                                <p className="text-xs text-gray-500">
                                                    +{contractPhotoNames.length - 4} file lainnya
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Opsional. Maksimal 8 foto tambahan, masing-masing 4MB.
                                </p>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Catatan Perangkat
                                </label>
                                <textarea
                                    name="contract_device_notes"
                                    value={formData.contract_device_notes}
                                    onChange={handleChange}
                                    rows={2}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Contoh: ONU dipasang di ruang tamu, adaptor 12V, kabel dropcore 35 meter"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Installation Team & Material Details */}
                    <div>
                        <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                            <input
                                type="checkbox"
                                name="enable_installation_team"
                                checked={formData.enable_installation_team}
                                onChange={handleChange}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Aktifkan Pelaksana Pemasangan</span>
                        </label>

                        {formData.enable_installation_team && (
                            <div className="mt-4">
                                <h2 className="text-xl font-bold text-gray-900 mb-4">Pelaksana Pemasangan</h2>

                                <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                                    Pilih teknisi pelaksana dan detail material instalasi. Saat verifikasi disimpan, data ini otomatis masuk ke payroll proyek pemasangan dan inventori (stok router/kabel berkurang sesuai pemakaian).
                                </div>

                                <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Checklist Pelaksana (Teknisi)
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                                    {payrollMembers.length === 0 ? (
                                        <p className="text-sm text-gray-500">Belum ada data anggota payroll. Tambahkan anggota di menu Payroll terlebih dahulu.</p>
                                    ) : payrollMembers.map((member) => {
                                        const checked = Array.isArray(formData.installer_member_ids)
                                            ? formData.installer_member_ids.includes(Number(member.id))
                                            : false;

                                        return (
                                            <label key={member.id} className="flex items-center gap-2 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => handleInstallerToggle(member.id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                                                />
                                                <span>{member.nama}</span>
                                                {member.telepon && (
                                                    <span className="text-xs text-gray-400">({member.telepon})</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Router dari Stok Inventori
                                    </label>
                                    <select
                                        name="installation_router_item_id"
                                        value={formData.installation_router_item_id}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">Tidak dipilih</option>
                                        {routerStockOptions.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({item.type_name || 'Tanpa jenis'}) - stok {Number(item.current_stock || 0).toLocaleString('id-ID')} {item.unit || ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">Saat verifikasi, stok router ini akan berkurang 1 unit.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Kabel dari Stok Inventori
                                    </label>
                                    <select
                                        name="installation_cable_item_id"
                                        value={formData.installation_cable_item_id}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="">Tidak dipilih</option>
                                        {cableStockOptions.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} ({item.type_name || 'Tanpa jenis'}) - stok {Number(item.current_stock || 0).toLocaleString('id-ID')} {item.unit || ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Habis Kabel
                                    </label>
                                    <input
                                        type="number"
                                        step="any"
                                        min={formData.enable_installation_team ? '0.01' : '0'}
                                        name="installation_cable_used"
                                        value={formData.installation_cable_used}
                                        onChange={handleChange}
                                        required={formData.enable_installation_team}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Contoh: 35"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Wajib diisi saat pemasangan aktif. Stok kabel terpilih otomatis berkurang sesuai angka ini.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Biaya Pasang (Payroll)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        name="installation_labor_fee"
                                        value={formData.installation_labor_fee}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Nilai default diambil dari master data inventori, tetap bisa diubah.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Harga Kabel (Payroll)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        name="installation_cable_rate"
                                        value={formData.installation_cable_rate}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Nilai default diambil dari master data inventori, tetap bisa diubah.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Catatan Pemasangan
                                </label>
                                <textarea
                                    name="installation_notes"
                                    value={formData.installation_notes}
                                    onChange={handleChange}
                                    rows={2}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Catatan tambahan instalasi"
                                />
                            </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status */}
                    <div>
                        <label className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                name="is_active"
                                checked={formData.is_active}
                                onChange={handleChange}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Pelanggan Aktif</span>
                        </label>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-6 border-t">
                        <Button
                            variant="secondary"
                            onClick={() => navigate('/customer-verification')}
                            disabled={submitting}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            disabled={submitting}
                        >
                            {submitting ? (
                                <>
                                    <Loader className="inline mr-2 animate-spin" size={18} />
                                    Memverifikasi...
                                </>
                            ) : (
                                'Verifikasi & Simpan'
                            )}
                        </Button>
                    </div>
                </form>

                <Modal
                    isOpen={installationPaymentModal.open}
                    onClose={closeInstallationPaymentFlow}
                    title="Konfirmasi Biaya Pemasangan"
                    theme="dashboard"
                    size="lg"
                >
                    <div className="space-y-4 text-slate-100">
                        <p className="text-sm text-slate-300">
                            Biaya pemasangan akan dicatat ke mutasi dengan alur penerima pembayaran yang sama seperti konfirmasi penagihan.
                        </p>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                            <p className="text-sm text-slate-300">Nominal biaya pemasangan</p>
                            <p className="mt-2 text-2xl font-bold text-amber-300">
                                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(formData.installation_fee || 0))}
                            </p>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-slate-200">Terima via</label>
                            <select
                                className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"
                                value={paymentReceiptOptionId}
                                onChange={(e) => setPaymentReceiptOptionId(e.target.value)}
                            >
                                <option value="">Pilih metode</option>
                                {paymentReceiptOptions.map((option) => (
                                    <option key={option.id} value={option.id}>{option.name}</option>
                                ))}
                            </select>
                        </div>
                        {canChoosePaymentReceiver && (
                            <div>
                                <label className="mb-2 block text-sm font-medium text-slate-200">Akun penerima pembayaran</label>
                                <select
                                    className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"
                                    value={paymentReceiverUserId}
                                    onChange={(e) => setPaymentReceiverUserId(e.target.value)}
                                    disabled={loadingPaymentReceivers}
                                >
                                    <option value="">{loadingPaymentReceivers ? 'Memuat penerima...' : 'Akun saya (default)'}</option>
                                    {paymentReceivers.map((receiver) => (
                                        <option key={receiver.id} value={receiver.id}>
                                            {getPaymentReceiverLabel(receiver)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm text-cyan-50">
                            Jika akun penerima bukan diri sendiri, sistem bisa meminta approval akun penerima atau langsung memasukkan biaya pemasangan ke hutang sesuai keputusan Anda.
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button type="button" variant="secondary" onClick={closeInstallationPaymentFlow}>
                                Batal
                            </Button>
                            <Button type="button" variant="primary" disabled={submitting} onClick={() => performVerification()}>
                                {submitting ? 'Memproses...' : 'Lanjutkan Verifikasi'}
                            </Button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={otherReceiverModal.open}
                    onClose={() => setOtherReceiverModal({ open: false, selectedReceiver: null })}
                    title="Konfirmasi Akun Penerima"
                    theme="dashboard"
                >
                    <div className="space-y-4 text-slate-100">
                        <p className="text-sm text-slate-300">
                            Anda memilih akun penerima selain akun Anda sendiri. Pilih apakah mutasi biaya pemasangan menunggu konfirmasi akun penerima atau langsung dimasukkan ke hutang.
                        </p>
                        {otherReceiverModal.selectedReceiver?.is_company_finance_receiver && (
                            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-50">
                                Akun yang dipilih adalah akun keuangan perusahaan. Jika akun ini menyetujui, mutasi biaya pemasangan akan menjadi confirmed tanpa membuat hutang.
                            </div>
                        )}
                        <div className="flex gap-3 justify-end">
                            <Button type="button" variant="secondary" onClick={() => setOtherReceiverModal({ open: false, selectedReceiver: null })}>
                                Batal
                            </Button>
                            <Button
                                type="button"
                                variant="warning"
                                disabled={submitting}
                                onClick={async () => {
                                    setOtherReceiverModal({ open: false, selectedReceiver: null });
                                    await performVerification({
                                        otherReceiverConfirmed: true,
                                        receiverConflictResolution: 'approval',
                                    });
                                }}
                            >
                                {submitting ? 'Memproses...' : 'Tunggu Konfirmasi Penerima'}
                            </Button>
                            <Button
                                type="button"
                                variant="danger"
                                disabled={submitting}
                                onClick={async () => {
                                    setOtherReceiverModal({ open: false, selectedReceiver: null });
                                    await performVerification({
                                        otherReceiverConfirmed: true,
                                        receiverConflictResolution: 'debt',
                                    });
                                }}
                            >
                                {submitting ? 'Memproses...' : 'Masukkan ke Hutang'}
                            </Button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={receiverConflictModal.open}
                    onClose={() => setReceiverConflictModal({ open: false, message: '' })}
                    title="Akun Penerima Tidak Diizinkan"
                    theme="dashboard"
                >
                    <div className="space-y-4 text-slate-100">
                        <p className="text-sm text-slate-300">
                            {receiverConflictModal.message || 'Akun penerima yang dipilih tidak termasuk mapping yang diizinkan.'}
                        </p>
                        <div className="flex gap-3 justify-end">
                            <Button type="button" variant="secondary" onClick={() => setReceiverConflictModal({ open: false, message: '' })}>
                                Batal
                            </Button>
                            <Button
                                type="button"
                                variant="warning"
                                disabled={submitting}
                                onClick={async () => {
                                    setReceiverConflictModal({ open: false, message: '' });
                                    await performVerification({
                                        otherReceiverConfirmed: true,
                                        receiverConflictResolution: 'approval',
                                    });
                                }}
                            >
                                {submitting ? 'Memproses...' : 'Jangan Masuk Hutang'}
                            </Button>
                            <Button
                                type="button"
                                variant="danger"
                                disabled={submitting}
                                onClick={async () => {
                                    setReceiverConflictModal({ open: false, message: '' });
                                    await performVerification({
                                        otherReceiverConfirmed: true,
                                        receiverConflictResolution: 'debt',
                                    });
                                }}
                            >
                                {submitting ? 'Memproses...' : 'Masukkan ke Hutang'}
                            </Button>
                        </div>
                    </div>
                </Modal>

                {/* Secret Info Modal */}
                {showSecretModal && secretInfo && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Verifikasi Berhasil!</h3>
                                    <p className="text-sm text-gray-500">PPPoE user telah dibuat</p>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 space-y-3 mb-4">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Username PPPoE</p>
                                    <p className="text-lg font-mono font-bold text-gray-900">{secretInfo.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Password</p>
                                    <p className="text-lg font-mono font-bold text-gray-900">{secretInfo.password}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Profile/Paket</p>
                                    <p className="text-sm font-medium text-gray-900">{secretInfo.profile}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">IP Address</p>
                                    <p className="text-sm font-mono font-medium text-gray-900">{secretInfo.remote_address}</p>
                                </div>
                            </div>

                            {agreementInfo && (
                                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                                    <p className="text-xs text-emerald-700 mb-1">Kontrak Pelanggan</p>
                                    <p className="text-sm font-semibold text-emerald-900">{agreementInfo.agreement_number}</p>
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                        <a
                                            href={agreementInfo.download_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                                        >
                                            Download PDF
                                        </a>
                                        <a
                                            href={agreementInfo.verify_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                        >
                                            Verifikasi QR
                                        </a>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowSecretModal(false);
                                        navigate('/customer-verification');
                                    }}
                                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                >
                                    Tutup & Lanjutkan
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showErrorModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                            <h3 className="text-xl font-bold text-red-700 mb-2">Verifikasi Gagal</h3>
                            <p className="text-sm text-gray-700 mb-4">
                                {errorModalMessage || 'Terjadi kesalahan saat verifikasi pelanggan.'}
                            </p>
                            <button
                                onClick={() => setShowErrorModal(false)}
                                className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium"
                                type="button"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default CustomerVerificationForm;
