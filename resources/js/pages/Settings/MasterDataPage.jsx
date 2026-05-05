import { CreditCard, MapPin, Network, Package, Shield, Megaphone, Target, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

const role = window.appUserRole || 'admin';

const MASTER_MENU = [
    {
        title: 'Master Wilayah',
        description: 'Kelola kecamatan, desa, dan dusun.',
        icon: MapPin,
        path: '/settings/master-wilayah',
        roles: ['superadmin', 'admin'],
    },
    {
        title: 'Master MikroTik',
        description: 'Kelola router aktif dan penerima alert WA.',
        icon: Network,
        path: '/settings/master-mikrotik',
        roles: ['superadmin', 'admin'],
    },
    {
        title: 'Paket Layanan',
        description: 'Kelola paket internet dan profil MikroTik.',
        icon: Package,
        path: '/settings/packages',
        roles: ['superadmin', 'admin'],
    },
    {
        title: 'Master Inventori',
        description: 'Kelola jenis barang dan master item inventori.',
        icon: Shield,
        path: '/inventori/master',
        roles: ['superadmin'],
    },
    {
        title: 'Metode Pembayaran',
        description: 'Kelola rekening dan metode pembayaran aktif.',
        icon: CreditCard,
        path: '/settings/payment-methods',
        roles: ['superadmin', 'admin', 'finance'],
    },
    {
        title: 'Penerimaan Pembayaran',
        description: 'Kelola opsi penerimaan pembayaran invoice.',
        icon: FileText,
        path: '/settings/payment-receipts',
        roles: ['superadmin', 'admin', 'finance'],
    },
    {
        title: 'Promo & Landing',
        description: 'Kelola promo, banner, dan pengaturan landing page.',
        icon: Megaphone,
        path: '/settings/promo',
        roles: ['superadmin', 'admin'],
    },
    {
        title: 'Master Target Keuangan',
        description: 'Kelola target dan baseline proyeksi keuangan.',
        icon: Target,
        path: '/settings/financial-targets',
        roles: ['superadmin'],
    },
];

function MasterDataPage() {
    const allowed = MASTER_MENU.filter((item) => item.roles.includes(role));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Master Data</h1>
                <p className="text-gray-600">Pusat menu untuk pengaturan data master aplikasi.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {allowed.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition"
                        >
                            <div className="flex items-start gap-3">
                                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                                    <Icon size={20} />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-gray-900">{item.title}</h2>
                                    <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {allowed.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
                    Anda belum memiliki akses ke menu master data.
                </div>
            )}
        </div>
    );
}

export default MasterDataPage;
