import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, User, LogIn, Wifi, ArrowLeft } from 'lucide-react';
import NetworkNoticePopup from '../../components/NetworkNoticePopup';

function CustomerLoginPage() {
    const navigate = useNavigate();
    const [identifier, setIdentifier] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [networkNotices, setNetworkNotices] = useState([]);
    const [showNoticePopup, setShowNoticePopup] = useState(false);

    useEffect(() => {
        fetchNetworkNotices();
    }, []);

    const fetchNetworkNotices = async () => {
        try {
            const response = await fetch('/api/network-notices/customer');
            const result = await response.json();
            if (result.success && result.data.length > 0) {
                setNetworkNotices(result.data);
                setShowNoticePopup(true);
            }
        } catch (err) {
            console.error('Failed to fetch network notices', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // Get CSRF token
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

            const response = await fetch('/api/customer/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                },
                body: JSON.stringify({ identifier }),
            });

            const data = await response.json();

            if (data.success) {
                // Simpan ke localStorage
                localStorage.setItem('customer_logged_in', 'true');
                localStorage.setItem('customer_name', data.customer.name);
                localStorage.setItem('customer_id', data.customer.id);
                
                // Redirect ke dashboard pelanggan
                navigate('/customer/dashboard');
            } else {
                setError(data.message || 'Login gagal');
            }
        } catch (err) {
            setError('Terjadi kesalahan. Silakan coba lagi.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center p-4">
            {/* Network Notice Popup - auto hide after 3 seconds */}
            {showNoticePopup && networkNotices.length > 0 && (
                <NetworkNoticePopup 
                    notices={networkNotices} 
                    autoHideDelay={3000}
                    showOnlyFirst={true}
                    onClose={() => setShowNoticePopup(false)}
                />
            )}

            {/* Back button */}
            <a 
                href="/"
                className="absolute top-4 left-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
            >
                <ArrowLeft size={20} />
                <span>Kembali</span>
            </a>

            <div className="w-full max-w-md">
                {/* Logo & Title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl shadow-lg shadow-orange-500/30 mb-4">
                        <Wifi size={40} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Portal Pelanggan</h1>
                    <p className="text-gray-600 mt-1">Rumah Kita Network</p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-2xl shadow-xl p-8">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Masuk ke Akun Anda</h2>
                    <p className="text-gray-500 text-sm mb-6">
                        Gunakan nomor telepon atau username PPPoE untuk masuk
                    </p>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Nomor Telepon / Username PPPoE
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User size={20} className="text-gray-400" />
                                </div>
                                <input
                                    type="text"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    required
                                    placeholder="Contoh: 081234567890 atau user123"
                                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                                />
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                Masukkan nomor HP yang terdaftar atau username PPPoE Anda
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !identifier}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-3 rounded-xl font-semibold transition shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    <span>Memproses...</span>
                                </>
                            ) : (
                                <>
                                    <LogIn size={20} />
                                    <span>Masuk</span>
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <p className="text-center text-sm text-gray-500">
                            Belum terdaftar? Hubungi kami untuk berlangganan
                        </p>
                        <a
                            href="https://wa.me/6285158025553?text=Halo,%20saya%20ingin%20berlangganan%20internet%20Rumah%20Kita%20Network"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 flex items-center justify-center gap-2 text-green-600 hover:text-green-700 font-medium"
                        >
                            <Phone size={18} />
                            <span>WhatsApp: +62 851-5802-5553</span>
                        </a>
                    </div>
                </div>

                {/* Admin Login Link */}
                <div className="mt-6 text-center">
                    <a 
                        href="/login" 
                        className="text-sm text-gray-500 hover:text-gray-700"
                    >
                        Login sebagai Admin →
                    </a>
                </div>
            </div>
        </div>
    );
}

export default CustomerLoginPage;
