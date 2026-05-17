import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layouts/Navbar';
import Dashboard from './pages/Dashboard';
import DashboardPredictionPage from './pages/DashboardPredictionPage';
import CustomersPage from './pages/Customers/CustomersPage';
import CustomerForm from './pages/Customers/CustomerForm';
import OdpPage from './pages/Odp/OdpPage';
import OdpMappingPage from './pages/Odp/OdpMappingPage';
import PengeluaranPage from './pages/Pengeluaran/PengeluaranPage';
import ProfilePage from './pages/Profile/ProfilePage';
import BillingPage from './pages/Billing/BillingPage';
import InvoicePage from './pages/Invoice/InvoicePage';
import LoginPage from './pages/Auth/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import PaymentMethodsPage from './pages/Settings/PaymentMethodsPage';
import PaymentReceiptsPage from './pages/Settings/PaymentReceiptsPage';
import PackageManagementPage from './pages/Settings/PackageManagementPage';
import UserManagementPage from './pages/Settings/UserManagementPage';
import InvoiceManagementPage from './pages/Settings/InvoiceManagementPage';
import LandingPage from './pages/LandingPage';
import PromoManagementPage from './pages/Settings/PromoManagementPage';
import FinancialTargetsPage from './pages/Settings/FinancialTargetsPage';
import CustomerLoginPage from './pages/Customer/CustomerLoginPage';
import CustomerDashboard from './pages/Customer/CustomerDashboard';
import CustomerVerificationPage from './pages/Customers/CustomerVerificationPage';
import CustomerVerificationForm from './pages/Customers/CustomerVerificationForm';
import ComplaintsPage from './pages/Complaints/ComplaintsPage';
import NetworkNoticePage from './pages/Settings/NetworkNoticePage';
import SendNotificationPage from './pages/Settings/SendNotificationPage';
import MasterWilayahPage from './pages/Settings/MasterWilayahPage';
import MasterMikrotikPage from './pages/Settings/MasterMikrotikPage';
import MasterDataPage from './pages/Settings/MasterDataPage';
import AccessPolicyPage from './pages/Settings/AccessPolicyPage';
import CustomerPackageManagementPage from './pages/Settings/CustomerPackageManagementPage';
import NetworkStatusPage from './pages/NetworkStatusPage';
import Monitoring from './pages/Monitoring';
import IsolirPage from './pages/Isolir/IsolirPage';
import MonitoringMaps from './pages/MonitoringMaps';
import PayrollPage from './pages/Payroll/PayrollPage';
import MutasiPage from './pages/Finance/MutasiPage';
import DistributionRoutePage from './pages/DistributionRoute/DistributionRoutePage';
import InventoryPage from './pages/Inventory/InventoryPage';
import InventoryMasterPage from './pages/Inventory/InventoryMasterPage';
import InstallationPage from './pages/Installation/InstallationPage';

const ROUTE_FALLBACK_ROLES = {
    'dashboard.view': ['superadmin', 'admin', 'teknisi', 'finance'],
    'dashboard.prediction.view': ['superadmin', 'admin', 'finance'],
    'billing.invoice.view': ['superadmin', 'admin', 'finance'],
    'customer.view': ['superadmin', 'admin', 'teknisi'],
    'customer.verification': ['superadmin', 'admin', 'teknisi'],
    'customer.package_audit.view': ['superadmin', 'admin', 'teknisi', 'finance'],
    'customer.package_audit.manage': ['superadmin', 'admin'],
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
    'master.payment.manage': ['superadmin', 'admin', 'finance'],
    'master.package.manage': ['superadmin', 'admin'],
    'user.manage': ['superadmin'],
    'billing.invoice.manage': ['superadmin'],
    'financial_target.manage': ['superadmin'],
    'master.promo.manage': ['superadmin', 'admin'],
    'master.network_notice.manage': ['superadmin', 'admin', 'teknisi'],
    'master.wilayah.manage': ['superadmin', 'admin'],
    'master.mikrotik.manage': ['superadmin', 'admin'],
    'masterdata.view': ['superadmin', 'admin', 'finance'],
    'access_policy.manage': ['superadmin'],
};

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
        return element;
    }

    return <Navigate to="/dashboard" replace />;
}

// Layout wrapper that conditionally shows navbar
function AppLayout({ children }) {
    const location = useLocation();
    const noNavbarRoutes = ['/login', '/register', '/forgot-password', '/', '/customer/login', '/customer/dashboard', '/status-jaringan'];
    const isInvoicePage = location.pathname.startsWith('/invoice/');
    const isCustomerRoute = location.pathname.startsWith('/customer/');
    const showNavbar = !noNavbarRoutes.includes(location.pathname) && !isInvoicePage && !isCustomerRoute;
    
    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden">
            {showNavbar && <Navbar />}
            {showNavbar ? (
                <main className="app-content max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8">
                    <div className="app-page-enter min-w-0">
                        {children}
                    </div>
                </main>
            ) : (
                <div className="app-content min-w-0">{children}</div>
            )}
        </div>
    );
}

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppLayout>
                <Routes>
                    {/* Landing Page (Public) */}
                    <Route path="/" element={<LandingPage />} />
                    
                    {/* Network Status Page (Public) */}
                    <Route path="/status-jaringan" element={<NetworkStatusPage />} />
                    
                    {/* Auth Routes */}
                    <Route path="/login" element={<LoginPage />} />
                    
                    {/* Dashboard */}
                    <Route path="/dashboard" element={<GuardedRoute permissionKey="dashboard.view" element={<Dashboard />} />} />
                    <Route path="/dashboard/prediksi" element={<GuardedRoute permissionKey="dashboard.prediction.view" element={<DashboardPredictionPage />} />} />
                    
                    {/* Billing/Penagihan */}
                    <Route path="/penagihan" element={<GuardedRoute permissionKey="billing.invoice.view" element={<BillingPage />} />} />
                    <Route path="/billing" element={<GuardedRoute permissionKey="billing.invoice.view" element={<BillingPage />} />} />
                    
                    {/* Public Invoice */}
                    <Route path="/invoice/:invoiceLink" element={<InvoicePage />} />
                    
                    {/* Customers */}
                    <Route path="/customers" element={<GuardedRoute permissionKey="customer.view" element={<CustomersPage />} />} />
                    <Route path="/customers/create" element={<GuardedRoute permissionKey="customer.view" element={<CustomerForm />} />} />
                    <Route path="/customers/:id/edit" element={<GuardedRoute permissionKey="customer.view" element={<CustomerForm />} />} />
                    <Route path="/pelanggan" element={<GuardedRoute permissionKey="customer.view" element={<CustomersPage />} />} />
                    
                    {/* Customer Verification (Google Sheets) */}
                    <Route path="/customer-verification" element={<GuardedRoute permissionKey="customer.verification" element={<CustomerVerificationPage />} />} />
                    <Route path="/customer-verification/verify/:timestamp" element={<GuardedRoute permissionKey="customer.verification" element={<CustomerVerificationForm />} />} />
                    
                    {/* ODP */}
                    <Route path="/odp" element={<GuardedRoute permissionKey="odp.view" element={<OdpPage />} />} />
                    <Route path="/odp-mapping" element={<GuardedRoute permissionKey="odp.mapping.view" element={<OdpMappingPage />} />} />
                    
                    {/* Pengeluaran */}
                    <Route path="/pengeluaran" element={<GuardedRoute permissionKey="finance.expense.manage" element={<PengeluaranPage />} />} />
                    
                    {/* Profile */}
                    <Route path="/profile" element={<ProfilePage />} />
                    
                    {/* Settings */}
                    <Route path="/settings/payment-methods" element={<GuardedRoute permissionKey="master.payment.manage" element={<PaymentMethodsPage />} />} />
                    <Route path="/settings/payment-receipts" element={<GuardedRoute permissionKey="master.payment.manage" element={<PaymentReceiptsPage />} />} />
                    <Route path="/settings/packages" element={<GuardedRoute permissionKey="master.package.manage" element={<PackageManagementPage />} />} />
                    <Route path="/settings/users" element={<GuardedRoute permissionKey="user.manage" element={<UserManagementPage />} />} />
                    <Route path="/settings/invoice-management" element={<GuardedRoute permissionKey="billing.invoice.manage" element={<InvoiceManagementPage />} />} />
                    <Route path="/settings/financial-targets" element={<GuardedRoute permissionKey="financial_target.manage" element={<FinancialTargetsPage />} />} />
                    <Route path="/settings/promo" element={<GuardedRoute permissionKey="master.promo.manage" element={<PromoManagementPage />} />} />
                    <Route path="/settings/network-notices" element={<GuardedRoute permissionKey="master.network_notice.manage" element={<NetworkNoticePage />} />} />
                    <Route path="/settings/send-notification" element={<GuardedRoute permissionKey="master.network_notice.manage" element={<SendNotificationPage />} />} />
                    <Route path="/settings/master-wilayah" element={<GuardedRoute permissionKey="master.wilayah.manage" element={<MasterWilayahPage />} />} />
                    <Route path="/settings/master-mikrotik" element={<GuardedRoute permissionKey="master.mikrotik.manage" element={<MasterMikrotikPage />} />} />
                    <Route path="/settings/master-data" element={<GuardedRoute permissionKey="masterdata.view" element={<MasterDataPage />} />} />
                    <Route path="/settings/access-policy" element={<GuardedRoute permissionKey="access_policy.manage" element={<AccessPolicyPage />} />} />
                    <Route path="/settings/customer-package-management" element={<GuardedRoute permissionKey="customer.package_audit.view" element={<CustomerPackageManagementPage />} />} />
                    
                    {/* Complaints (Admin) */}
                    <Route path="/complaints" element={<GuardedRoute permissionKey="complaint.view" element={<ComplaintsPage />} />} />
                    <Route path="/aduan" element={<GuardedRoute permissionKey="complaint.view" element={<ComplaintsPage />} />} />
                    
                    {/* Monitoring */}
                    <Route path="/monitoring" element={<GuardedRoute permissionKey="monitoring.view" element={<Monitoring />} />} />
                    <Route path="/monitoring-maps" element={<GuardedRoute permissionKey="monitoring.maps.view" element={<MonitoringMaps />} />} />
                    
                    {/* Isolir */}
                    <Route path="/isolir" element={<GuardedRoute permissionKey="isolir.view" element={<IsolirPage />} />} />
                    
                    {/* Payroll */}
                    <Route path="/payroll" element={<GuardedRoute permissionKey="payroll.view" element={<PayrollPage />} />} />

                    {/* Inventori */}
                    <Route path="/inventori" element={<GuardedRoute permissionKey="inventory.view" element={<InventoryPage />} />} />
                    <Route path="/inventori/master" element={<GuardedRoute permissionKey="inventory.master.manage" element={<InventoryMasterPage />} />} />

                    {/* Mutasi */}
                    <Route path="/mutasi" element={<GuardedRoute permissionKey="finance.mutation.view" element={<MutasiPage />} />} />

                    {/* Jalur Distribusi */}
                    <Route path="/jalur-distribusi" element={<GuardedRoute permissionKey="odp.mapping.view" element={<DistributionRoutePage />} />} />

                    {/* Instalasi */}
                    <Route path="/instalasi" element={<GuardedRoute permissionKey="installation.view" element={<InstallationPage />} />} />
                    
                    {/* Customer Portal */}
                    <Route path="/customer/login" element={<CustomerLoginPage />} />
                    <Route path="/customer/dashboard" element={<CustomerDashboard />} />
                    
                    {/* 404 */}
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </AppLayout>
        </Router>
    );
}

export default App;
