import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

function NotFoundPage() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="text-center">
                <h1 className="text-9xl font-bold text-gray-200">404</h1>
                <h2 className="text-2xl font-semibold text-gray-700 mt-4">Halaman Tidak Ditemukan</h2>
                <p className="text-gray-500 mt-2">Halaman yang Anda cari tidak tersedia atau telah dipindahkan.</p>
                <div className="mt-8 flex justify-center gap-4">
                    <button
                        onClick={() => window.history.back()}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                    >
                        <ArrowLeft size={16} /> Kembali
                    </button>
                    <Link
                        to="/dashboard"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                        <Home size={16} /> Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default NotFoundPage;
