import { useState, useEffect, useRef } from 'react';
import { Menu, X, ChevronDown, User, Settings, LogOut, MapPin, CreditCard, Megaphone, MessageSquare, AlertTriangle, Send, Activity } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [userName, setUserName] = useState('User');
    const location = useLocation();
    const dropdownRef = useRef(null);

    useEffect(() => {
        // Try to get username from window object, localStorage, or meta tag
        let name = 'User';
        
        if (typeof window !== 'undefined' && window.appUser) {
            name = window.appUser;
        } else if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('appUserName');
            if (stored) name = stored;
        }
        
        if (name === 'User') {
            const metaName = document.querySelector('meta[name="user-name"]');
            if (metaName) {
                name = metaName.getAttribute('content');
            }
        }
        
        setUserName(name);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isActive = (path) => {
        if (path === '/dashboard') return location.pathname === '/dashboard';
        if (path === '/customers') return location.pathname === '/customers';
        if (path === '/customers/create') return location.pathname === '/customers/create';
        if (path === '/odp') return location.pathname.startsWith('/odp');
        if (path === '/pengeluaran') return location.pathname.startsWith('/pengeluaran');
        if (path === '/complaints') return location.pathname.startsWith('/complaints') || location.pathname.startsWith('/aduan');
        if (path === '/monitoring') return location.pathname === '/monitoring';
        if (path === '/monitoring-maps') return location.pathname === '/monitoring-maps';
        if (path === '/isolir') return location.pathname.startsWith('/isolir');
        if (path === '/profile') return location.pathname === '/profile';
        if (path === '/settings/payment-methods') return location.pathname === '/settings/payment-methods';
        if (path === '/settings/promo') return location.pathname === '/settings/promo';
        if (path === '/settings/network-notices') return location.pathname === '/settings/network-notices';
        return false;
    };

    return (
        <nav className="bg-white shadow-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex justify-between items-center h-16">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <Link to="/dashboard" className="flex items-center gap-2">
                            <img src="/logo_baru.png" alt="Rumah Kita Net" className="h-10 w-auto" />
                            <span className="font-bold text-lg text-gray-800 hidden sm:inline">Rumah Kita Net</span>
                        </Link>
                    </div>

                    {/* Desktop Menu - Simplified */}
                    <div className="hidden md:flex items-center gap-5">
                        <Link
                            to="/dashboard"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${isActive('/dashboard') ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-4 7 4M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                            <span>Dashboard</span>
                        </Link>
                        <Link
                            to="/penagihan"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${location.pathname.startsWith('/penagihan') ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                            <span>Penagihan</span>
                        </Link>
                        <Link
                            to="/customers"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${isActive('/customers') ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                            <span>Pelanggan</span>
                        </Link>
                        <Link
                            to="/customer-verification"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${location.pathname.startsWith('/customer-verification') ? 'text-green-600 bg-green-50 font-semibold' : 'text-gray-700 hover:text-green-600 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <span>Verifikasi</span>
                        </Link>
                        <Link
                            to="/pengeluaran"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${isActive('/pengeluaran') ? 'text-blue-600 bg-blue-50 font-semibold' : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/></svg>
                            <span>Pengeluaran</span>
                        </Link>
                    </div>

                    {/* Profile Dropdown */}
                    <div className="hidden md:flex items-center" ref={dropdownRef}>
                        <div className="relative">
                            <button
                                onClick={() => setIsProfileOpen(!isProfileOpen)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${isProfileOpen ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                            >
                                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-gray-700 font-medium">{userName}</span>
                                <ChevronDown size={16} className={`text-gray-500 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {isProfileOpen && (
                                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                                    <div className="px-4 py-2 border-b border-gray-100">
                                        <p className="text-sm font-medium text-gray-900">{userName}</p>
                                        <p className="text-xs text-gray-500">Administrator</p>
                                    </div>
                                    
                                    <div className="py-1">
                                        <Link
                                            to="/profile"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/profile') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <User size={18} />
                                            <span>Profil Saya</span>
                                        </Link>
                                        <Link
                                            to="/settings/payment-methods"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/settings/payment-methods') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <CreditCard size={18} />
                                            <span>Metode Pembayaran</span>
                                        </Link>
                                        <Link
                                            to="/odp"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/odp') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <MapPin size={18} />
                                            <span>Kelola ODP</span>
                                        </Link>
                                        <Link
                                            to="/settings/promo"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/settings/promo') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <Megaphone size={18} />
                                            <span>Kelola Promo</span>
                                        </Link>
                                        <Link
                                            to="/complaints"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/complaints') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <MessageSquare size={18} />
                                            <span>Aduan Pelanggan</span>
                                        </Link>
                                        <Link
                                            to="/monitoring"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/monitoring') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <Activity size={18} />
                                            <span>Monitoring</span>
                                        </Link>
                                        <Link
                                            to="/monitoring-maps"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/monitoring-maps') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <MapPin size={18} />
                                            <span>Monitoring Maps</span>
                                        </Link>
                                        <Link
                                            to="/isolir"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/isolir') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <AlertTriangle size={18} />
                                            <span>Isolir</span>
                                        </Link>
                                        <Link
                                            to="/settings/network-notices"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/settings/network-notices') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <AlertTriangle size={18} />
                                            <span>Info Gangguan</span>
                                        </Link>
                                        <Link
                                            to="/settings/send-notification"
                                            onClick={() => setIsProfileOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-2 text-sm transition ${isActive('/settings/send-notification') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <Send size={18} />
                                            <span>Kirim Notifikasi WA</span>
                                        </Link>
                                    </div>
                                    
                                    <div className="border-t border-gray-100 pt-1">
                                        <form method="POST" action="/logout">
                                            <input type="hidden" name="_token" value={document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')} />
                                            <button
                                                type="submit"
                                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                                            >
                                                <LogOut size={18} />
                                                <span>Keluar</span>
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile menu button */}
                    <div className="md:hidden">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            {isOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isOpen && (
                <div className="md:hidden bg-white border-t border-gray-200">
                    <div className="p-3 space-y-1">
                        <Link
                            to="/dashboard"
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/dashboard') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-4 7 4M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                            <span>Dashboard</span>
                        </Link>
                        <Link
                            to="/penagihan"
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg ${location.pathname.startsWith('/penagihan') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                            <span>Penagihan</span>
                        </Link>
                        <Link
                            to="/customers"
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/customers') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                            <span>Pelanggan</span>
                        </Link>
                        <Link
                            to="/customer-verification"
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg ${location.pathname.startsWith('/customer-verification') ? 'text-green-600 bg-green-50' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <span>Verifikasi Pelanggan</span>
                        </Link>
                        <Link
                            to="/pengeluaran"
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/pengeluaran') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"/></svg>
                            <span>Pengeluaran</span>
                        </Link>
                        
                        <div className="border-t border-gray-200 my-2 pt-2">
                            <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Pengaturan</p>
                            <Link
                                to="/profile"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/profile') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <User size={20} />
                                <span>Profil Saya</span>
                            </Link>
                            <Link
                                to="/settings/payment-methods"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/settings/payment-methods') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <CreditCard size={20} />
                                <span>Metode Pembayaran</span>
                            </Link>
                            <Link
                                to="/odp"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/odp') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <MapPin size={20} />
                                <span>Kelola ODP</span>
                            </Link>
                            <Link
                                to="/settings/promo"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/settings/promo') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <Megaphone size={20} />
                                <span>Kelola Promo</span>
                            </Link>
                            <Link
                                to="/complaints"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/complaints') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <MessageSquare size={20} />
                                <span>Aduan Pelanggan</span>
                            </Link>
                            <Link
                                to="/monitoring"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/monitoring') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <Activity size={20} />
                                <span>Monitoring</span>
                            </Link>
                            <Link
                                to="/monitoring-maps"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/monitoring-maps') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <MapPin size={20} />
                                <span>Monitoring Maps</span>
                            </Link>
                            <Link
                                to="/isolir"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/isolir') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <AlertTriangle size={20} />
                                <span>Isolir</span>
                            </Link>
                            <Link
                                to="/settings/network-notices"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/settings/network-notices') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <AlertTriangle size={20} />
                                <span>Info Gangguan</span>
                            </Link>
                            <Link
                                to="/settings/send-notification"
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg ${isActive('/settings/send-notification') ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <Send size={20} />
                                <span>Kirim Notifikasi WA</span>
                            </Link>
                        </div>
                        
                        <div className="border-t border-gray-200 pt-2">
                            <form method="POST" action="/logout">
                                <input type="hidden" name="_token" value={document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')} />
                                <button
                                    type="submit"
                                    className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg"
                                >
                                    <LogOut size={20} />
                                    <span>Keluar</span>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
}

export default Navbar;
