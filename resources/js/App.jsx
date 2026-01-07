import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layouts/Navbar';
import Dashboard from './pages/Dashboard';
import CustomersPage from './pages/Customers/CustomersPage';
import CustomerForm from './pages/Customers/CustomerForm';
import OdpPage from './pages/Odp/OdpPage';
import PengeluaranPage from './pages/Pengeluaran/PengeluaranPage';
import ProfilePage from './pages/Profile/ProfilePage';
import BillingPage from './pages/Billing/BillingPage';
import InvoicePage from './pages/Invoice/InvoicePage';
import LoginPage from './pages/Auth/LoginPage';
import PaymentMethodsPage from './pages/Settings/PaymentMethodsPage';
import LandingPage from './pages/LandingPage';
import PromoManagementPage from './pages/Settings/PromoManagementPage';
import CustomerLoginPage from './pages/Customer/CustomerLoginPage';
import CustomerDashboard from './pages/Customer/CustomerDashboard';
import ComplaintsPage from './pages/Complaints/ComplaintsPage';
import NetworkNoticePage from './pages/Settings/NetworkNoticePage';
import SendNotificationPage from './pages/Settings/SendNotificationPage';
import NetworkStatusPage from './pages/NetworkStatusPage';
import Monitoring from './pages/Monitoring';

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
                    
                    {/* ODP */}
                    <Route path="/odp" element={<OdpPage />} />
                    
                    {/* Pengeluaran */}
                    <Route path="/pengeluaran" element={<PengeluaranPage />} />
                    
                    {/* Profile */}
                    <Route path="/profile" element={<ProfilePage />} />
                    
                    {/* Settings */}
                    <Route path="/settings/payment-methods" element={<PaymentMethodsPage />} />
                    <Route path="/settings/promo" element={<PromoManagementPage />} />
                    <Route path="/settings/network-notices" element={<NetworkNoticePage />} />
                    <Route path="/settings/send-notification" element={<SendNotificationPage />} />
                    
                    {/* Complaints (Admin) */}
                    <Route path="/complaints" element={<ComplaintsPage />} />
                    <Route path="/aduan" element={<ComplaintsPage />} />
                    
                    {/* Monitoring */}
                    <Route path="/monitoring" element={<Monitoring />} />
                    
                    {/* Customer Portal */}
                    <Route path="/customer/login" element={<CustomerLoginPage />} />
                    <Route path="/customer/dashboard" element={<CustomerDashboard />} />
                </Routes>
            </AppLayout>
        </Router>
    );
}

export default App;
