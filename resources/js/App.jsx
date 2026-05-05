import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layouts/Navbar';
import Dashboard from './pages/Dashboard';
import DashboardPredictionPage from './pages/DashboardPredictionPage';
import CustomersPage from './pages/Customers/CustomersPage';
import CustomerForm from './pages/Customers/CustomerForm';
import OdpPage from './pages/Odp/OdpPage';
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
import NetworkStatusPage from './pages/NetworkStatusPage';
import Monitoring from './pages/Monitoring';
import IsolirPage from './pages/Isolir/IsolirPage';
import MonitoringMaps from './pages/MonitoringMaps';
import PayrollPage from './pages/Payroll/PayrollPage';
import MutasiPage from './pages/Finance/MutasiPage';
import DistributionRoutePage from './pages/DistributionRoute/DistributionRoutePage';
import InventoryPage from './pages/Inventory/InventoryPage';
import InventoryMasterPage from './pages/Inventory/InventoryMasterPage';

// Layout wrapper that conditionally shows navbar
function AppLayout({ children }) {
    const location = useLocation();
    const noNavbarRoutes = ['/login', '/register', '/forgot-password', '/', '/customer/login', '/customer/dashboard', '/status-jaringan'];
    const isInvoicePage = location.pathname.startsWith('/invoice/');
    const isCustomerRoute = location.pathname.startsWith('/customer/');
    const showNavbar = !noNavbarRoutes.includes(location.pathname) && !isInvoicePage && !isCustomerRoute;
    
    return (
        <div className="min-h-screen bg-gray-50">
            {showNavbar && <Navbar />}
            {showNavbar ? (
                <main className="max-w-7xl mx-auto px-4 py-8">
                    {children}
                </main>
            ) : (
                children
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
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/dashboard/prediksi" element={<DashboardPredictionPage />} />
                    
                    {/* Billing/Penagihan */}
                    <Route path="/penagihan" element={<BillingPage />} />
                    <Route path="/billing" element={<BillingPage />} />
                    
                    {/* Public Invoice */}
                    <Route path="/invoice/:invoiceLink" element={<InvoicePage />} />
                    
                    {/* Customers */}
                    <Route path="/customers" element={<CustomersPage />} />
                    <Route path="/customers/create" element={<CustomerForm />} />
                    <Route path="/customers/:id/edit" element={<CustomerForm />} />
                    <Route path="/pelanggan" element={<CustomersPage />} />
                    
                    {/* Customer Verification (Google Sheets) */}
                    <Route path="/customer-verification" element={<CustomerVerificationPage />} />
                    <Route path="/customer-verification/verify/:timestamp" element={<CustomerVerificationForm />} />
                    
                    {/* ODP */}
                    <Route path="/odp" element={<OdpPage />} />
                    
                    {/* Pengeluaran */}
                    <Route path="/pengeluaran" element={<PengeluaranPage />} />
                    
                    {/* Profile */}
                    <Route path="/profile" element={<ProfilePage />} />
                    
                    {/* Settings */}
                    <Route path="/settings/payment-methods" element={<PaymentMethodsPage />} />
                    <Route path="/settings/payment-receipts" element={<PaymentReceiptsPage />} />
                    <Route path="/settings/packages" element={<PackageManagementPage />} />
                    <Route path="/settings/users" element={<UserManagementPage />} />
                    <Route path="/settings/invoice-management" element={<InvoiceManagementPage />} />
                    <Route path="/settings/financial-targets" element={<FinancialTargetsPage />} />
                    <Route path="/settings/promo" element={<PromoManagementPage />} />
                    <Route path="/settings/network-notices" element={<NetworkNoticePage />} />
                    <Route path="/settings/send-notification" element={<SendNotificationPage />} />
                    <Route path="/settings/master-wilayah" element={<MasterWilayahPage />} />
                    <Route path="/settings/master-mikrotik" element={<MasterMikrotikPage />} />
                    <Route path="/settings/master-data" element={<MasterDataPage />} />
                    
                    {/* Complaints (Admin) */}
                    <Route path="/complaints" element={<ComplaintsPage />} />
                    <Route path="/aduan" element={<ComplaintsPage />} />
                    
                    {/* Monitoring */}
                    <Route path="/monitoring" element={<Monitoring />} />
                    <Route path="/monitoring-maps" element={<MonitoringMaps />} />
                    
                    {/* Isolir */}
                    <Route path="/isolir" element={<IsolirPage />} />
                    
                    {/* Payroll */}
                    <Route path="/payroll" element={<PayrollPage />} />

                    {/* Inventori */}
                    <Route path="/inventori" element={<InventoryPage />} />
                    <Route path="/inventori/master" element={<InventoryMasterPage />} />

                    {/* Mutasi */}
                    <Route path="/mutasi" element={<MutasiPage />} />

                    {/* Jalur Distribusi */}
                    <Route path="/jalur-distribusi" element={<DistributionRoutePage />} />
                    
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
