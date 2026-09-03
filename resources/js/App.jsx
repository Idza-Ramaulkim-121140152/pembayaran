import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner';
import Navbar from './components/layouts/Navbar';
import WhatsAppDisconnectedPopup from './components/WhatsAppDisconnectedPopup';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DashboardPredictionPage = lazy(() => import('./pages/DashboardPredictionPage'));
const CustomersPage = lazy(() => import('./pages/Customers/CustomersPage'));
const CustomerForm = lazy(() => import('./pages/Customers/CustomerForm'));
const OdpPage = lazy(() => import('./pages/Odp/OdpPage'));
const OdpMappingPage = lazy(() => import('./pages/Odp/OdpMappingPage'));
const PengeluaranPage = lazy(() => import('./pages/Pengeluaran/PengeluaranPage'));
const ProfilePage = lazy(() => import('./pages/Profile/ProfilePage'));
const BillingPage = lazy(() => import('./pages/Billing/BillingPage'));
const InvoicePage = lazy(() => import('./pages/Invoice/InvoicePage'));
const LoginPage = lazy(() => import('./pages/Auth/LoginPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const PaymentMethodsPage = lazy(() => import('./pages/Settings/PaymentMethodsPage'));
const PaymentReceiptsPage = lazy(() => import('./pages/Settings/PaymentReceiptsPage'));
const ExpenseCategoriesPage = lazy(() => import('./pages/Settings/ExpenseCategoriesPage'));
const BorrowersPage = lazy(() => import('./pages/Settings/BorrowersPage'));
const CompanyFinanceReceiversPage = lazy(() => import('./pages/Settings/CompanyFinanceReceiversPage'));
const PaymentReceiverMappingsPage = lazy(() => import('./pages/Settings/PaymentReceiverMappingsPage'));
const PackageManagementPage = lazy(() => import('./pages/Settings/PackageManagementPage'));
const UserManagementPage = lazy(() => import('./pages/Settings/UserManagementPage'));
const InvoiceManagementPage = lazy(() => import('./pages/Settings/InvoiceManagementPage'));
const PromoManagementPage = lazy(() => import('./pages/Settings/PromoManagementPage'));
const FinancialTargetsPage = lazy(() => import('./pages/Settings/FinancialTargetsPage'));
const CustomerLoginPage = lazy(() => import('./pages/Customer/CustomerLoginPage'));
const CustomerDashboard = lazy(() => import('./pages/Customer/CustomerDashboard'));
const CustomerVerificationPage = lazy(() => import('./pages/Customers/CustomerVerificationPage'));
const CustomerVerificationForm = lazy(() => import('./pages/Customers/CustomerVerificationForm'));
const CustomerRegistrationForm = lazy(() => import('./pages/Customers/CustomerRegistrationForm'));
const CustomerProspectsPage = lazy(() => import('./pages/Customers/CustomerProspectsPage'));
const PublicCustomerRegistrationPage = lazy(() => import('./pages/Public/PublicCustomerRegistrationPage'));
const PromotionPage = lazy(() => import('./pages/Public/PromotionPage'));
const FaqPage = lazy(() => import('./pages/Public/FaqPage'));
const TermsAndConditionsPage = lazy(() => import('./pages/Public/TermsAndConditionsPage'));
const RefundPolicyPage = lazy(() => import('./pages/Public/RefundPolicyPage'));
const ContactPage = lazy(() => import('./pages/Public/ContactPage'));
const ComplaintsPage = lazy(() => import('./pages/Complaints/ComplaintsPage'));
const NetworkNoticePage = lazy(() => import('./pages/Settings/NetworkNoticePage'));
const SendNotificationPage = lazy(() => import('./pages/Settings/SendNotificationPage'));
const MasterWilayahPage = lazy(() => import('./pages/Settings/MasterWilayahPage'));
const MasterMikrotikPage = lazy(() => import('./pages/Settings/MasterMikrotikPage'));
const MasterDataPage = lazy(() => import('./pages/Settings/MasterDataPage'));
const AccessPolicyPage = lazy(() => import('./pages/Settings/AccessPolicyPage'));
const CustomerPackageManagementPage = lazy(() => import('./pages/Settings/CustomerPackageManagementPage'));
const CustomerPackageMigrationPage = lazy(() => import('./pages/Settings/CustomerPackageMigrationPage'));
const CustomerAccountsPage = lazy(() => import('./pages/Settings/CustomerAccountsPage'));
const SystemHealthPage = lazy(() => import('./pages/Settings/SystemHealthPage'));
const SystemActivityLogsPage = lazy(() => import('./pages/Settings/SystemActivityLogsPage'));
const PaymentVerificationPage = lazy(() => import('./pages/Settings/PaymentVerificationPage'));
const NetworkStatusPage = lazy(() => import('./pages/NetworkStatusPage'));
const Monitoring = lazy(() => import('./pages/Monitoring'));
const MonitoringGenieAcsPage = lazy(() => import('./pages/MonitoringGenieAcsPage'));
const CustomerPublicPortalPage = lazy(() => import('./pages/CustomerPublicPortalPage'));
const IsolirPage = lazy(() => import('./pages/Isolir/IsolirPage'));
const MonitoringMaps = lazy(() => import('./pages/MonitoringMaps'));
const PayrollPage = lazy(() => import('./pages/Payroll/PayrollPage'));
const MutasiPage = lazy(() => import('./pages/Finance/MutasiPage'));
const CashObligationCalendarPage = lazy(() => import('./pages/Finance/CashObligationCalendarPage'));
const ReconciliationCenterPage = lazy(() => import('./pages/Finance/ReconciliationCenterPage'));
const ReportsPage = lazy(() => import('./pages/Reports/ReportsPage'));
const DistributionRoutePage = lazy(() => import('./pages/DistributionRoute/DistributionRoutePage'));
const InventoryPage = lazy(() => import('./pages/Inventory/InventoryPage'));
const InventoryMasterPage = lazy(() => import('./pages/Inventory/InventoryMasterPage'));
const InstallationPage = lazy(() => import('./pages/Installation/InstallationPage'));
const IncidentCommandPage = lazy(() => import('./pages/IncidentCommandPage'));
const BorrowerLoansPage = lazy(() => import('./pages/BorrowerLoansPage'));
const PaymentReceiverApprovalPopup = lazy(() => import('./components/PaymentReceiverApprovalPopup'));
import { enhanceMobileTables, setupMobileTableObserver } from './utils/mobileTableEnhancer';

const InstallationPricingPage = lazy(() => import('./pages/Settings/InstallationPricingPage'));
const CustomerIncomeReportPage = lazy(() => import('./pages/Reports/CustomerIncomeReportPage'));
const InstallationReportPage = lazy(() => import('./pages/Reports/InstallationReportPage'));
const InactiveCustomerReportPage = lazy(() => import('./pages/Reports/InactiveCustomerReportPage'));
const ProjectReportPage = lazy(() => import('./pages/Reports/ProjectReportPage'));
const CustomerWifiLinksPage = lazy(() => import('./pages/Settings/CustomerWifiLinksPage'));

const ROUTE_FALLBACK_ROLES = {
    'dashboard.view': ['superadmin', 'admin', 'teknisi', 'finance'],
    'dashboard.prediction.view': ['superadmin', 'admin', 'finance'],
    'report.view': ['superadmin', 'admin', 'finance'],
    'billing.invoice.view': ['superadmin', 'admin', 'finance'],
    'customer.view': ['superadmin', 'admin', 'teknisi'],
    'customer.verification': ['superadmin', 'admin', 'teknisi'],
    'customer.package_audit.view': ['superadmin', 'admin', 'teknisi', 'finance'],
    'customer.package_audit.manage': ['superadmin', 'admin'],
    'customer.package_migration.manage': ['superadmin'],
    'customer.account.manage': ['superadmin'],
    'customer.wifi.manage': ['superadmin', 'admin', 'teknisi'],
    'odp.view': ['superadmin', 'admin', 'teknisi'],
    'odp.mapping.view': ['superadmin', 'admin', 'teknisi'],
    'finance.expense.manage': ['superadmin', 'admin', 'finance'],
    'complaint.view': ['superadmin', 'admin', 'teknisi'],
    'monitoring.view': ['superadmin', 'admin', 'teknisi'],
    'monitoring.maps.view': ['superadmin', 'admin', 'teknisi'],
    'isolir.view': ['superadmin', 'admin', 'teknisi'],
    'payroll.view': ['superadmin', 'admin', 'finance'],
    'inventory.view': ['superadmin', 'admin', 'teknisi', 'finance'],
    'inventory.master.manage': ['superadmin'],
    'finance.mutation.view': ['superadmin', 'admin', 'finance'],
    'installation.view': ['superadmin', 'admin', 'teknisi'],
    'incident.view': ['superadmin', 'admin', 'teknisi'],
    'master.payment.manage': ['superadmin', 'admin', 'finance'],
    'master.expense_category.manage': ['superadmin'],
    'master.package.manage': ['superadmin', 'admin'],
    'user.manage': ['superadmin'],
    'billing.invoice.manage': ['superadmin'],
    'billing.payment_capture.review': ['superadmin', 'admin'],
    'billing.payment_capture.manage': ['superadmin', 'admin'],
    'financial_target.manage': ['superadmin'],
    'master.promo.manage': ['superadmin', 'admin'],
    'master.network_notice.manage': ['superadmin', 'admin', 'teknisi'],
    'master.wilayah.manage': ['superadmin', 'admin'],
    'master.mikrotik.manage': ['superadmin', 'admin'],
    'master.customer_wifi_links.manage': ['superadmin', 'admin'],
    'masterdata.view': ['superadmin', 'admin', 'finance'],
    'access_policy.manage': ['superadmin'],
};

const WA_ALERT_DASHBOARD_PATHS = ['/dashboard', '/dashboard/prediksi'];
const WA_ALERT_ROLES = ['superadmin', 'admin'];

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

function hasRoutePermission(permissionKey) {
    const role = window.appUserRole || 'admin';
    const capabilities = window.appCapabilities;

    if (
        capabilities &&
        permissionKey &&
        Object.prototype.hasOwnProperty.call(capabilities, permissionKey)
    ) {
        return !!capabilities[permissionKey];
    }

    return (ROUTE_FALLBACK_ROLES[permissionKey] || []).includes(role);
}

function GuardedRoute({ permissionKey, element }) {
    if (hasRoutePermission(permissionKey)) {
        return <RouteSuspense>{element}</RouteSuspense>;
    }

    return <Navigate to="/dashboard" replace />;
}

function RouteSuspense({ children }) {
    return (
        <Suspense
            fallback={(
                <div className="app-card p-8 text-center">
                    <LoadingSpinner text="Memuat halaman..." />
                </div>
            )}
        >
            {children}
        </Suspense>
    );
}

// Layout wrapper that conditionally shows navbar
function AppLayout({ children }) {
    const location = useLocation();
    const appContentRef = useRef(null);
    const [waDisconnectedAlert, setWaDisconnectedAlert] = useState({
        path: '',
        visible: false,
        message: '',
    });
    const noNavbarRoutes = [
        '/login',
        '/register',
        '/forgot-password',
        '/',
        '/customer/login',
        '/customer/dashboard',
        '/status-jaringan',
        '/registrasi',
        '/daftar',
        '/promo',
        '/promosi',
        '/faq',
        '/terms-and-conditions',
        '/syarat-ketentuan',
        '/refund-policy',
        '/kebijakan-pengembalian',
        '/kontak',
        '/contact',
        '/privacy-policy',
        '/kebijakan-privasi',
    ];
    const isInvoicePage = location.pathname.startsWith('/invoice/');
    const isCustomerRoute = location.pathname.startsWith('/customer/');
    const isPublicRegistration = location.pathname.startsWith('/registrasi') || location.pathname.startsWith('/daftar');
    const isPublicPortal = location.pathname.startsWith('/portal-pelanggan/') || location.pathname.startsWith('/portal_pelanggan/');
    const isPublicPage = noNavbarRoutes.includes(location.pathname) || isInvoicePage || isCustomerRoute || isPublicRegistration || isPublicPortal;
    const showNavbar = !isPublicPage;
    const shouldCheckWhatsAppConnection = showNavbar
        && WA_ALERT_DASHBOARD_PATHS.includes(location.pathname)
        && WA_ALERT_ROLES.includes(window.appUserRole || '');

    useEffect(() => {
        const root = appContentRef.current;
        if (!root) {
            return undefined;
        }

        const cleanupObserver = setupMobileTableObserver(root);
        enhanceMobileTables(root);

        return () => {
            cleanupObserver?.();
        };
    }, []);

    useEffect(() => {
        const root = appContentRef.current;
        if (!root) {
            return;
        }

        const tick = window.requestAnimationFrame(() => {
            enhanceMobileTables(root);
        });

        return () => window.cancelAnimationFrame(tick);
    }, [location.pathname]);

    useEffect(() => {
        if (!shouldCheckWhatsAppConnection) {
            setWaDisconnectedAlert((previous) => {
                if (!previous.path && !previous.visible && !previous.message) {
                    return previous;
                }

                return { path: '', visible: false, message: '' };
            });
            return undefined;
        }

        const controller = new AbortController();
        const currentPath = location.pathname;

        setWaDisconnectedAlert({ path: currentPath, visible: false, message: '' });

        fetch('/api/whatsapp/status', {
            headers: {
                Accept: 'application/json',
                'X-CSRF-TOKEN': csrfToken(),
            },
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('Status WhatsApp tidak dapat diperiksa.');
                }

                return response.json();
            })
            .then((data) => {
                if (controller.signal.aborted) {
                    return;
                }

                if (!data?.connected) {
                    setWaDisconnectedAlert({
                        path: currentPath,
                        visible: true,
                        message: data?.message || 'WhatsApp tidak terhubung. Pastikan WhatsApp Gateway sudah berjalan dan login.',
                    });
                    return;
                }

                setWaDisconnectedAlert({ path: currentPath, visible: false, message: '' });
            })
            .catch((error) => {
                if (error?.name === 'AbortError') {
                    return;
                }

                setWaDisconnectedAlert({
                    path: currentPath,
                    visible: true,
                    message: 'WhatsApp tidak terhubung. Gateway WhatsApp tidak dapat diakses.',
                });
            });

        return () => controller.abort();
    }, [location.pathname, shouldCheckWhatsAppConnection]);

    const handleCloseWhatsAppAlert = () => {
        setWaDisconnectedAlert((previous) => ({
            ...previous,
            visible: false,
        }));
    };
    
    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden">
            {showNavbar && <Navbar />}
            {showNavbar ? (
                <main ref={appContentRef} className="app-content w-full max-w-none px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 min-w-0 break-words overflow-x-clip">
                    <AppErrorBoundary>
                        <div className="app-page-enter min-w-0">
                            {children}
                        </div>
                    </AppErrorBoundary>
                </main>
            ) : (
                <div ref={appContentRef} className="app-content min-w-0 break-words overflow-x-clip">
                    <AppErrorBoundary>{children}</AppErrorBoundary>
                </div>
            )}
            {waDisconnectedAlert.visible && waDisconnectedAlert.path === location.pathname && (
                <WhatsAppDisconnectedPopup
                    message={waDisconnectedAlert.message}
                    onClose={handleCloseWhatsAppAlert}
                />
            )}
            {window.isAuthenticated && <PaymentReceiverApprovalPopup />}
        </div>
    );
}

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppLayout>
                <Routes>
                    {/* Root domain is private; send visitors to customer login */}
                    <Route path="/" element={<Navigate to="/customer/login" replace />} />
                    
                    {/* Network Status Page (Public) */}
                    <Route path="/status-jaringan" element={<RouteSuspense><NetworkStatusPage /></RouteSuspense>} />
                    
                    {/* Auth Routes */}
                    <Route path="/login" element={<RouteSuspense><LoginPage /></RouteSuspense>} />
                    
                    {/* Dashboard */}
                    <Route path="/dashboard" element={<GuardedRoute permissionKey="dashboard.view" element={<Dashboard />} />} />
                    <Route path="/dashboard/prediksi" element={<GuardedRoute permissionKey="dashboard.prediction.view" element={<DashboardPredictionPage />} />} />
                    <Route path="/laporan" element={<GuardedRoute permissionKey="report.view" element={<ReportsPage />} />} />
                    <Route path="/laporan/income-pelanggan" element={<GuardedRoute permissionKey="report.view" element={<CustomerIncomeReportPage />} />} />
                    <Route path="/laporan/pemasangan" element={<GuardedRoute permissionKey="report.view" element={<InstallationReportPage />} />} />
                    <Route path="/laporan/pelanggan-nonaktif" element={<GuardedRoute permissionKey="report.view" element={<InactiveCustomerReportPage />} />} />
                    <Route path="/laporan/project" element={<GuardedRoute permissionKey="report.view" element={<ProjectReportPage />} />} />
                    
                    {/* Billing/Penagihan */}
                    <Route path="/penagihan" element={<GuardedRoute permissionKey="billing.invoice.view" element={<BillingPage />} />} />
                    <Route path="/billing" element={<GuardedRoute permissionKey="billing.invoice.view" element={<BillingPage />} />} />
                    
                    {/* Public Invoice */}
                    <Route path="/invoice/:invoiceLink" element={<RouteSuspense><InvoicePage /></RouteSuspense>} />
                    
                    {/* Public Customer Self-Service Portal (Tanpa Login) */}
                    <Route path="/portal-pelanggan/:token" element={<RouteSuspense><CustomerPublicPortalPage /></RouteSuspense>} />
                    <Route path="/portal_pelanggan/:token" element={<RouteSuspense><CustomerPublicPortalPage /></RouteSuspense>} />
                    
                    {/* Customers */}
                    <Route path="/customers" element={<GuardedRoute permissionKey="customer.view" element={<CustomersPage />} />} />
                    <Route path="/customers/create" element={<GuardedRoute permissionKey="customer.view" element={<CustomerForm />} />} />
                    <Route path="/customers/:id/edit" element={<GuardedRoute permissionKey="customer.view" element={<CustomerForm />} />} />
                    <Route path="/pelanggan" element={<GuardedRoute permissionKey="customer.view" element={<CustomersPage />} />} />
                    
                    {/* Public Registration (Calon Pelanggan Tanpa Login) */}
                    <Route path="/registrasi" element={<RouteSuspense><PublicCustomerRegistrationPage /></RouteSuspense>} />
                    <Route path="/daftar" element={<RouteSuspense><PublicCustomerRegistrationPage /></RouteSuspense>} />

                    {/* Public Promotion Page (Tanpa Login) */}
                    <Route path="/promo" element={<RouteSuspense><PromotionPage /></RouteSuspense>} />
                    <Route path="/promosi" element={<RouteSuspense><PromotionPage /></RouteSuspense>} />

                    {/* Public Legal & Verification Pages (iPaymu Compliance) */}
                    <Route path="/faq" element={<RouteSuspense><FaqPage /></RouteSuspense>} />
                    <Route path="/terms-and-conditions" element={<RouteSuspense><TermsAndConditionsPage /></RouteSuspense>} />
                    <Route path="/syarat-ketentuan" element={<RouteSuspense><TermsAndConditionsPage /></RouteSuspense>} />
                    <Route path="/refund-policy" element={<RouteSuspense><RefundPolicyPage /></RouteSuspense>} />
                    <Route path="/kebijakan-pengembalian" element={<RouteSuspense><RefundPolicyPage /></RouteSuspense>} />
                    <Route path="/kontak" element={<RouteSuspense><ContactPage /></RouteSuspense>} />
                    <Route path="/contact" element={<RouteSuspense><ContactPage /></RouteSuspense>} />

                    {/* Customer Verification & Prospects */}
                    <Route path="/customer-verification" element={<GuardedRoute permissionKey="customer.verification" element={<CustomerVerificationPage />} />} />
                    <Route path="/customer-verification/register" element={<GuardedRoute permissionKey="customer.verification" element={<CustomerRegistrationForm />} />} />
                    <Route path="/customer-verification/verify/:timestamp" element={<GuardedRoute permissionKey="customer.verification" element={<CustomerVerificationForm />} />} />
                    <Route path="/customer-prospects" element={<GuardedRoute permissionKey="customer.verification" element={<CustomerProspectsPage />} />} />
                    
                    {/* ODP */}
                    <Route path="/odp" element={<GuardedRoute permissionKey="odp.view" element={<OdpPage />} />} />
                    <Route path="/odp-mapping" element={<GuardedRoute permissionKey="odp.mapping.view" element={<OdpMappingPage />} />} />
                    
                    {/* Pengeluaran */}
                    <Route path="/pengeluaran" element={<GuardedRoute permissionKey="finance.expense.manage" element={<PengeluaranPage />} />} />
                    
                    {/* Profile */}
                    <Route path="/profile" element={<RouteSuspense><ProfilePage /></RouteSuspense>} />
                    
                    {/* Settings */}
                    <Route path="/settings/payment-methods" element={<GuardedRoute permissionKey="master.payment.manage" element={<PaymentMethodsPage />} />} />
                    <Route path="/settings/expense-categories" element={<GuardedRoute permissionKey="master.expense_category.manage" element={<ExpenseCategoriesPage />} />} />
                    <Route path="/settings/payment-receipts" element={<GuardedRoute permissionKey="master.payment.manage" element={<PaymentReceiptsPage />} />} />
                    <Route path="/settings/company-finance-receivers" element={<GuardedRoute permissionKey="master.payment.manage" element={<CompanyFinanceReceiversPage />} />} />
                    <Route path="/settings/borrowers" element={<GuardedRoute permissionKey="master.payment.manage" element={<BorrowersPage />} />} />
                    <Route path="/settings/payment-receiver-mappings" element={<GuardedRoute permissionKey="master.payment.manage" element={<PaymentReceiverMappingsPage />} />} />
                    <Route path="/settings/packages" element={<GuardedRoute permissionKey="master.package.manage" element={<PackageManagementPage />} />} />
                    <Route path="/settings/users" element={<GuardedRoute permissionKey="user.manage" element={<UserManagementPage />} />} />
                    <Route path="/settings/invoice-management" element={<GuardedRoute permissionKey="billing.invoice.manage" element={<InvoiceManagementPage />} />} />
                    <Route path="/settings/payment-verification" element={<GuardedRoute permissionKey="billing.payment_capture.review" element={<PaymentVerificationPage />} />} />
                    <Route path="/settings/financial-targets" element={<GuardedRoute permissionKey="financial_target.manage" element={<FinancialTargetsPage />} />} />
                    <Route path="/settings/installation-pricing" element={<GuardedRoute permissionKey="inventory.master.manage" element={<InstallationPricingPage />} />} />
                    <Route path="/settings/promo" element={<GuardedRoute permissionKey="master.promo.manage" element={<PromoManagementPage />} />} />
                    <Route path="/settings/network-notices" element={<GuardedRoute permissionKey="master.network_notice.manage" element={<NetworkNoticePage />} />} />
                    <Route path="/settings/send-notification" element={<GuardedRoute permissionKey="master.network_notice.manage" element={<SendNotificationPage />} />} />
                    <Route path="/settings/master-wilayah" element={<GuardedRoute permissionKey="master.wilayah.manage" element={<MasterWilayahPage />} />} />
                    <Route path="/settings/master-mikrotik" element={<GuardedRoute permissionKey="master.mikrotik.manage" element={<MasterMikrotikPage />} />} />
                    <Route path="/settings/customer-wifi-links" element={<GuardedRoute permissionKey="master.customer_wifi_links.manage" element={<CustomerWifiLinksPage />} />} />
                    <Route path="/settings/master-data" element={<GuardedRoute permissionKey="masterdata.view" element={<MasterDataPage />} />} />
                    <Route path="/settings/access-policy" element={<GuardedRoute permissionKey="access_policy.manage" element={<AccessPolicyPage />} />} />
                    <Route path="/settings/system-logs" element={<GuardedRoute permissionKey="access_policy.manage" element={<SystemActivityLogsPage />} />} />
                    <Route path="/settings/customer-package-management" element={<GuardedRoute permissionKey="customer.package_audit.view" element={<CustomerPackageManagementPage />} />} />
                    <Route path="/settings/customer-package-migration" element={<GuardedRoute permissionKey="customer.package_migration.manage" element={<CustomerPackageMigrationPage />} />} />
                    <Route path="/settings/customer-accounts" element={<GuardedRoute permissionKey="customer.account.manage" element={<CustomerAccountsPage />} />} />
                    <Route path="/settings/system-health" element={<GuardedRoute permissionKey="access_policy.manage" element={<SystemHealthPage />} />} />
                    
                    {/* Complaints (Admin) */}
                    <Route path="/complaints" element={<GuardedRoute permissionKey="complaint.view" element={<ComplaintsPage />} />} />
                    <Route path="/aduan" element={<GuardedRoute permissionKey="complaint.view" element={<ComplaintsPage />} />} />
                    
                    {/* Monitoring */}
                    <Route path="/monitoring" element={<GuardedRoute permissionKey="monitoring.view" element={<Monitoring />} />} />
                    <Route path="/monitoring-maps" element={<GuardedRoute permissionKey="monitoring.maps.view" element={<MonitoringMaps />} />} />
                    <Route path="/monitoring-genieacs" element={<GuardedRoute permissionKey="monitoring.view" element={<MonitoringGenieAcsPage />} />} />
                    
                    {/* Isolir */}
                    <Route path="/isolir" element={<GuardedRoute permissionKey="isolir.view" element={<IsolirPage />} />} />
                    
                    {/* Payroll */}
                    <Route path="/payroll" element={<GuardedRoute permissionKey="payroll.view" element={<PayrollPage />} />} />

                    {/* Inventori */}
                    <Route path="/inventori" element={<GuardedRoute permissionKey="inventory.view" element={<InventoryPage />} />} />
                    <Route path="/inventori/master" element={<GuardedRoute permissionKey="inventory.master.manage" element={<InventoryMasterPage />} />} />

                    {/* Mutasi */}
                    <Route path="/mutasi" element={<GuardedRoute permissionKey="finance.mutation.view" element={<MutasiPage />} />} />
                    <Route path="/kalender-kas" element={<GuardedRoute permissionKey="finance.mutation.view" element={<CashObligationCalendarPage />} />} />
                    <Route path="/rekonsiliasi" element={<GuardedRoute permissionKey="finance.mutation.view" element={<ReconciliationCenterPage />} />} />
                    <Route path="/pinjaman" element={<GuardedRoute permissionKey="finance.mutation.view" element={<BorrowerLoansPage />} />} />

                    {/* Jalur Distribusi */}
                    <Route path="/jalur-distribusi" element={<GuardedRoute permissionKey="odp.mapping.view" element={<DistributionRoutePage />} />} />

                    {/* Instalasi */}
                    <Route path="/instalasi" element={<GuardedRoute permissionKey="installation.view" element={<InstallationPage />} />} />

                    {/* Incident Command */}
                    <Route path="/incidents" element={<GuardedRoute permissionKey="incident.view" element={<IncidentCommandPage />} />} />
                    
                    {/* Customer Portal */}
                    <Route path="/customer/login" element={<RouteSuspense><CustomerLoginPage /></RouteSuspense>} />
                    <Route path="/customer/dashboard" element={<RouteSuspense><CustomerDashboard /></RouteSuspense>} />
                    
                    {/* 404 */}
                    <Route path="*" element={<RouteSuspense><NotFoundPage /></RouteSuspense>} />
                </Routes>
            </AppLayout>
        </Router>
    );
}

export default App;
