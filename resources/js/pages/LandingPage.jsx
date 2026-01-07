import { useEffect, useState } from 'react';
import { 
    Wifi, Phone, MessageCircle, ChevronRight, ChevronLeft, 
    Zap, Shield, Clock, Users, Star, Check, MapPin, Mail,
    ArrowRight, Sparkles, AlertTriangle
} from 'lucide-react';
import NetworkNoticePopup from '../components/NetworkNoticePopup';

function LandingPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [networkNotices, setNetworkNotices] = useState([]);
    const [showNoticePopup, setShowNoticePopup] = useState(false);

    useEffect(() => {
        fetchData();
        fetchNetworkNotices();
    }, []);

    useEffect(() => {
        if (data?.promotions?.length > 1) {
            const interval = setInterval(() => {
                setCurrentSlide((prev) => (prev + 1) % data.promotions.length);
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [data?.promotions]);

    const fetchData = async () => {
        try {
            const response = await fetch('/api/landing-page');
            const result = await response.json();
            setData(result);
        } catch (err) {
            console.error('Failed to load landing page data', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchNetworkNotices = async () => {
        try {
            const response = await fetch('/api/network-notices/public');
            const result = await response.json();
            if (result.success && result.data.length > 0) {
                setNetworkNotices(result.data);
                setShowNoticePopup(true);
            }
        } catch (err) {
            console.error('Failed to fetch network notices', err);
        }
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('id-ID').format(price);
    };

    const getWhatsAppLink = (phone, message = '') => {
        let cleanPhone = phone?.replace(/\D/g, '') || '';
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.substring(1);
        }
        const encodedMessage = encodeURIComponent(message);
        return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Memuat...</p>
                </div>
            </div>
        );
    }

    const settings = data?.settings || {};
    const packages = data?.packages || [];
    const promotions = data?.promotions || [];
    
    // Default contact number
    const defaultPhone = '+6285158025553';
    const contactPhone = settings.company_phone || defaultPhone;
    const contactWhatsapp = settings.company_whatsapp || defaultPhone;

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
            {/* Network Notice Popup - untuk gangguan massal & maintenance, hilang setelah 5 detik */}
            {showNoticePopup && networkNotices.length > 0 && (
                <NetworkNoticePopup 
                    notices={networkNotices} 
                    autoHideDelay={5000}
                    onClose={() => setShowNoticePopup(false)}
                />
            )}

            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-orange-100">
                <div className="max-w-7xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src="/logo_baru.png" alt="Logo" className="h-10 md:h-12" />
                            <div className="hidden sm:block">
                                <h1 className="font-bold text-gray-900 text-lg">{settings.company_name || 'Rumah Kita Network'}</h1>
                                <p className="text-xs text-gray-500">{settings.company_tagline || 'Wifi Rumahan Murah dan Stabil'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3">
                            {/* Status Jaringan Link - tampil jika ada gangguan */}
                            {networkNotices.length > 0 && (
                                <a 
                                    href="/status-jaringan"
                                    className="flex items-center gap-1 text-red-600 hover:text-red-700 px-2 py-1 rounded-full text-xs font-medium bg-red-50 hover:bg-red-100 transition"
                                >
                                    <AlertTriangle size={14} />
                                    <span className="hidden sm:inline">Info Gangguan</span>
                                </a>
                            )}
                            <a 
                                href={getWhatsAppLink(contactWhatsapp, 'Halo, saya tertarik dengan layanan internet Rumah Kita Network')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium transition shadow-lg shadow-green-500/30"
                            >
                                <MessageCircle size={18} />
                                <span className="hidden sm:inline">Hubungi Kami</span>
                            </a>
                            <a 
                                href="/customer/login"
                                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-full text-sm font-medium transition shadow-lg shadow-orange-500/30"
                            >
                                <span>Login</span>
                            </a>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section with Slider */}
            <section className="relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-300/30 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-300/30 rounded-full blur-3xl"></div>
                </div>

                <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-20">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        {/* Left Content */}
                        <div className="text-center lg:text-left">
                            <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
                                <Sparkles size={16} />
                                Internet Fiber Optik
                            </div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                                {settings.hero_title || 'Wifi Rumahan'}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500"> Murah dan Stabil</span>
                            </h1>
                            <p className="text-xl text-gray-600 mb-8">
                                {settings.hero_subtitle || 'Unlimited Tanpa Batas Kuota atau FUP'}
                            </p>

                            {/* Promo Badge */}
                            {settings.promo_text && (
                                <div className="inline-block bg-gradient-to-r from-red-500 to-orange-500 text-white px-6 py-3 rounded-2xl mb-8 shadow-lg shadow-red-500/30">
                                    <p className="text-sm line-through opacity-75">Biaya Pemasangan Rp {formatPrice(settings.installation_fee || 250000)}</p>
                                    <p className="text-xl font-bold">{settings.promo_text}</p>
                                    {settings.promo_period && (
                                        <p className="text-xs mt-1 opacity-90">{settings.promo_period}</p>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                                <a 
                                    href="#paket"
                                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-8 py-4 rounded-2xl font-semibold transition shadow-lg shadow-orange-500/30"
                                >
                                    Lihat Paket
                                    <ArrowRight size={20} />
                                </a>
                                <a 
                                    href={getWhatsAppLink(contactWhatsapp, 'Halo, saya ingin berlangganan internet Rumah Kita Network')}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-900 px-8 py-4 rounded-2xl font-semibold transition border-2 border-gray-200"
                                >
                                    <Phone size={20} />
                                    {contactPhone}
                                </a>
                            </div>
                        </div>

                        {/* Right - Promo Slider */}
                        <div className="relative">
                            {promotions.length > 0 ? (
                                <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                                    {promotions.map((promo, index) => {
                                        // Handle both /brosur/ paths and storage paths
                                        const imageSrc = promo.image?.startsWith('/') 
                                            ? promo.image 
                                            : `/storage/${promo.image}`;
                                        
                                        return (
                                            <div 
                                                key={promo.id}
                                                className={`transition-opacity duration-500 ${index === currentSlide ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
                                            >
                                                {promo.image ? (
                                                    <img 
                                                        src={imageSrc}
                                                        alt={promo.title}
                                                        className="w-full h-auto"
                                                    />
                                                ) : (
                                                    <div className="aspect-[3/4] bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center">
                                                        <p className="text-white text-2xl font-bold text-center px-8">{promo.title}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Slider Controls */}
                                    {promotions.length > 1 && (
                                        <>
                                            <button 
                                                onClick={() => setCurrentSlide((prev) => (prev - 1 + promotions.length) % promotions.length)}
                                                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full shadow-lg transition"
                                            >
                                                <ChevronLeft size={24} />
                                            </button>
                                            <button 
                                                onClick={() => setCurrentSlide((prev) => (prev + 1) % promotions.length)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white p-2 rounded-full shadow-lg transition"
                                            >
                                                <ChevronRight size={24} />
                                            </button>
                                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                                                {promotions.map((_, index) => (
                                                    <button
                                                        key={index}
                                                        onClick={() => setCurrentSlide(index)}
                                                        className={`w-2 h-2 rounded-full transition ${index === currentSlide ? 'bg-white w-6' : 'bg-white/50'}`}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="aspect-[3/4] bg-gradient-to-br from-orange-400 to-amber-400 rounded-3xl shadow-2xl flex items-center justify-center">
                                    <div className="text-center text-white p-8">
                                        <Wifi size={80} className="mx-auto mb-4" />
                                        <h3 className="text-2xl font-bold">Internet Cepat</h3>
                                        <p className="mt-2 opacity-90">Stabil & Unlimited</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="py-16 bg-white">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Zap size={32} className="text-orange-500" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-1">Ultra Cepat</h3>
                            <p className="text-sm text-gray-500">Fiber Optik hingga 30Mbps</p>
                        </div>
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Shield size={32} className="text-green-500" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-1">100% Unlimited</h3>
                            <p className="text-sm text-gray-500">Tanpa FUP & Kuota</p>
                        </div>
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Clock size={32} className="text-blue-500" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-1">Support 24/7</h3>
                            <p className="text-sm text-gray-500">Layanan setiap saat</p>
                        </div>
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Users size={32} className="text-purple-500" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-1">Multi Device</h3>
                            <p className="text-sm text-gray-500">Banyak perangkat sekaligus</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="paket" className="py-20">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Pilih Paket Internet Anda</h2>
                        <p className="text-gray-600 text-lg">Harga sudah termasuk PPN 11%</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {packages.map((pkg, index) => (
                            <div 
                                key={pkg.id}
                                className={`relative bg-white rounded-3xl p-8 shadow-xl transition-transform hover:scale-105 ${
                                    pkg.is_popular ? 'ring-4 ring-orange-500 ring-offset-4' : ''
                                }`}
                            >
                                {pkg.is_popular && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-1 rounded-full text-sm font-bold">
                                        Paling Populer
                                    </div>
                                )}
                                
                                <div className={`inline-block px-4 py-1 rounded-full text-sm font-bold mb-4 ${
                                    index === 0 ? 'bg-amber-100 text-amber-700' :
                                    index === 1 ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-700'
                                }`}>
                                    Paket {pkg.name}
                                </div>

                                <div className="mb-6">
                                    <span className="text-5xl font-bold text-gray-900">{pkg.speed}</span>
                                </div>

                                <div className="mb-6">
                                    <p className="text-gray-500 text-sm">Mulai dari</p>
                                    <p className="text-3xl font-bold text-orange-500">
                                        Rp {formatPrice(pkg.price)}
                                        <span className="text-base font-normal text-gray-500">/bulan</span>
                                    </p>
                                </div>

                                <div className="mb-8 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <Check size={20} className="text-green-500 flex-shrink-0" />
                                        <span className="text-gray-600">{pkg.device_count}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Check size={20} className="text-green-500 flex-shrink-0" />
                                        <span className="text-gray-600">Unlimited tanpa FUP</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Check size={20} className="text-green-500 flex-shrink-0" />
                                        <span className="text-gray-600">Support 24/7</span>
                                    </div>
                                </div>

                                <a
                                    href={getWhatsAppLink(contactWhatsapp, `Halo, saya tertarik dengan Paket ${pkg.name} (${pkg.speed}) - Rp ${formatPrice(pkg.price)}/bulan`)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`block w-full text-center py-4 rounded-2xl font-semibold transition ${
                                        pkg.is_popular 
                                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 hover:shadow-xl'
                                            : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                                    }`}
                                >
                                    Pilih Paket
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-gradient-to-r from-orange-500 to-amber-500">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                        Siap Bergabung dengan Kami?
                    </h2>
                    <p className="text-xl text-white/90 mb-8">
                        Hubungi kami sekarang dan nikmati internet cepat dengan harga terjangkau
                    </p>
                    <a
                        href={getWhatsAppLink(contactWhatsapp, 'Halo, saya ingin berlangganan internet Rumah Kita Network')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 bg-white hover:bg-gray-100 text-orange-500 px-8 py-4 rounded-2xl font-bold text-lg transition shadow-xl"
                    >
                        <MessageCircle size={24} />
                        Chat via WhatsApp
                    </a>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-white py-12">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="grid md:grid-cols-3 gap-8">
                        <div>
                            <img src="/logo_baru.png" alt="Logo" className="h-12 mb-4 brightness-0 invert" />
                            <p className="text-gray-400">{settings.company_tagline}</p>
                        </div>
                        <div>
                            <h4 className="font-bold mb-4">Kontak</h4>
                            <div className="space-y-3 text-gray-400">
                                <a href={`tel:${contactPhone}`} className="flex items-center gap-2 hover:text-white transition">
                                    <Phone size={18} />
                                    {contactPhone}
                                </a>
                                <a href={getWhatsAppLink(contactWhatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition">
                                    <MessageCircle size={18} />
                                    WhatsApp
                                </a>
                                {settings.company_email && (
                                    <a href={`mailto:${settings.company_email}`} className="flex items-center gap-2 hover:text-white transition">
                                        <Mail size={18} />
                                        {settings.company_email}
                                    </a>
                                )}
                            </div>
                        </div>
                        <div>
                            <h4 className="font-bold mb-4">Supported by</h4>
                            <p className="text-gray-400 text-sm">MMS Network Solution Partner</p>
                            <p className="text-gray-400 text-sm">EONET.COM</p>
                        </div>
                    </div>
                    <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-500">
                        <p>© {new Date().getFullYear()} {settings.company_name}. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default LandingPage;
