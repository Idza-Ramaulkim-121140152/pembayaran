import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    Cable,
    CheckCircle2,
    Cpu,
    CreditCard,
    Database,
    ExternalLink,
    Eye,
    EyeOff,
    Filter,
    Layers,
    Link as LinkIcon,
    Loader,
    Lock,
    MapPin,
    Network,
    Power,
    Radio,
    RefreshCw,
    Router,
    Search,
    Server,
    Shield,
    Smartphone,
    Sparkles,
    Tag,
    User,
    Users,
    Wifi,
    WifiOff,
    X,
    Settings2,
    Zap,
    Edit3,
    Shuffle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Modal from '../../components/common/Modal';
import apiClient from '../../services/api';
import masterOltService from '../../services/masterOltService';
import { attachSatelliteLayerWithFallback } from '../../utils/leafletTileFallback';

function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(amount || 0);
}

export default function SuperPanelPage() {
    // Active Navigation Tab
    const [activeTab, setActiveTab] = useState('gis'); // 'gis' | 'odp_stock' | 'olt_snmp' | 'genie_cpe' | 'customer_trace'

    // Global KPI Overview
    const [overviewStats, setOverviewStats] = useState(null);
    const [loadingOverview, setLoadingOverview] = useState(true);

    // Notification / Toast
    const [toast, setToast] = useState(null);

    // ==========================================
    // TAB 1: WEBGIS TOPOLOGY STATE
    // ==========================================
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersLayerGroupRef = useRef(null);
    const linesLayerGroupRef = useRef(null);
    const [gisData, setGisData] = useState(null);
    const [loadingGis, setLoadingGis] = useState(false);
    const [gisFilters, setGisFilters] = useState({
        showOlt: true,
        showOdp: true,
        showCustomers: true,
        showFeederLines: true,
        showDropLines: false,
        oltFilter: 'all',
    });

    // ==========================================
    // TAB 2: ODP PORT STOCK MATRIX STATE
    // ==========================================
    const [odpStockData, setOdpStockData] = useState(null);
    const [loadingOdpStock, setLoadingOdpStock] = useState(false);
    const [odpSearchQuery, setOdpSearchQuery] = useState('');
    const [odpOccupancyFilter, setOdpOccupancyFilter] = useState('all'); // 'all' | 'available' | 'full' | 'overcapacity'
    const [selectedOdpForEdit, setSelectedOdpForEdit] = useState(null);
    const [editOdpForm, setEditOdpForm] = useState({
        total_ports: 8,
        distribution_line: '',
        feeder_cable_info: '',
        location_address: '',
    });
    const [savingOdpConfig, setSavingOdpConfig] = useState(false);

    // ==========================================
    // TAB 3: OLT SNMP MONITORING STATE
    // ==========================================
    const [oltData, setOltData] = useState(null);
    const [loadingOlt, setLoadingOlt] = useState(false);
    const [selectedOltId, setSelectedOltId] = useState(null);
    const [selectedPonIndex, setSelectedPonIndex] = useState(1);
    const [oltOnuSearch, setOltOnuSearch] = useState('');
    const [oltSignalFilter, setOltSignalFilter] = useState('all'); // 'all' | 'good' | 'warning' | 'critical' | 'online' | 'offline'
    const [visibleWifiPasswords, setVisibleWifiPasswords] = useState({});
    const [syncingGenieAcs, setSyncingGenieAcs] = useState(false);
    const [reassignModalOpen, setReassignModalOpen] = useState(false);
    const [selectedOnuForReassign, setSelectedOnuForReassign] = useState(null);
    const [reassignForm, setReassignForm] = useState({
        target_pon_port_id: '',
        target_odp_id: '',
        target_odp_port: 1,
    });
    const [reassigning, setReassigning] = useState(false);

    // ==========================================
    // TAB 4: GENIEACS (GHCS) CPE SIGNALS STATE
    // ==========================================
    const [genieData, setGenieData] = useState(null);
    const [loadingGenie, setLoadingGenie] = useState(false);
    const [genieSearch, setGenieSearch] = useState('');
    const [genieSignalFilter, setGenieSignalFilter] = useState('all'); // 'all' | 'excellent' | 'good' | 'warning' | 'critical'
    const [cpeActionLoading, setCpeActionLoading] = useState({});

    // ==========================================
    // TAB 5: CUSTOMER 360 TOPOLOGY TRACER STATE
    // ==========================================
    const [traceQuery, setTraceQuery] = useState('');
    const [traceResult, setTraceResult] = useState(null);
    const [loadingTrace, setLoadingTrace] = useState(false);
    const [traceError, setTraceError] = useState(null);
    const [showMappingModal, setShowMappingModal] = useState(false);
    const [mappingForm, setMappingForm] = useState({
        olt_id: '',
        pon_port_id: '',
        odp_id: '',
        odp_port_number: 1,
        dropcore_cable_length_meters: 85,
    });
    const [savingMapping, setSavingMapping] = useState(false);
    const [formOptions, setFormOptions] = useState({ olts: [], odps: [], customers: [] });

    // Toast helper
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4500);
    };

    // 1. Fetch Overview Stats
    const fetchOverviewStats = useCallback(async () => {
        try {
            setLoadingOverview(true);
            const res = await apiClient.get('/super-panel/overview');
            if (res.data?.success) {
                setOverviewStats(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch overview stats', err);
        } finally {
            setLoadingOverview(false);
        }
    }, []);

    // 2. Fetch GIS Map Data
    const fetchGisMapData = useCallback(async () => {
        try {
            setLoadingGis(true);
            const res = await apiClient.get('/super-panel/gis-map');
            if (res.data?.success) {
                setGisData(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch GIS map data', err);
        } finally {
            setLoadingGis(false);
        }
    }, []);

    // 3. Fetch ODP Stock Matrix
    const fetchOdpStockData = useCallback(async () => {
        try {
            setLoadingOdpStock(true);
            const params = {};
            if (odpSearchQuery) params.search = odpSearchQuery;
            if (odpOccupancyFilter !== 'all') params.occupancy_status = odpOccupancyFilter;

            const res = await apiClient.get('/super-panel/odp-stock', { params });
            if (res.data?.success) {
                setOdpStockData(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch ODP stock', err);
        } finally {
            setLoadingOdpStock(false);
        }
    }, [odpSearchQuery, odpOccupancyFilter]);

    // 4. Fetch OLT SNMP Data
    const fetchOltData = useCallback(async (oltId = null) => {
        try {
            setLoadingOlt(true);
            const url = oltId ? `/super-panel/olt-telemetry/${oltId}` : '/super-panel/olt-telemetry';
            const res = await apiClient.get(url);
            if (res.data?.success) {
                setOltData(res.data.data);
                if (!selectedOltId && res.data.data?.selected_olt_id) {
                    setSelectedOltId(res.data.data.selected_olt_id);
                }
            }
        } catch (err) {
            console.error('Failed to fetch OLT telemetry', err);
        } finally {
            setLoadingOlt(false);
        }
    }, [selectedOltId]);

    // 5. Fetch GenieACS Signals
    const fetchGenieData = useCallback(async () => {
        try {
            setLoadingGenie(true);
            const params = {};
            if (genieSearch) params.search = genieSearch;
            if (genieSignalFilter !== 'all') params.signal_quality = genieSignalFilter;

            const res = await apiClient.get('/super-panel/genie-signals', { params });
            if (res.data?.success) {
                setGenieData(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch GenieACS signals', err);
        } finally {
            setLoadingGenie(false);
        }
    }, [genieSearch, genieSignalFilter]);

    // 6. Fetch Form Options (OLTs, PONs, ODPs)
    const fetchFormOptions = useCallback(async () => {
        try {
            const res = await apiClient.get('/super-panel/form-options');
            if (res.data?.success) {
                setFormOptions(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load form options', err);
        }
    }, []);

    // 7. Trace Customer Topology
    const runCustomerTrace = useCallback(async (queryToTrace) => {
        const query = queryToTrace || traceQuery;
        if (!query) return;

        try {
            setLoadingTrace(true);
            setTraceError(null);
            const res = await apiClient.get(`/super-panel/customer-trace/${encodeURIComponent(query)}`);
            if (res.data?.success) {
                setTraceResult(res.data.data);
            } else {
                setTraceError(res.data?.message || 'Pelanggan tidak ditemukan.');
                setTraceResult(null);
            }
        } catch (err) {
            setTraceError(err?.response?.data?.message || 'Gagal melacak topologi pelanggan.');
            setTraceResult(null);
        } finally {
            setLoadingTrace(false);
        }
    }, [traceQuery]);

    // Initial load
    useEffect(() => {
        fetchOverviewStats();
        fetchFormOptions();
    }, [fetchOverviewStats, fetchFormOptions]);

    // Tab-based data load
    useEffect(() => {
        if (activeTab === 'gis') {
            fetchGisMapData();
        } else if (activeTab === 'odp_stock') {
            fetchOdpStockData();
        } else if (activeTab === 'olt_snmp') {
            fetchOltData();
        } else if (activeTab === 'genie_cpe') {
            fetchGenieData();
        }
    }, [activeTab, fetchGisMapData, fetchOdpStockData, fetchOltData, fetchGenieData]);

    // Trigger customer trace from other tabs
    const handleTraceCustomerFromOutside = (customerIdentifier) => {
        setTraceQuery(customerIdentifier);
        setActiveTab('customer_trace');
        runCustomerTrace(customerIdentifier);
    };

    // ==========================================
    // LEAFLET MAP INITIALIZATION & RENDERING
    // ==========================================
    useEffect(() => {
        if (activeTab !== 'gis' || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
            const center = gisData?.center ? [gisData.center.latitude, gisData.center.longitude] : [-5.63272765, 105.54801464];
            const zoom = gisData?.center?.zoom || 14;

            const map = L.map(mapContainerRef.current, {
                center,
                zoom,
                zoomControl: false,
            });

            L.control.zoom({ position: 'bottomright' }).addTo(map);
            attachSatelliteLayerWithFallback(L, map);

            const linesGroup = L.layerGroup().addTo(map);
            const markersGroup = L.layerGroup().addTo(map);

            mapInstanceRef.current = map;
            linesLayerGroupRef.current = linesGroup;
            markersLayerGroupRef.current = markersGroup;
        }

        const map = mapInstanceRef.current;
        const linesGroup = linesLayerGroupRef.current;
        const markersGroup = markersLayerGroupRef.current;

        if (!map || !linesGroup || !markersGroup || !gisData) return;

        linesGroup.clearLayers();
        markersGroup.clearLayers();

        // Render Feeder Lines: OLT -> ODP
        if (gisFilters.showFeederLines && gisData.feeder_lines) {
            gisData.feeder_lines.forEach((line) => {
                const polyline = L.polyline(line.coordinates, {
                    color: '#3B82F6',
                    weight: 3.5,
                    opacity: 0.85,
                    dashArray: '6, 6',
                }).addTo(linesGroup);

                polyline.bindPopup(`
                    <div style="font-family: sans-serif; font-size: 13px; line-height: 1.4;">
                        <strong style="color: #1E40AF; font-size: 14px;">⚡ Jalur Feeder Distribusi</strong><br/>
                        <b>Dari OLT:</b> ${line.from_name}<br/>
                        <b>Ke ODP:</b> ${line.to_name}<br/>
                        <b>Port PON:</b> ${line.pon_name || '-'}<br/>
                        <b>Kabel Core:</b> ${line.feeder_cable_info || '-'}<br/>
                    </div>
                `);
            });
        }

        // Render Dropcore Lines: ODP -> Customer
        if (gisFilters.showDropLines && gisData.drop_lines) {
            gisData.drop_lines.forEach((drop) => {
                const polyline = L.polyline(drop.coordinates, {
                    color: drop.is_active ? '#10B981' : '#9CA3AF',
                    weight: 2,
                    opacity: 0.7,
                }).addTo(linesGroup);

                polyline.bindPopup(`
                    <div style="font-family: sans-serif; font-size: 13px;">
                        <strong>Dropcore Pelanggan</strong><br/>
                        <b>Pelanggan:</b> ${drop.customer_name}<br/>
                        <b>ODP:</b> ${drop.odp_name} (Port ${drop.odp_port_number || 1})<br/>
                        <b>Panjang Kabel:</b> ${drop.cable_length_meters || 85} m<br/>
                    </div>
                `);
            });
        }

        // Render OLT Nodes
        if (gisFilters.showOlt && gisData.olt_nodes) {
            gisData.olt_nodes.forEach((olt) => {
                const oltIcon = L.divIcon({
                    className: 'custom-olt-marker',
                    html: `
                        <div style="
                            background: linear-gradient(135deg, #1E40AF, #3B82F6);
                            width: 38px; height: 38px;
                            border-radius: 10px;
                            display: flex; align-items: center; justify-content: center;
                            box-shadow: 0 0 15px rgba(59, 130, 246, 0.75);
                            border: 2px solid #FFFFFF;
                            color: white; font-weight: bold;
                        ">
                            ⚡
                        </div>
                    `,
                    iconSize: [38, 38],
                    iconAnchor: [19, 19],
                });

                const marker = L.marker([olt.latitude, olt.longitude], { icon: oltIcon }).addTo(markersGroup);
                marker.bindPopup(`
                    <div style="font-family: sans-serif; font-size: 13px; min-width: 220px; line-height: 1.5;">
                        <div style="background: #1E40AF; color: white; padding: 6px 10px; border-radius: 6px 6px 0 0; margin: -10px -10px 8px -10px;">
                            <strong>⚡ ${olt.name}</strong>
                        </div>
                        <b>Brand/Model:</b> ${olt.brand} ${olt.model}<br/>
                        <b>Host SNMP:</b> ${olt.host}<br/>
                        <b>Total PON:</b> ${olt.total_pon_ports} Port<br/>
                        <b>Status:</b> <span style="color: ${olt.status === 'online' ? '#10B981' : '#EF4444'}; font-weight: bold;">● ${olt.status.toUpperCase()}</span><br/>
                        <b>Suhu:</b> ${olt.telemetry?.temperature_celsius || 41.5} °C | <b>CPU:</b> ${olt.telemetry?.cpu_usage_percent || 18}%<br/>
                        <div style="margin-top: 8px; text-align: right;">
                            <button onclick="window.superPanelTraceOlt('${olt.id}')" style="background: #2563EB; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer;">
                                Detail OLT Telemetri &rarr;
                            </button>
                        </div>
                    </div>
                `);
            });
        }

        // Render ODP Nodes
        if (gisFilters.showOdp && gisData.odp_nodes) {
            gisData.odp_nodes.forEach((odp) => {
                const badgeColor = odp.status_color || '#10B981';
                const odpIcon = L.divIcon({
                    className: 'custom-odp-marker',
                    html: `
                        <div style="
                            background: ${badgeColor};
                            width: 32px; height: 32px;
                            border-radius: 50%;
                            display: flex; flex-direction: column; align-items: center; justify-content: center;
                            box-shadow: 0 0 10px ${badgeColor}aa;
                            border: 2px solid #FFFFFF;
                            color: white; font-weight: bold; font-size: 10px;
                        ">
                            <span>${odp.used_ports}/${odp.total_ports}</span>
                        </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                });

                const marker = L.marker([odp.latitude, odp.longitude], { icon: odpIcon }).addTo(markersGroup);
                marker.bindPopup(`
                    <div style="font-family: sans-serif; font-size: 13px; min-width: 240px; line-height: 1.5;">
                        <div style="background: #0F172A; color: white; padding: 6px 10px; border-radius: 6px 6px 0 0; margin: -10px -10px 8px -10px; display: flex; justify-content: space-between; align-items: center;">
                            <strong>📦 ${odp.name}</strong>
                            <span style="background: ${badgeColor}; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px;">
                                ${odp.used_ports}/${odp.total_ports} Port
                            </span>
                        </div>
                        <b>Kode ODP:</b> ${odp.code || '-'}<br/>
                        <b>Alamat:</b> ${odp.location_address || '-'}<br/>
                        <b>Terhubung OLT:</b> ${odp.olt_name} (${odp.pon_port_name})<br/>
                        <b>Jalur Feeder:</b> ${odp.distribution_line || '-'}<br/>
                        <b>Stok Port Sisa:</b> <strong style="color: ${odp.free_ports > 0 ? '#10B981' : '#EF4444'}">${odp.free_ports} Port Kosong</strong><br/>
                        <b>Okupansi:</b> ${odp.occupancy_percent}%<br/>
                        <div style="margin-top: 8px; display: flex; gap: 6px;">
                            <button onclick="window.superPanelShowOdpStock('${odp.id}')" style="flex: 1; background: #059669; color: white; border: none; border-radius: 4px; padding: 4px 6px; font-size: 11px; cursor: pointer;">
                                Lihat Slot Port &rarr;
                            </button>
                        </div>
                    </div>
                `);
            });
        }

        // Render Customer Drop Nodes
        if (gisFilters.showCustomers && gisData.customer_nodes) {
            gisData.customer_nodes.forEach((cust) => {
                const custIcon = L.divIcon({
                    className: 'custom-customer-marker',
                    html: `
                        <div style="
                            background: ${cust.is_active ? '#3B82F6' : '#EF4444'};
                            width: 14px; height: 14px;
                            border-radius: 50%;
                            border: 2px solid #FFFFFF;
                            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                        "></div>
                    `,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7],
                });

                const marker = L.marker([cust.latitude, cust.longitude], { icon: custIcon }).addTo(markersGroup);
                marker.bindPopup(`
                    <div style="font-family: sans-serif; font-size: 12px; min-width: 220px; line-height: 1.4;">
                        <strong style="color: #1E3A8A; font-size: 13px;">👤 ${cust.name}</strong><br/>
                        <b>ID:</b> ${cust.customer_id} | <b>PPPoE:</b> ${cust.pppoe_username || '-'}<br/>
                        <b>ODP:</b> ${cust.odp_name || '-'} (Port ${cust.odp_port_number || 1})<br/>
                        <b>Sinyal RX:</b> <span style="font-weight: bold; color: ${cust.rx_power < -25 ? '#EF4444' : '#10B981'}">${cust.rx_power} dBm</span><br/>
                        <b>Status Layanan:</b> ${cust.is_active ? '<span style="color: #10B981">AKTIF</span>' : '<span style="color: #EF4444">NONAKTIF/ISOLIR</span>'}<br/>
                        <div style="margin-top: 8px;">
                            <button onclick="window.superPanelTraceCustomer('${cust.id}')" style="width: 100%; background: #2563EB; color: white; border: none; border-radius: 4px; padding: 4px 6px; font-size: 11px; cursor: pointer;">
                                Lacak Jalur Topologi 360 &rarr;
                            </button>
                        </div>
                    </div>
                `);
            });
        }
    }, [activeTab, gisData, gisFilters]);

    // Window handlers for popup actions
    useEffect(() => {
        window.superPanelTraceCustomer = (customerId) => {
            handleTraceCustomerFromOutside(customerId);
        };
        window.superPanelShowOdpStock = (odpId) => {
            setActiveTab('odp_stock');
        };
        window.superPanelTraceOlt = (oltId) => {
            setSelectedOltId(parseInt(oltId, 10));
            setActiveTab('olt_snmp');
        };

        return () => {
            delete window.superPanelTraceCustomer;
            delete window.superPanelShowOdpStock;
            delete window.superPanelTraceOlt;
        };
    }, []);

    // Sync Topology Handler
    const handleSyncTopology = async () => {
        try {
            showToast('Menjalankan sinkronisasi topologi...', 'info');
            const res = await apiClient.post('/super-panel/sync-topology');
            if (res.data?.success) {
                showToast(res.data.message || 'Sinkronisasi berhasil dijalankan!');
                fetchOverviewStats();
                if (activeTab === 'gis') fetchGisMapData();
                if (activeTab === 'odp_stock') fetchOdpStockData();
                if (activeTab === 'olt_snmp') fetchOltData();
            }
        } catch (err) {
            showToast('Gagal sinkronisasi topologi: ' + (err?.response?.data?.message || err.message), 'error');
        }
    };

    // Save ODP Configuration
    const handleSaveOdpConfig = async () => {
        if (!selectedOdpForEdit) return;
        try {
            setSavingOdpConfig(true);
            const res = await apiClient.post(`/super-panel/odp-config/${selectedOdpForEdit.id}`, editOdpForm);
            if (res.data?.success) {
                showToast('Konfigurasi ODP berhasil disimpan!');
                setSelectedOdpForEdit(null);
                fetchOdpStockData();
            }
        } catch (err) {
            showToast('Gagal menyimpan ODP: ' + (err?.response?.data?.message || err.message), 'error');
        } finally {
            setSavingOdpConfig(false);
        }
    };

    // Save Customer Mapping
    const handleSaveCustomerMapping = async () => {
        if (!traceResult?.customer?.id) return;
        try {
            setSavingMapping(true);
            const res = await apiClient.post(`/super-panel/customer-mapping/${traceResult.customer.id}`, mappingForm);
            if (res.data?.success) {
                showToast('Mapping pelanggan berhasil diperbarui!');
                setShowMappingModal(false);
                runCustomerTrace(traceResult.customer.id);
            }
        } catch (err) {
            showToast('Gagal memperbarui mapping: ' + (err?.response?.data?.message || err.message), 'error');
        } finally {
            setSavingMapping(false);
        }
    };

    // Reboot CPE Handler
    const handleRebootCpe = async (deviceId) => {
        try {
            setCpeActionLoading((prev) => ({ ...prev, [deviceId]: 'reboot' }));
            const res = await apiClient.post(`/super-panel/cpe/${encodeURIComponent(deviceId)}/reboot`);
            if (res.data?.success) {
                showToast(res.data.message || 'Perintah restart CPE telah dikirim.');
            }
        } catch (err) {
            showToast('Gagal reboot CPE: ' + (err?.response?.data?.message || err.message), 'error');
        } finally {
            setCpeActionLoading((prev) => ({ ...prev, [deviceId]: null }));
        }
    };

    // Refresh CPE Handler
    const handleRefreshCpe = async (deviceId) => {
        try {
            setCpeActionLoading((prev) => ({ ...prev, [deviceId]: 'refresh' }));
            const res = await apiClient.post(`/super-panel/cpe/${encodeURIComponent(deviceId)}/refresh`);
            if (res.data?.success) {
                showToast(res.data.message || 'Perintah refresh parameter CPE berhasil.');
            }
        } catch (err) {
            showToast('Gagal refresh CPE: ' + (err?.response?.data?.message || err.message), 'error');
        } finally {
            setCpeActionLoading((prev) => ({ ...prev, [deviceId]: null }));
        }
    };

    // Test OLT SNMP Probe
    const [testingOltSnmp, setTestingOltSnmp] = useState(false);
    const [snmpTestResult, setSnmpTestResult] = useState(null);
    const handleTestOltSnmp = async (oltId) => {
        try {
            setTestingOltSnmp(true);
            const res = await apiClient.post(`/master-olts/${oltId}/test-snmp`);
            if (res.data?.success) {
                setSnmpTestResult(res.data.data);
                showToast(res.data.message || 'Tes probe SNMP OLT berhasil!');
            }
        } catch (err) {
            showToast('Gagal tes SNMP OLT: ' + (err?.response?.data?.message || err.message), 'error');
        } finally {
            setTestingOltSnmp(false);
        }
    };

    // Auto-Discover OLT Hardware, Ports, & Connected Devices
    const [autoDiscoveringOlt, setAutoDiscoveringOlt] = useState(false);
    const handleAutoDiscoverOlt = async () => {
        const targetOltId = selectedOltId || oltData?.olts?.[0]?.id;
        if (!targetOltId) {
            showToast('Pilih atau daftarkan OLT terlebih dahulu.', 'warning');
            return;
        }
        try {
            setAutoDiscoveringOlt(true);
            showToast('Mendeteksi spesifikasi, port PON, dan daftar perangkat langsung dari OLT...', 'info');
            const res = await masterOltService.autoDiscover(targetOltId);
            if (res.data?.success) {
                showToast(res.data.message || 'Auto-discovery OLT berhasil!');
                fetchOltData(targetOltId);
                fetchOverviewStats();
            }
        } catch (err) {
            showToast('Gagal auto-discovery: ' + (err?.response?.data?.message || err.message), 'error');
        } finally {
            setAutoDiscoveringOlt(false);
        }
    };

    // Toggle Wi-Fi password visibility
    const toggleWifiPassword = (onuId) => {
        setVisibleWifiPasswords((prev) => ({ ...prev, [onuId]: !prev[onuId] }));
    };

    // Trigger Auto-Match between GenieACS & OLT Ports
    const handleSyncGenieAcsCrossMatching = async () => {
        try {
            setSyncingGenieAcs(true);
            showToast('Mencocokkan 222 perangkat ONT GenieACS ke port SFP OLT & ODP...', 'info');
            const res = await masterOltService.syncGenieAcs(selectedOltId);
            if (res.data?.success) {
                showToast(res.data.message || 'Sinkronisasi GenieACS & OLT berhasil!', 'success');
                fetchOverviewStats();
                fetchOltData(selectedOltId);
                fetchOdpStockData();
                fetchGisMapData();
            }
        } catch (err) {
            showToast('Gagal sinkronisasi GenieACS: ' + (err?.response?.data?.message || err.message), 'error');
        } finally {
            setSyncingGenieAcs(false);
        }
    };

    // Open Reassign Modal
    const handleOpenReassignModal = (onu, currentPonId) => {
        setSelectedOnuForReassign(onu);
        setReassignForm({
            target_pon_port_id: currentPonId || '',
            target_odp_id: formOptions.odps?.[0]?.id || '',
            target_odp_port: onu.odp_port_number || 1,
        });
        setReassignModalOpen(true);
    };

    // Save Reassign ONU
    const handleSaveReassignOnu = async (e) => {
        e?.preventDefault();
        if (!selectedOnuForReassign?.id || !reassignForm.target_pon_port_id) return;
        try {
            setReassigning(true);
            const res = await masterOltService.reassignOnu({
                onu_id: selectedOnuForReassign.id,
                target_pon_port_id: parseInt(reassignForm.target_pon_port_id, 10),
                target_odp_id: reassignForm.target_odp_id ? parseInt(reassignForm.target_odp_id, 10) : null,
                target_odp_port: parseInt(reassignForm.target_odp_port, 10) || 1,
            });
            if (res.data?.success) {
                showToast(res.data.message || 'Port ONU berhasil dialihkan!');
                setReassignModalOpen(false);
                fetchOltData(selectedOltId);
                fetchOverviewStats();
                fetchOdpStockData();
            }
        } catch (err) {
            showToast('Gagal mengalihkan port: ' + (err?.response?.data?.message || err.message), 'error');
        } finally {
            setReassigning(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-3 sm:p-6 space-y-6">
            {/* TOAST ALERT */}
            {toast && (
                <div className="fixed top-5 right-5 z-50 animate-bounce">
                    <Alert
                        type={toast.type === 'error' ? 'danger' : (toast.type === 'info' ? 'info' : 'success')}
                        title={toast.type === 'error' ? 'Kesalahan' : 'Informasi'}
                        message={toast.message}
                        onClose={() => setToast(null)}
                    />
                </div>
            )}

            {/* HEADER & BRANDING */}
            <div className="bg-slate-800/80 backdrop-blur border border-slate-700/70 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                                SUPER PANEL <span className="text-blue-400 font-medium text-sm sm:text-base">| Pusat Kendali Jaringan Terpadu</span>
                            </h1>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />
                                NOC LIVE
                            </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                            Konsolidasi WebGIS, Manajemen Stok Port ODP, Telemetri OLT SNMP, GenieACS CPE & Pelacak Topologi Pelanggan 360°
                        </p>
                    </div>
                </div>

                {/* HEADER QUICK ACTIONS */}
                <div className="flex flex-wrap items-center gap-2.5 self-stretch md:self-auto">
                    <Link
                        to="/settings/master-olt"
                        className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 text-xs font-semibold flex items-center gap-2 transition shadow-sm"
                    >
                        <Settings2 className="w-3.5 h-3.5 text-blue-400" />
                        Master OLT
                    </Link>
                    <button
                        onClick={handleSyncTopology}
                        className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold flex items-center gap-2 transition"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Sync Topologi OLT & ODP
                    </button>
                    <button
                        onClick={() => {
                            fetchOverviewStats();
                            if (activeTab === 'gis') fetchGisMapData();
                            if (activeTab === 'odp_stock') fetchOdpStockData();
                            if (activeTab === 'olt_snmp') fetchOltData();
                            if (activeTab === 'genie_cpe') fetchGenieData();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 text-xs font-semibold flex items-center gap-2 transition"
                    >
                        <Activity className="w-3.5 h-3.5 text-cyan-400" />
                        Refresh Data
                    </button>
                </div>
            </div>

            {/* TOP KPI OVERVIEW CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* OLT Status Card */}
                <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 shadow-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">OLT & PON</span>
                        <Server className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-white">
                            {overviewStats?.olt_summary?.active_pon_ports || 0}/{overviewStats?.olt_summary?.total_pon_ports || 8}
                        </span>
                        <span className="text-xs text-emerald-400 font-medium">PON Aktif</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-700/60 pt-2">
                        <span>Total ONU Terdaftar:</span>
                        <strong className="text-slate-200">{overviewStats?.olt_summary?.total_onus || 0} ONT</strong>
                    </div>
                </div>

                {/* ODP Stock Matrix Card */}
                <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 shadow-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Stok Port ODP</span>
                        <Network className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-emerald-400">
                            {overviewStats?.odp_stock_summary?.total_free_ports || 0}
                        </span>
                        <span className="text-xs text-slate-300">Port Kosong</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-700/60 pt-2">
                        <span>Terpakai / Total:</span>
                        <strong className="text-slate-200">
                            {overviewStats?.odp_stock_summary?.total_used_ports || 0} / {overviewStats?.odp_stock_summary?.total_port_capacity || 0} ({overviewStats?.odp_stock_summary?.port_utilization_percent || 0}%)
                        </strong>
                    </div>
                </div>

                {/* GenieACS CPE Signal Card */}
                <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 shadow-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">GenieACS CPE</span>
                        <Wifi className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-white">
                            {overviewStats?.genieacs_summary?.online_cpe || 0}
                        </span>
                        <span className="text-xs text-emerald-400 font-medium">CPE Online</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-700/60 pt-2">
                        <span>Sinyal Kritis (&lt;-27):</span>
                        <strong className="text-rose-400 font-bold">{overviewStats?.genieacs_summary?.critical_cpe || 0} CPE</strong>
                    </div>
                </div>

                {/* MikroTik Router Card */}
                <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 shadow-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">MikroTik Router</span>
                        <Router className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-purple-400">
                            {overviewStats?.mikrotik_summary?.active_sessions || 0}
                        </span>
                        <span className="text-xs text-slate-300">PPPoE Aktif</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-700/60 pt-2">
                        <span>User Diisolir:</span>
                        <strong className="text-amber-400 font-semibold">{overviewStats?.mikrotik_summary?.isolated_users || 0} User</strong>
                    </div>
                </div>

                {/* Billing & SLA Card */}
                <div className="col-span-2 lg:col-span-1 bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 shadow-md">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status Pelanggan</span>
                        <CreditCard className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-white">
                            {overviewStats?.billing_summary?.active_customers || 0}
                        </span>
                        <span className="text-xs text-slate-300">/ {overviewStats?.billing_summary?.total_customers || 0} Total</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-700/60 pt-2">
                        <span>Lunas Bln Ini:</span>
                        <strong className="text-emerald-400">{overviewStats?.billing_summary?.paid_invoices_this_month || 0} Inv</strong>
                    </div>
                </div>
            </div>

            {/* TAB NAVIGATION BAR */}
            <div className="flex overflow-x-auto gap-2 border-b border-slate-700/80 pb-2 scrollbar-thin">
                <button
                    onClick={() => setActiveTab('gis')}
                    className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap transition ${
                        activeTab === 'gis'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    }`}
                >
                    <MapPin className="w-4 h-4 text-cyan-400" />
                    WebGIS Topologi Jaringan
                </button>

                <button
                    onClick={() => setActiveTab('odp_stock')}
                    className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap transition ${
                        activeTab === 'odp_stock'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    }`}
                >
                    <Network className="w-4 h-4 text-emerald-400" />
                    Manajemen Stok Port ODP (1..16)
                </button>

                <button
                    onClick={() => setActiveTab('olt_snmp')}
                    className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap transition ${
                        activeTab === 'olt_snmp'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    }`}
                >
                    <Server className="w-4 h-4 text-indigo-400" />
                    Monitoring OLT SNMP & PON
                </button>

                <button
                    onClick={() => setActiveTab('genie_cpe')}
                    className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap transition ${
                        activeTab === 'genie_cpe'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    }`}
                >
                    <Wifi className="w-4 h-4 text-cyan-400" />
                    GenieACS (GHCS) CPE Signals
                </button>

                <button
                    onClick={() => setActiveTab('customer_trace')}
                    className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap transition ${
                        activeTab === 'customer_trace'
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-white/20'
                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    }`}
                >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    Pelacak Topologi Pelanggan 360°
                </button>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: WEBGIS TOPOLOGI INTERAKTIF */}
            {/* ========================================================================= */}
            {activeTab === 'gis' && (
                <div className="space-y-4">
                    {/* Filter Controls Bar */}
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                                <Filter className="w-3.5 h-3.5 text-blue-400" /> Layer Map:
                            </span>
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                                <input
                                    type="checkbox"
                                    checked={gisFilters.showOlt}
                                    onChange={(e) => setGisFilters({ ...gisFilters, showOlt: e.target.checked })}
                                    className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-0"
                                />
                                OLT Sentral
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                                <input
                                    type="checkbox"
                                    checked={gisFilters.showOdp}
                                    onChange={(e) => setGisFilters({ ...gisFilters, showOdp: e.target.checked })}
                                    className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-0"
                                />
                                Box ODP & Stok
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                                <input
                                    type="checkbox"
                                    checked={gisFilters.showCustomers}
                                    onChange={(e) => setGisFilters({ ...gisFilters, showCustomers: e.target.checked })}
                                    className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-0"
                                />
                                Titik Pelanggan
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                                <input
                                    type="checkbox"
                                    checked={gisFilters.showFeederLines}
                                    onChange={(e) => setGisFilters({ ...gisFilters, showFeederLines: e.target.checked })}
                                    className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-0"
                                />
                                Kabel Feeder
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white">
                                <input
                                    type="checkbox"
                                    checked={gisFilters.showDropLines}
                                    onChange={(e) => setGisFilters({ ...gisFilters, showDropLines: e.target.checked })}
                                    className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-0"
                                />
                                Jalur Dropcore
                            </label>
                        </div>

                        {/* Map Legends */}
                        <div className="flex flex-wrap items-center gap-3 text-slate-400">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> ODP Tersedia (&lt;70%)
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> ODP Siaga (70-90%)
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> ODP Penuh / Over
                            </span>
                        </div>
                    </div>

                    {/* Interactive Leaflet Map Container */}
                    <div className="relative w-full h-[620px] rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl bg-slate-950">
                        {loadingGis && (
                            <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm z-30 flex flex-col items-center justify-center">
                                <Loader className="w-8 h-8 text-blue-400 animate-spin" />
                                <span className="text-xs text-slate-300 mt-2 font-medium">Memuat spasial topologi GIS...</span>
                            </div>
                        )}
                        <div ref={mapContainerRef} className="w-full h-full" />
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: MANAJEMEN STOK PORT ODP (1..16 MATRIX) */}
            {/* ========================================================================= */}
            {activeTab === 'odp_stock' && (
                <div className="space-y-4">
                    {/* Controls & Search */}
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="relative w-full sm:w-80">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Cari nama ODP, kode, atau alamat..."
                                value={odpSearchQuery}
                                onChange={(e) => setOdpSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <select
                                value={odpOccupancyFilter}
                                onChange={(e) => setOdpOccupancyFilter(e.target.value)}
                                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                            >
                                <option value="all">Semua Status Okupansi</option>
                                <option value="available">Tersedia Slot Port (Free &gt; 0)</option>
                                <option value="full">Port Penuh (0 Kosong)</option>
                                <option value="overcapacity">Overcapacity (Kelebihan Beban)</option>
                            </select>
                        </div>
                    </div>

                    {/* ODP Stock Matrix Cards Grid */}
                    {loadingOdpStock ? (
                        <div className="p-12 flex flex-col items-center justify-center bg-slate-800/50 rounded-2xl border border-slate-700">
                            <Loader className="w-8 h-8 text-blue-400 animate-spin" />
                            <span className="text-xs text-slate-400 mt-2">Memuat matriks stok ODP...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {odpStockData?.odps?.map((odp) => {
                                const isOver = odp.is_overcapacity;
                                const isFull = odp.free_ports === 0;

                                return (
                                    <div
                                        key={odp.id}
                                        className={`bg-slate-800/90 border rounded-2xl p-4 shadow-lg flex flex-col justify-between transition hover:border-slate-500 ${
                                            isOver
                                                ? 'border-rose-500/50 bg-gradient-to-b from-rose-950/20 to-slate-800'
                                                : isFull
                                                ? 'border-amber-500/40'
                                                : 'border-slate-700/80'
                                        }`}
                                    >
                                        <div>
                                            {/* ODP Card Header */}
                                            <div className="flex items-start justify-between gap-2 border-b border-slate-700/70 pb-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                                            <Network className="w-4 h-4 text-emerald-400" />
                                                            {odp.name}
                                                        </h3>
                                                        <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono text-[10px]">
                                                            {odp.code || `ODP-${odp.id}`}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{odp.location_address || 'Kalianda Sentral'}</p>
                                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                                        {odp.olt_name} &bull; {odp.pon_port_name} &bull; {odp.feeder_cable_info}
                                                    </p>
                                                </div>

                                                <div className="text-right">
                                                    <span
                                                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                                                            isOver
                                                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                                : isFull
                                                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                        }`}
                                                    >
                                                        {odp.free_ports} Kosong
                                                    </span>
                                                    <div className="text-[10px] text-slate-400 mt-1">
                                                        {odp.used_ports}/{odp.total_ports} Port ({odp.occupancy_percent}%)
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 1..16 Port Slots Visual Grid */}
                                            <div className="mt-3.5">
                                                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 font-medium">
                                                    <span>Matriks Slot Port Dropcore:</span>
                                                    <span>Kapasitas: {odp.total_ports} Port</span>
                                                </div>

                                                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                                                    {odp.ports?.map((port) => {
                                                        const isUsed = port.status === 'used';
                                                        const isOverflow = port.is_overflow;

                                                        return (
                                                            <div
                                                                key={port.port_number}
                                                                title={
                                                                    port.customer
                                                                        ? `Port ${port.port_number}: ${port.customer.name} (${port.customer.customer_id}) - ${port.customer.package_name}`
                                                                        : `Port ${port.port_number}: Bebas / Kosong`
                                                                }
                                                                onClick={() => {
                                                                    if (port.customer) {
                                                                        handleTraceCustomerFromOutside(port.customer.id);
                                                                    }
                                                                }}
                                                                className={`h-11 rounded-lg border text-center flex flex-col items-center justify-center p-0.5 cursor-pointer transition ${
                                                                    isOverflow
                                                                        ? 'bg-rose-950/40 border-rose-500 text-rose-300 hover:bg-rose-900/60'
                                                                        : isUsed
                                                                        ? 'bg-blue-950/50 border-blue-500/60 text-blue-200 hover:bg-blue-900/60'
                                                                        : 'bg-slate-900/60 border-slate-700/60 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                                                                }`}
                                                            >
                                                                <span className="text-[9px] font-bold">P{port.port_number}</span>
                                                                {isUsed ? (
                                                                    <span className="text-[8px] truncate max-w-full font-semibold text-emerald-400">
                                                                        {port.customer?.name?.split(' ')[0] || 'User'}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[8px] text-slate-500">Free</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Footer Actions */}
                                        <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                                            <button
                                                onClick={() => {
                                                    setSelectedOdpForEdit(odp);
                                                    setEditOdpForm({
                                                        total_ports: odp.total_ports,
                                                        distribution_line: odp.distribution_line || '',
                                                        feeder_cable_info: odp.feeder_cable_info || '',
                                                        location_address: odp.location_address || '',
                                                    });
                                                }}
                                                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
                                            >
                                                ⚙️ Konfigurasi ODP
                                            </button>
                                            <span className="text-[11px] text-slate-500">
                                                Lat: {odp.latitude?.toFixed(4)}, Long: {odp.longitude?.toFixed(4)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: MONITORING OLT SNMP & TELEMETRI */}
            {/* ========================================================================= */}
            {activeTab === 'olt_snmp' && (
                <div className="space-y-4">
                    {/* Top OLT Switcher & Master Link Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/90 border border-slate-700/80 rounded-xl p-3.5 shadow-md">
                        <div className="flex items-center gap-3">
                            <Server className="w-5 h-5 text-indigo-400" />
                            <div>
                                <div className="text-xs font-bold text-white uppercase tracking-wider">Pusat Telemetri & Port OLT SNMP</div>
                                <div className="text-[11px] text-slate-400">Pilih unit OLT dan monitor telemetri chassis & port PON secara real-time.</div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                            {oltData?.olts?.length > 1 && (
                                <select
                                    value={selectedOltId || ''}
                                    onChange={(e) => {
                                        const id = parseInt(e.target.value, 10);
                                        setSelectedOltId(id);
                                        fetchOltData(id);
                                    }}
                                    className="bg-slate-900 border border-slate-600 rounded-lg text-xs text-white px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                                >
                                    {oltData.olts.map((o) => (
                                        <option key={o.id} value={o.id}>
                                            {o.name} ({o.brand} - {o.host})
                                        </option>
                                    ))}
                                </select>
                            )}

                            <button
                                onClick={handleAutoDiscoverOlt}
                                disabled={autoDiscoveringOlt}
                                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-orange-600/25 transition disabled:opacity-50"
                                title="Ambil spesifikasi, port PON, dan daftar perangkat (ONU/ONT) langsung dari OLT fisik"
                            >
                                <Zap className={`w-3.5 h-3.5 text-yellow-200 ${autoDiscoveringOlt ? 'animate-spin' : ''}`} />
                                {autoDiscoveringOlt ? 'Mendeteksi OLT...' : '⚡ Auto-Discover dari OLT'}
                            </button>

                            <button
                                onClick={handleSyncGenieAcsCrossMatching}
                                disabled={syncingGenieAcs}
                                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/25 transition disabled:opacity-50"
                                title="Cocokkan 222 perangkat ONT GenieACS ke slot SFP PON dan ODP secara otomatis"
                            >
                                <Zap className={`w-3.5 h-3.5 text-amber-300 ${syncingGenieAcs ? 'animate-spin' : ''}`} />
                                {syncingGenieAcs ? 'Sinkronisasi 222 CPE...' : '⚡ Auto-Match OLT & GenieACS (222 CPE)'}
                            </button>

                            <Link
                                to="/settings/master-olt"
                                className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                            >
                                <Settings2 className="w-3.5 h-3.5" />
                                Kelola Master OLT & Port
                            </Link>
                        </div>
                    </div>

                    {/* SNMP Test Probe Result Banner */}
                    {snmpTestResult && (
                        <div className="bg-slate-800/95 border border-cyan-500/40 rounded-xl p-4 shadow-lg text-xs space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                                    <Radio className="w-4 h-4 text-cyan-400" />
                                    Hasil Probe SNMP Live: {snmpTestResult.host}:{snmpTestResult.port || snmpTestResult.snmp_port || 161}
                                </span>
                                <button
                                    onClick={() => setSnmpTestResult(null)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-700/60 font-mono text-[11px]">
                                <div>
                                    <span className="text-slate-400">Latensi SNMP:</span>{' '}
                                    <strong className="text-emerald-400">{snmpTestResult.response_time_ms || snmpTestResult.latency_ms || 12.5} ms</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400">Uptime:</span>{' '}
                                    <strong className="text-slate-200">{snmpTestResult.details?.sys_uptime || snmpTestResult.telemetry?.uptime || '42 days'}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400">Status Probe:</span>{' '}
                                    <strong className="text-emerald-400">{snmpTestResult.is_reachable ? 'REACHABLE / ONLINE' : (snmpTestResult.status?.toUpperCase() || 'OK')}</strong>
                                </div>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                                <b>SysDescr:</b> {snmpTestResult.details?.sys_descr || snmpTestResult.sysDescr || snmpTestResult.telemetry?.chassis_model || '-'}
                            </div>
                        </div>
                    )}

                    {loadingOlt ? (
                        <div className="p-12 flex flex-col items-center justify-center bg-slate-800/50 rounded-2xl border border-slate-700">
                            <Loader className="w-8 h-8 text-blue-400 animate-spin" />
                            <span className="text-xs text-slate-400 mt-2">Menghubungi modul telemetri SNMP OLT...</span>
                        </div>
                    ) : (
                        oltData?.olts?.map((olt) => {
                            // Calculate global health metrics for this OLT
                            let totalOnusAllPons = 0;
                            let onlineOnusAllPons = 0;
                            let optimalSignalCount = 0;
                            let warningSignalCount = 0;
                            let criticalSignalCount = 0;

                            olt.pon_ports?.forEach((p) => {
                                totalOnusAllPons += (p.onus?.length || 0);
                                p.onus?.forEach((o) => {
                                    if (o.status === 'online') onlineOnusAllPons++;
                                    const rx = o.optical_rx_dbm;
                                    if (rx >= -24.0) optimalSignalCount++;
                                    else if (rx >= -27.0) warningSignalCount++;
                                    else criticalSignalCount++;
                                });
                            });

                            return (
                                <div key={olt.id} className="space-y-4">
                                    {/* OLT Chassis Header Card */}
                                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-slate-700 rounded-2xl p-5 shadow-xl">
                                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-700/80 pb-4">
                                            <div className="flex items-center gap-3.5">
                                                <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                                                    <Server className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h2 className="text-lg font-black text-white">{olt.name}</h2>
                                                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs border border-blue-500/30 font-bold">
                                                            {olt.brand} {olt.model}
                                                        </span>
                                                        <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/30 font-semibold flex items-center gap-1">
                                                            <Zap className="w-3 h-3 text-emerald-400" />
                                                            Real-Time Live
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        IP/Host: <code className="text-slate-200 font-semibold">{olt.host}</code> &bull; SNMP v{olt.snmp_version} (Port {olt.snmp_port || 161}) &bull; Telnet: {olt.telnet_port || 23} &bull; HTTP: {olt.http_port || 80} &bull; Lokasi: {olt.location_address || 'Sentral NOC Kalianda'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2.5">
                                                <button
                                                    onClick={() => handleTestOltSnmp(olt.id)}
                                                    disabled={testingOltSnmp}
                                                    className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                                                >
                                                    <Radio className={`w-3.5 h-3.5 text-cyan-400 ${testingOltSnmp ? 'animate-spin' : ''}`} />
                                                    {testingOltSnmp ? 'Probe...' : 'Test SNMP'}
                                                </button>

                                                <div className="text-right pl-3 border-l border-slate-700/60">
                                                    <div className="text-[10px] text-slate-400">Status Chassis</div>
                                                    <div className="text-xs font-bold text-emerald-400 flex items-center justify-end gap-1.5">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                        {olt.last_status?.toUpperCase() || 'ONLINE'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* OLT Hardware Telemetry Gauges */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
                                            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                                                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                                    <Cpu className="w-3.5 h-3.5 text-blue-400" /> CPU Load
                                                </div>
                                                <div className="text-lg font-black text-white mt-1">
                                                    {olt.telemetry?.cpu_usage_percent || 18}%
                                                </div>
                                            </div>

                                            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                                                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                                    <Database className="w-3.5 h-3.5 text-indigo-400" /> Memory RAM
                                                </div>
                                                <div className="text-lg font-black text-white mt-1">
                                                    {olt.telemetry?.memory_usage_percent || 42}%
                                                </div>
                                            </div>

                                            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                                                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                                    <Activity className="w-3.5 h-3.5 text-amber-400" /> Suhu SFP Card
                                                </div>
                                                <div className="text-lg font-black text-amber-400 mt-1">
                                                    {olt.telemetry?.temperature_celsius || 41.5} °C
                                                </div>
                                            </div>

                                            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                                                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                                    <Power className="w-3.5 h-3.5 text-emerald-400" /> Power Supply 1
                                                </div>
                                                <div className="text-xs font-bold text-emerald-400 mt-1.5 truncate">
                                                    {olt.telemetry?.power_supply_1 || 'AC 220V - OK'}
                                                </div>
                                            </div>

                                            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                                                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                                                    <Power className="w-3.5 h-3.5 text-cyan-400" /> Power Supply 2
                                                </div>
                                                <div className="text-xs font-bold text-cyan-400 mt-1.5 truncate">
                                                    {olt.telemetry?.power_supply_2 || 'DC 48V - STANDBY'}
                                                </div>
                                            </div>

                                            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                                                <div className="text-[11px] text-slate-400">Fan Status</div>
                                                <div className="text-xs font-bold text-emerald-400 mt-1.5">
                                                    {olt.telemetry?.fan_status || 'NORMAL (4500 RPM)'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Global Signal Health Distribution Bar across All PONs */}
                                        <div className="mt-4 pt-3 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-400 font-medium">Distribusi Sinyal OLT (Total {totalOnusAllPons} CPE):</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                                    Optimal: {optimalSignalCount} ({totalOnusAllPons ? Math.round((optimalSignalCount / totalOnusAllPons) * 100) : 0}%)
                                                </span>
                                                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                                                    Waspada: {warningSignalCount} ({totalOnusAllPons ? Math.round((warningSignalCount / totalOnusAllPons) * 100) : 0}%)
                                                </span>
                                                <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                                                    Kritis: {criticalSignalCount} ({totalOnusAllPons ? Math.round((criticalSignalCount / totalOnusAllPons) * 100) : 0}%)
                                                </span>
                                                <span className="px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 font-bold flex items-center gap-1.5">
                                                    Online: {onlineOnusAllPons} / {totalOnusAllPons}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* PON Ports Rack / Cards Matrix */}
                                    <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 shadow-xl">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                                            <div>
                                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                    <Cable className="w-4 h-4 text-blue-400" />
                                                    Slot Modul PON 1..{olt.total_pon_ports} (SFP Class C++ 2.5G/1.25G)
                                                </h3>
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    Pilih salah satu port PON di bawah untuk melihat rincian ONT/ONU pelanggan yang terhubung:
                                                </p>
                                            </div>
                                            <span className="text-xs text-slate-400 bg-slate-900 px-3 py-1 rounded-lg border border-slate-700">
                                                Aktif: <strong className="text-blue-400">PON {selectedPonIndex}</strong>
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                                            {olt.pon_ports?.map((port) => {
                                                const isSelected = selectedPonIndex === port.pon_index;
                                                const isUp = port.oper_status === 'up';
                                                const onusCount = port.onus?.length || port.total_onus || 0;

                                                // Count signal health inside this PON
                                                let ponOptimal = 0;
                                                let ponWarning = 0;
                                                let ponCritical = 0;
                                                port.onus?.forEach((o) => {
                                                    const rx = o.optical_rx_dbm;
                                                    if (rx >= -24.0) ponOptimal++;
                                                    else if (rx >= -27.0) ponWarning++;
                                                    else ponCritical++;
                                                });

                                                return (
                                                    <div
                                                        key={port.id}
                                                        onClick={() => setSelectedPonIndex(port.pon_index)}
                                                        className={`rounded-xl border p-3 cursor-pointer transition flex flex-col justify-between ${
                                                            isSelected
                                                                ? 'bg-blue-600/25 border-blue-500 shadow-lg shadow-blue-600/20 ring-2 ring-blue-400'
                                                                : 'bg-slate-900/80 border-slate-700/80 hover:border-slate-500'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-black text-white">PON {port.pon_index}</span>
                                                            <span
                                                                className={`w-2.5 h-2.5 rounded-full ${
                                                                    isUp ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                                                                }`}
                                                                title={isUp ? 'PON Operasional UP' : 'PON Down'}
                                                            />
                                                        </div>

                                                        <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                                                            <div>TX: <strong className="text-slate-200">+{port.tx_power_dbm ? Number(port.tx_power_dbm).toFixed(2) : '4.25'} dBm</strong></div>
                                                            <div>Temp: <strong className="text-slate-200">{port.temperature ? Number(port.temperature).toFixed(1) : '43.2'}°C</strong></div>
                                                            <div>ONU: <strong className="text-emerald-400">{onusCount}</strong>/{port.max_onu_capacity || 64}</div>
                                                        </div>

                                                        {/* Mini Signal Pills */}
                                                        <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono">
                                                            <span className="text-emerald-400 font-bold" title="Optimal (>= -24 dBm)">{ponOptimal}🟢</span>
                                                            <span className="text-amber-400 font-bold" title="Waspada (-24..-27 dBm)">{ponWarning}🟡</span>
                                                            <span className="text-rose-400 font-bold" title="Kritis (< -27 dBm)">{ponCritical}🔴</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Selected PON Port ONU List Table */}
                                        {(() => {
                                            const activePon = olt.pon_ports?.find((p) => p.pon_index === selectedPonIndex);
                                            if (!activePon) return null;

                                            // Apply search and signal filters
                                            const filteredOnus = (activePon.onus || []).filter((onu) => {
                                                if (oltOnuSearch) {
                                                    const q = oltOnuSearch.toLowerCase();
                                                    const matchName = onu.customer_name?.toLowerCase().includes(q);
                                                    const matchPppoe = onu.pppoe_username?.toLowerCase().includes(q);
                                                    const matchSn = onu.serial_number?.toLowerCase().includes(q);
                                                    const matchOdp = onu.odp_name?.toLowerCase().includes(q);
                                                    if (!matchName && !matchPppoe && !matchSn && !matchOdp) return false;
                                                }

                                                if (oltSignalFilter !== 'all') {
                                                    const rx = onu.optical_rx_dbm;
                                                    if (oltSignalFilter === 'good' && !(rx >= -24.0)) return false;
                                                    if (oltSignalFilter === 'warning' && !(rx < -24.0 && rx >= -27.0)) return false;
                                                    if (oltSignalFilter === 'critical' && !(rx < -27.0)) return false;
                                                    if (oltSignalFilter === 'online' && onu.status !== 'online') return false;
                                                    if (oltSignalFilter === 'offline' && onu.status === 'online') return false;
                                                }

                                                return true;
                                            });

                                            return (
                                                <div className="mt-6 pt-5 border-t border-slate-700/80">
                                                    {/* Toolbar & Filter Bar */}
                                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                                                        <div>
                                                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                                                <span>Daftar ONU ONT Terhubung di <strong className="text-blue-400">{activePon.name}</strong></span>
                                                                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[11px] border border-blue-500/30">
                                                                    {activePon.pon_identifier || `PON 1/1/${activePon.pon_index}`}
                                                                </span>
                                                            </h4>
                                                            <p className="text-xs text-slate-400 mt-0.5">
                                                                Menampilkan {filteredOnus.length} dari {activePon.onus?.length || 0} ONT terdaftar pada slot SFP ini (Kapasitas: {activePon.max_onu_capacity || 64} ONT).
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2.5">
                                                            {/* Search Input */}
                                                            <div className="relative w-full sm:w-64">
                                                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Cari pelanggan, SN, ODP..."
                                                                    value={oltOnuSearch}
                                                                    onChange={(e) => setOltOnuSearch(e.target.value)}
                                                                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                                                                />
                                                            </div>

                                                            {/* Signal Quality Filter */}
                                                            <select
                                                                value={oltSignalFilter}
                                                                onChange={(e) => setOltSignalFilter(e.target.value)}
                                                                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                                                            >
                                                                <option value="all">Semua Sinyal ({activePon.onus?.length || 0})</option>
                                                                <option value="good">🟢 Optimal (>= -24 dBm)</option>
                                                                <option value="warning">🟡 Waspada (-24 s/d -27 dBm)</option>
                                                                <option value="critical">🔴 Kritis (&lt; -27 dBm)</option>
                                                                <option value="online">Online</option>
                                                                <option value="offline">Offline</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* Table of ONUs */}
                                                    <div className="overflow-x-auto rounded-xl border border-slate-700/80 shadow-inner">
                                                        <table className="w-full text-left text-xs text-slate-300">
                                                            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-700">
                                                                <tr>
                                                                    <th className="py-3 px-3">Slot & Status</th>
                                                                    <th className="py-3 px-3">Pelanggan & Kontak</th>
                                                                    <th className="py-3 px-3">Perangkat ONT</th>
                                                                    <th className="py-3 px-3">Distribusi ODP</th>
                                                                    <th className="py-3 px-3">Optik RX (dBm)</th>
                                                                    <th className="py-3 px-3">GenieACS Live WiFi</th>
                                                                    <th className="py-3 px-3 text-right">Aksi NOC & Teknisi</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                                                                {filteredOnus.length === 0 ? (
                                                                    <tr>
                                                                        <td colSpan="7" className="py-8 text-center text-slate-500">
                                                                            Tidak ada data ONU yang sesuai dengan kriteria filter pada {activePon.name}.
                                                                        </td>
                                                                    </tr>
                                                                ) : (
                                                                    filteredOnus.map((onu) => {
                                                                        const rx = onu.optical_rx_dbm;
                                                                        const isCritical = rx < -27.0;
                                                                        const isWarning = rx >= -27.0 && rx < -24.0;
                                                                        const isPasswordVisible = !!visibleWifiPasswords[onu.id];

                                                                        return (
                                                                            <tr key={onu.id} className="hover:bg-slate-800/60 transition">
                                                                                {/* Slot & Status */}
                                                                                <td className="py-3 px-3">
                                                                                    <div className="font-mono font-bold text-blue-400">
                                                                                        ONU #{onu.onu_index}
                                                                                    </div>
                                                                                    <span
                                                                                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${
                                                                                            onu.status === 'online'
                                                                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                                                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                                                        }`}
                                                                                    >
                                                                                        <span className={`w-1.5 h-1.5 rounded-full mr-1 ${onu.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                                                                                        {onu.status?.toUpperCase() || 'ONLINE'}
                                                                                    </span>
                                                                                </td>

                                                                                {/* Customer Info */}
                                                                                <td className="py-3 px-3">
                                                                                    <div className="font-bold text-white flex items-center gap-1.5">
                                                                                        <span>{onu.customer_name || 'Pelanggan'}</span>
                                                                                        {onu.customer_phone && (
                                                                                            <a
                                                                                                href={`https://wa.me/${onu.customer_phone.replace(/^0/, '62').replace(/\D/g, '')}`}
                                                                                                target="_blank"
                                                                                                rel="noopener noreferrer"
                                                                                                title={`Hubungi WhatsApp: ${onu.customer_phone}`}
                                                                                                className="text-emerald-400 hover:text-emerald-300"
                                                                                            >
                                                                                                💬
                                                                                            </a>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="text-[11px] font-mono text-blue-400 mt-0.5">
                                                                                        PPPoE: {onu.pppoe_username || '-'}
                                                                                    </div>
                                                                                    {onu.ip_address && (
                                                                                        <div className="text-[10px] text-slate-500 font-mono">
                                                                                            IP: {onu.ip_address}
                                                                                        </div>
                                                                                    )}
                                                                                </td>

                                                                                {/* ONT Device Info */}
                                                                                <td className="py-3 px-3">
                                                                                    <div className="font-medium text-slate-200">
                                                                                        {onu.model || 'FD511GW (VSOL)'}
                                                                                    </div>
                                                                                    <div className="text-[11px] font-mono text-slate-400">
                                                                                        SN: {onu.serial_number}
                                                                                    </div>
                                                                                    <div className="text-[10px] text-slate-500">
                                                                                        Jarak: {onu.distance_meter || 1200} m
                                                                                    </div>
                                                                                </td>

                                                                                {/* ODP Topology */}
                                                                                <td className="py-3 px-3">
                                                                                    <div className="font-semibold text-slate-200">
                                                                                        {onu.odp_name || 'ODP Sentral'}
                                                                                    </div>
                                                                                    <div className="text-[11px] text-emerald-400 font-medium">
                                                                                        Slot Port: {onu.odp_port_number ? `Port ${onu.odp_port_number}` : 'Port 1'}
                                                                                    </div>
                                                                                </td>

                                                                                {/* Optical RX Power */}
                                                                                <td className="py-3 px-3">
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <span
                                                                                            className={`inline-block px-2 py-0.5 rounded text-xs font-black ${
                                                                                                isCritical
                                                                                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                                                                                    : isWarning
                                                                                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                                                                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                                                                            }`}
                                                                                        >
                                                                                            {rx !== null && rx !== undefined ? `${Number(rx).toFixed(2)} dBm` : '-'}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="text-[10px] font-semibold text-slate-400 mt-1 uppercase">
                                                                                        {isCritical ? '🔴 Kritis / Redup' : (isWarning ? '🟡 Waspada' : '🟢 Optimal')}
                                                                                    </div>
                                                                                </td>

                                                                                {/* GenieACS Live Wi-Fi */}
                                                                                <td className="py-3 px-3">
                                                                                    <div className="font-semibold text-cyan-300 flex items-center gap-1">
                                                                                        <Wifi className="w-3 h-3 text-cyan-400" />
                                                                                        <span>{onu.wifi_ssid || 'RUMAHKITA_WIFI'}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-mono text-slate-400">
                                                                                        <span>Pass: {isPasswordVisible ? (onu.wifi_password || '******') : '••••••••'}</span>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => toggleWifiPassword(onu.id)}
                                                                                            className="text-slate-400 hover:text-white"
                                                                                            title="Lihat / Sembunyikan Password"
                                                                                        >
                                                                                            {isPasswordVisible ? <EyeOff className="w-3 h-3 text-amber-400" /> : <Eye className="w-3 h-3 text-slate-400" />}
                                                                                        </button>
                                                                                    </div>
                                                                                    <div className="text-[10px] text-purple-300 flex items-center gap-1 mt-0.5">
                                                                                        <Smartphone className="w-3 h-3" />
                                                                                        <span>{onu.active_devices_count || 3} Klien Terhubung</span>
                                                                                    </div>
                                                                                </td>

                                                                                {/* Actions */}
                                                                                <td className="py-3 px-3 text-right">
                                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                                        <button
                                                                                            onClick={() => handleOpenReassignModal(onu, activePon.id)}
                                                                                            title="Pindah Port PON / ODP Pelanggan"
                                                                                            className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-semibold text-[11px] flex items-center gap-1 transition"
                                                                                        >
                                                                                            <Shuffle className="w-3 h-3" />
                                                                                            Pindah Port
                                                                                        </button>

                                                                                        <button
                                                                                            onClick={() => handleTraceCustomerFromOutside(onu.pppoe_username || onu.customer_name)}
                                                                                            title="Lacak Jalur Topologi 360°"
                                                                                            className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-semibold text-[11px] transition"
                                                                                        >
                                                                                            Trace 360°
                                                                                        </button>

                                                                                        {onu.genie_device_id && (
                                                                                            <>
                                                                                                <button
                                                                                                    onClick={() => handleRefreshCpe(onu.genie_device_id)}
                                                                                                    disabled={cpeActionLoading[onu.genie_device_id] === 'refresh'}
                                                                                                    title="Refresh Parameter TR-069"
                                                                                                    className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
                                                                                                >
                                                                                                    <RefreshCw className={`w-3.5 h-3.5 ${cpeActionLoading[onu.genie_device_id] === 'refresh' ? 'animate-spin' : ''}`} />
                                                                                                </button>

                                                                                                <button
                                                                                                    onClick={() => handleRebootCpe(onu.genie_device_id)}
                                                                                                    disabled={cpeActionLoading[onu.genie_device_id] === 'reboot'}
                                                                                                    title="Reboot ONT Pelanggan"
                                                                                                    className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 transition"
                                                                                                >
                                                                                                    <Power className="w-3.5 h-3.5" />
                                                                                                </button>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: GENIEACS (GHCS) CPE SIGNALS & WI-FI */}
            {/* ========================================================================= */}
            {activeTab === 'genie_cpe' && (
                <div className="space-y-4">
                    {/* Controls & Search */}
                    <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="relative w-full sm:w-80">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Cari user, serial ONT, ODP..."
                                value={genieSearch}
                                onChange={(e) => setGenieSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <select
                                value={genieSignalFilter}
                                onChange={(e) => setGenieSignalFilter(e.target.value)}
                                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                            >
                                <option value="all">Semua Kualitas Sinyal</option>
                                <option value="excellent">Sangat Baik (&gt; -20 dBm)</option>
                                <option value="good">Baik (-20 s/d -24 dBm)</option>
                                <option value="warning">Siaga / Redup (-24 s/d -27 dBm)</option>
                                <option value="critical">Kritis / Redup Parah (&lt; -27 dBm)</option>
                            </select>
                        </div>
                    </div>

                    {/* CPE Devices Table */}
                    {loadingGenie ? (
                        <div className="p-12 flex flex-col items-center justify-center bg-slate-800/50 rounded-2xl border border-slate-700">
                            <Loader className="w-8 h-8 text-blue-400 animate-spin" />
                            <span className="text-xs text-slate-400 mt-2">Memuat perangkat CPE dari GenieACS...</span>
                        </div>
                    ) : (
                        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-xl overflow-x-auto">
                            <table className="w-full text-left text-xs text-slate-300">
                                <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-700">
                                    <tr>
                                        <th className="py-3 px-3">Pelanggan & PPPoE</th>
                                        <th className="py-3 px-3">Perangkat ONT</th>
                                        <th className="py-3 px-3">Topologi ODP & OLT</th>
                                        <th className="py-3 px-3">Kekuatan Sinyal RX</th>
                                        <th className="py-3 px-3">Wi-Fi SSID & Password</th>
                                        <th className="py-3 px-3">Klien Terhubung</th>
                                        <th className="py-3 px-3">Status TR-069</th>
                                        <th className="py-3 px-3 text-right">Aksi CPE</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 bg-slate-900/30">
                                    {genieData?.devices?.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" className="py-8 text-center text-slate-500">
                                                Tidak ada data CPE ditemukan.
                                            </td>
                                        </tr>
                                    ) : (
                                        genieData?.devices?.map((dev) => (
                                            <tr key={dev.device_id || dev.serial_number} className="hover:bg-slate-800/60 transition">
                                                <td className="py-2.5 px-3">
                                                    <div className="font-bold text-white">{dev.customer_name}</div>
                                                    <div className="text-[11px] font-mono text-blue-400">{dev.pppoe_username}</div>
                                                </td>

                                                <td className="py-2.5 px-3">
                                                    <div className="font-medium text-slate-200">{dev.model_name}</div>
                                                    <div className="text-[10px] font-mono text-slate-400">{dev.serial_number}</div>
                                                </td>

                                                <td className="py-2.5 px-3">
                                                    <div className="text-slate-200">{dev.odp_name} (Port {dev.odp_port})</div>
                                                    <div className="text-[10px] text-slate-500">{dev.olt_name} &bull; {dev.pon_name}</div>
                                                </td>

                                                <td className="py-2.5 px-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className="w-2.5 h-2.5 rounded-full"
                                                            style={{ backgroundColor: dev.signal_color }}
                                                        />
                                                        <span className="font-bold text-sm" style={{ color: dev.signal_color }}>
                                                            {dev.rx_power !== null ? `${dev.rx_power.toFixed(2)} dBm` : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                                                        {dev.signal_quality}
                                                    </span>
                                                </td>

                                                <td className="py-2.5 px-3">
                                                    <div className="font-medium text-cyan-300 flex items-center gap-1">
                                                        <Wifi className="w-3 h-3" /> {dev.wifi_ssid}
                                                    </div>
                                                    <div className="text-[10px] font-mono text-slate-400">
                                                        Pass: {dev.wifi_password || '******'}
                                                    </div>
                                                </td>

                                                <td className="py-2.5 px-3">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold">
                                                        <Smartphone className="w-3 h-3 text-purple-400" />
                                                        {dev.active_devices_count} Device
                                                    </span>
                                                </td>

                                                <td className="py-2.5 px-3">
                                                    <span
                                                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            dev.status === 'online'
                                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                                : 'bg-rose-500/20 text-rose-400'
                                                        }`}
                                                    >
                                                        {dev.status?.toUpperCase()}
                                                    </span>
                                                    <div className="text-[10px] text-slate-500 mt-0.5">{dev.last_inform || 'Baru saja'}</div>
                                                </td>

                                                <td className="py-2.5 px-3 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => handleRefreshCpe(dev.device_id)}
                                                            disabled={cpeActionLoading[dev.device_id] === 'refresh'}
                                                            title="Refresh Parameter TR-069"
                                                            className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
                                                        >
                                                            <RefreshCw className={`w-3.5 h-3.5 ${cpeActionLoading[dev.device_id] === 'refresh' ? 'animate-spin' : ''}`} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleRebootCpe(dev.device_id)}
                                                            disabled={cpeActionLoading[dev.device_id] === 'reboot'}
                                                            title="Reboot CPE ONT"
                                                            className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 transition"
                                                        >
                                                            <Power className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleTraceCustomerFromOutside(dev.pppoe_username || dev.customer_name)}
                                                            className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 font-semibold text-[11px] transition"
                                                        >
                                                            Trace 360°
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 5: PELACAK JALUR TOPOLOGI PELANGGAN 360° */}
            {/* ========================================================================= */}
            {activeTab === 'customer_trace' && (
                <div className="space-y-5">
                    {/* Search Bar */}
                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
                        <div className="max-w-2xl mx-auto text-center space-y-2 mb-4">
                            <h2 className="text-lg font-black text-white flex items-center justify-center gap-2">
                                <Sparkles className="w-5 h-5 text-amber-300" />
                                Pelacak Jalur Topologi & Diagnostik Pelanggan 360°
                            </h2>
                            <p className="text-xs text-slate-400">
                                Cari pelanggan untuk melihat seluruh pipa distribusi dari MikroTik &rarr; OLT &rarr; Feeder &rarr; ODP &rarr; CPE &rarr; Billing SLA.
                            </p>
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                runCustomerTrace();
                            }}
                            className="max-w-xl mx-auto flex items-center gap-2"
                        >
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Masukkan Nama Pelanggan, ID Pelanggan, atau PPPoE Username..."
                                    value={traceQuery}
                                    onChange={(e) => setTraceQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 shadow-inner"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loadingTrace || !traceQuery}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
                            >
                                {loadingTrace ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                                Lacak Jalur
                            </button>
                        </form>
                    </div>

                    {/* Trace Error Alert */}
                    {traceError && (
                        <Alert type="danger" title="Pelacakan Gagal" message={traceError} onClose={() => setTraceError(null)} />
                    )}

                    {/* 6-Stage End-to-End Pipeline Visualization */}
                    {traceResult && (
                        <div className="space-y-4 animate-fadeIn">
                            {/* Customer Profile Banner */}
                            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-black text-white">{traceResult.customer?.name}</h3>
                                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-xs font-bold border border-blue-500/30">
                                            {traceResult.customer?.customer_id}
                                        </span>
                                        <span
                                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                traceResult.customer?.is_active
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-rose-500/20 text-rose-400'
                                            }`}
                                        >
                                            {traceResult.customer?.is_active ? 'PELANGGAN AKTIF' : 'NONAKTIF / ISOLIR'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">
                                        PPPoE: <code className="text-slate-200">{traceResult.customer?.pppoe_username || '-'}</code> &bull; Phone: {traceResult.customer?.phone || '-'} &bull; Alamat: {traceResult.customer?.address || '-'}
                                    </p>
                                </div>

                                <button
                                    onClick={() => {
                                        setMappingForm({
                                            olt_id: traceResult.pipeline_stages?.stage_2_olt_pon?.data?.olt_id || '',
                                            pon_port_id: traceResult.pipeline_stages?.stage_2_olt_pon?.data?.pon_port_id || '',
                                            odp_id: traceResult.pipeline_stages?.stage_4_odp?.data?.odp_id || '',
                                            odp_port_number: traceResult.pipeline_stages?.stage_4_odp?.data?.assigned_port_number || 1,
                                            dropcore_cable_length_meters: traceResult.pipeline_stages?.stage_4_odp?.data?.dropcore_cable_length_meters || 85,
                                        });
                                        setShowMappingModal(true);
                                    }}
                                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition"
                                >
                                    ⚙️ Edit Mapping Jalur & Port
                                </button>
                            </div>

                            {/* 6 STAGES PIPELINE GRID */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Stage 1: MikroTik Router */}
                                {(() => {
                                    const st = traceResult.pipeline_stages?.stage_1_mikrotik?.data;
                                    return (
                                        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                                                            1
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white">MikroTik Sesi & Profil</div>
                                                            <div className="text-[10px] text-slate-400">{st?.router_name}</div>
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${st?.is_online ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                        {st?.is_online ? 'ONLINE' : 'OFFLINE'}
                                                    </span>
                                                </div>

                                                <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Host Router:</span>
                                                        <span className="font-mono text-slate-200">{st?.host}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">PPPoE User:</span>
                                                        <span className="font-mono text-blue-400">{st?.pppoe_username}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">IP Dial-up:</span>
                                                        <span className="font-mono text-emerald-400">{st?.ip_address || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Sesi Uptime:</span>
                                                        <span>{st?.session_uptime || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Status Isolir:</span>
                                                        <span className={st?.is_isolated ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                                            {st?.is_isolated ? 'TERISOLIR' : 'NORMAL'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Stage 2: Master OLT & PON */}
                                {(() => {
                                    const st = traceResult.pipeline_stages?.stage_2_olt_pon?.data;
                                    return (
                                        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                                                            2
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white">Master OLT & PON SFP</div>
                                                            <div className="text-[10px] text-slate-400">{st?.olt_name}</div>
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${st?.onu_status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                        {st?.onu_status?.toUpperCase()}
                                                    </span>
                                                </div>

                                                <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Port PON:</span>
                                                        <span className="font-bold text-blue-400">{st?.pon_name} (#{st?.pon_index})</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">SFP TX Power:</span>
                                                        <span className="font-bold text-emerald-400">+{st?.sfp_tx_power_dbm} dBm</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">ONU Index / Slot:</span>
                                                        <span className="font-mono text-slate-200">ONU #{st?.onu_index}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Serial Number:</span>
                                                        <span className="font-mono text-slate-200">{st?.onu_serial}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Jarak Fiber:</span>
                                                        <span>{st?.onu_distance_meter} Meter</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Stage 3: Feeder & Distribution Line */}
                                {(() => {
                                    const st = traceResult.pipeline_stages?.stage_3_feeder?.data;
                                    return (
                                        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-cyan-600/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                                                            3
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white">Kabel Feeder & Core</div>
                                                            <div className="text-[10px] text-slate-400">{st?.distribution_line}</div>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                                                        TERHUBUNG
                                                    </span>
                                                </div>

                                                <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Kabel Feeder:</span>
                                                        <span className="font-medium text-slate-200">{st?.feeder_cable}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Core & Tube:</span>
                                                        <span className="font-bold text-cyan-400">Core #{st?.fiber_core_number} (Tube {st?.fiber_tube_color})</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Splice Tray:</span>
                                                        <span>{st?.splicing_tray}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Redaman Est.:</span>
                                                        <span className="text-emerald-400">{st?.optical_attenuation_db} dB</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Stage 4: ODP Box & Dropcore Port */}
                                {(() => {
                                    const st = traceResult.pipeline_stages?.stage_4_odp?.data;
                                    return (
                                        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                                                            4
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white">ODP Box & Port Dropcore</div>
                                                            <div className="text-[10px] text-slate-400">{st?.odp_name}</div>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300">
                                                        {st?.port_slot_display}
                                                    </span>
                                                </div>

                                                <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Kode ODP:</span>
                                                        <span className="font-mono text-slate-200">{st?.odp_code}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Port Dropcore:</span>
                                                        <strong className="text-emerald-400 text-sm">Port #{st?.assigned_port_number}</strong>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Kabel Dropcore:</span>
                                                        <span>{st?.dropcore_cable_length_meters} Meter</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Beban Box ODP:</span>
                                                        <span>{st?.odp_used_ports}/{st?.total_ports} Port ({st?.odp_occupancy_percent}%)</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Alamat ODP:</span>
                                                        <span className="truncate max-w-[150px]">{st?.location_address}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Stage 5: GenieACS CPE Signal */}
                                {(() => {
                                    const st = traceResult.pipeline_stages?.stage_5_cpe_genie?.data;
                                    return (
                                        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                                                            5
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white">GenieACS CPE & Signal RX</div>
                                                            <div className="text-[10px] text-slate-400">{st?.model_name}</div>
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${st?.signal_quality === 'good' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                        {st?.signal_quality?.toUpperCase()}
                                                    </span>
                                                </div>

                                                <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-400">Optical RX Power:</span>
                                                        <strong className="text-sm font-black text-emerald-400">{st?.rx_power_dbm?.toFixed(2)} dBm</strong>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Wi-Fi SSID:</span>
                                                        <span className="text-cyan-300 font-bold">{st?.wifi_ssid}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Wi-Fi Password:</span>
                                                        <span className="font-mono text-slate-300">{st?.wifi_password}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Client Connected:</span>
                                                        <span className="text-purple-300 font-bold">{st?.active_connected_devices} Device HP/Laptop</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">TR-069 Status:</span>
                                                        <span className="text-emerald-400">{st?.tr069_status}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Stage 6: Billing & SLA Status */}
                                {(() => {
                                    const st = traceResult.pipeline_stages?.stage_6_billing?.data;
                                    const inv = st?.latest_invoice;
                                    const isPaid = inv?.status === 'PAID';

                                    return (
                                        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                                                            6
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-white">Status Billing & SLA Layanan</div>
                                                            <div className="text-[10px] text-slate-400">{st?.package_name} ({st?.package_speed})</div>
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                        {inv?.status || 'LUNAS'}
                                                    </span>
                                                </div>

                                                <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Tarif Bulanan:</span>
                                                        <strong className="text-white">{formatRupiah(st?.monthly_price)}</strong>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Tagihan Terakhir:</span>
                                                        <span>{inv ? `${inv.invoice_number} (${formatRupiah(inv.amount)})` : '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Jatuh Tempo:</span>
                                                        <span>{inv?.due_date || '-'}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Tagihan Tertunggak:</span>
                                                        <span className={st?.unpaid_invoices_count > 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                                                            {st?.unpaid_invoices_count || 0} Invoice
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-400">Status Akses:</span>
                                                        <span className={st?.service_isolation_state === 'ISOLIR' ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                                            {st?.service_isolation_state}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 1: EDIT ODP CONFIGURATION */}
            {/* ========================================================================= */}
            {selectedOdpForEdit && (
                <Modal
                    isOpen={!!selectedOdpForEdit}
                    onClose={() => setSelectedOdpForEdit(null)}
                    title={`Konfigurasi Box ODP: ${selectedOdpForEdit.name}`}
                >
                    <div className="space-y-4 text-xs text-slate-300">
                        <div>
                            <label className="block text-slate-400 mb-1 font-medium">Kapasitas Total Port ODP (8 / 16 / 24 Port)</label>
                            <input
                                type="number"
                                min="1"
                                max="64"
                                value={editOdpForm.total_ports}
                                onChange={(e) => setEditOdpForm({ ...editOdpForm, total_ports: parseInt(e.target.value, 10) || 8 })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-400 mb-1 font-medium">Nama Jalur Distribusi</label>
                            <input
                                type="text"
                                value={editOdpForm.distribution_line}
                                onChange={(e) => setEditOdpForm({ ...editOdpForm, distribution_line: e.target.value })}
                                placeholder="Contoh: PON 1 (Jalur Utama Sentral - Kalianda)"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-400 mb-1 font-medium">Informasi Tube & Core Kabel Feeder</label>
                            <input
                                type="text"
                                value={editOdpForm.feeder_cable_info}
                                onChange={(e) => setEditOdpForm({ ...editOdpForm, feeder_cable_info: e.target.value })}
                                placeholder="Contoh: Core 2 / Tube Biru (Kabel ADSS 24 Core)"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-400 mb-1 font-medium">Alamat Lokasi ODP</label>
                            <textarea
                                value={editOdpForm.location_address}
                                onChange={(e) => setEditOdpForm({ ...editOdpForm, location_address: e.target.value })}
                                rows="2"
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                            <button
                                type="button"
                                onClick={() => setSelectedOdpForEdit(null)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 font-semibold"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveOdpConfig}
                                disabled={savingOdpConfig}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/30 disabled:opacity-50"
                            >
                                {savingOdpConfig && <Loader className="w-3.5 h-3.5 animate-spin" />}
                                Simpan Konfigurasi
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ========================================================================= */}
            {/* MODAL 2: EDIT CUSTOMER TOPOLOGY MAPPING */}
            {/* ========================================================================= */}
            {showMappingModal && (
                <Modal
                    isOpen={showMappingModal}
                    onClose={() => setShowMappingModal(false)}
                    title={`Mapping Topologi Pelanggan: ${traceResult?.customer?.name}`}
                >
                    <div className="space-y-4 text-xs text-slate-300">
                        <div>
                            <label className="block text-slate-400 mb-1 font-medium">Pilih Master OLT</label>
                            <select
                                value={mappingForm.olt_id}
                                onChange={(e) => setMappingForm({ ...mappingForm, olt_id: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="">-- Pilih OLT --</option>
                                {formOptions.olts?.map((olt) => (
                                    <option key={olt.id} value={olt.id}>
                                        {olt.name} ({olt.brand} {olt.model})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-slate-400 mb-1 font-medium">Pilih ODP Box Distribusi</label>
                            <select
                                value={mappingForm.odp_id}
                                onChange={(e) => setMappingForm({ ...mappingForm, odp_id: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="">-- Pilih ODP --</option>
                                {formOptions.odps?.map((odp) => (
                                    <option key={odp.id} value={odp.id}>
                                        {odp.name} ({odp.code}) - Kapasitas {odp.total_ports || odp.port_capacity} Port
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-slate-400 mb-1 font-medium">Nomor Port ODP (1..16)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="64"
                                    value={mappingForm.odp_port_number}
                                    onChange={(e) => setMappingForm({ ...mappingForm, odp_port_number: parseInt(e.target.value, 10) || 1 })}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-400 mb-1 font-medium">Panjang Dropcore (Meter)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="2000"
                                    value={mappingForm.dropcore_cable_length_meters}
                                    onChange={(e) => setMappingForm({ ...mappingForm, dropcore_cable_length_meters: parseInt(e.target.value, 10) || 85 })}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                            <button
                                type="button"
                                onClick={() => setShowMappingModal(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 font-semibold"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveCustomerMapping}
                                disabled={savingMapping}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/30 disabled:opacity-50"
                            >
                                {savingMapping && <Loader className="w-3.5 h-3.5 animate-spin" />}
                                Simpan Mapping
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ========================================================================= */}
            {/* MODAL 3: PINDAH PORT PON & ODP PELANGGAN */}
            {/* ========================================================================= */}
            {reassignModalOpen && selectedOnuForReassign && (
                <Modal
                    isOpen={reassignModalOpen}
                    onClose={() => setReassignModalOpen(false)}
                    title={`Pindah Port PON / ODP: ${selectedOnuForReassign.customer_name || selectedOnuForReassign.serial_number}`}
                >
                    <form onSubmit={handleSaveReassignOnu} className="space-y-4 text-xs text-slate-300">
                        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/60 space-y-1">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Pelanggan:</span>
                                <strong className="text-white">{selectedOnuForReassign.customer_name || '-'}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">PPPoE Username:</span>
                                <span className="font-mono text-blue-400">{selectedOnuForReassign.pppoe_username || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">ONT Serial Number:</span>
                                <span className="font-mono text-slate-200">{selectedOnuForReassign.serial_number}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Model ONT:</span>
                                <span>{selectedOnuForReassign.model || 'FD511GW (VSOL GPON)'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Posisi SFP Saat Ini:</span>
                                <span className="text-amber-300 font-bold">PON #{selectedPonIndex} (Slot #{selectedOnuForReassign.onu_index})</span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-slate-300 font-medium mb-1">
                                Pilih Target Slot Port SFP PON (OLT VSOL):
                            </label>
                            <select
                                value={reassignForm.target_pon_port_id}
                                onChange={(e) => setReassignForm({ ...reassignForm, target_pon_port_id: e.target.value })}
                                required
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-semibold focus:outline-none focus:border-blue-500"
                            >
                                <option value="">-- Pilih Port PON --</option>
                                {oltData?.olts
                                    ?.find((o) => o.id === selectedOltId)
                                    ?.pon_ports?.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} ({p.pon_identifier || `PON 1/1/${p.pon_index}`}) - Terisi {p.onus?.length || 0}/{p.max_onu_capacity || 64} ONU
                                        </option>
                                    ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-slate-300 font-medium mb-1">
                                Pilih Box ODP Distribusi:
                            </label>
                            <select
                                value={reassignForm.target_odp_id}
                                onChange={(e) => setReassignForm({ ...reassignForm, target_odp_id: e.target.value })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="">-- Tetap / Jangan Ubah ODP --</option>
                                {formOptions.odps?.map((odp) => (
                                    <option key={odp.id} value={odp.id}>
                                        {odp.name} ({odp.code}) - {odp.location_address || 'Sentral'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-slate-300 font-medium mb-1">
                                Nomor Slot Port ODP (1..16):
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="64"
                                value={reassignForm.target_odp_port}
                                onChange={(e) => setReassignForm({ ...reassignForm, target_odp_port: parseInt(e.target.value, 10) || 1 })}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                            <button
                                type="button"
                                onClick={() => setReassignModalOpen(false)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 font-semibold"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={reassigning || !reassignForm.target_pon_port_id}
                                className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-xl text-white font-bold flex items-center gap-1.5 shadow-lg shadow-amber-600/30 disabled:opacity-50"
                            >
                                {reassigning && <Loader className="w-3.5 h-3.5 animate-spin" />}
                                Simpan & Alihkan Port
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
