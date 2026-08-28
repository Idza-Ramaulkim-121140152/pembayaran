import { useEffect, useState } from 'react';
import { Edit2, Globe2, Link2, Plus, Trash2 } from 'lucide-react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import customerWifiLinkService from '../../services/customerWifiLinkService';

const LINK_FORM = {
    title: '',
    url: '',
    description: '',
    sort_order: 0,
    is_active: true,
};

const IP_FORM = {
    ip_address: '',
    notes: '',
    is_active: true,
};

function StatusBadge({ active }) {
    return (
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
            {active ? 'Aktif' : 'Nonaktif'}
        </span>
    );
}

function CustomerWifiLinksPage() {
    const [links, setLinks] = useState([]);
    const [ips, setIps] = useState([]);
    const [summary, setSummary] = useState({ active_link_count: 0, active_ip_count: 0 });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [linkModal, setLinkModal] = useState({ open: false, item: null });
    const [ipModal, setIpModal] = useState({ open: false, item: null });
    const [linkForm, setLinkForm] = useState(LINK_FORM);
    const [ipForm, setIpForm] = useState(IP_FORM);

    const fetchData = async () => {
        try {
            setLoading(true);
            const response = await customerWifiLinkService.getAll();
            setLinks(Array.isArray(response.data?.links) ? response.data.links : []);
            setIps(Array.isArray(response.data?.allowed_public_ips) ? response.data.allowed_public_ips : []);
            setSummary(response.data?.summary || { active_link_count: 0, active_ip_count: 0 });
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal memuat master link WiFi pelanggan.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const openLinkModal = (item = null) => {
        setLinkForm(item ? {
            title: item.title || '',
            url: item.url || '',
            description: item.description || '',
            sort_order: Number(item.sort_order || 0),
            is_active: Boolean(item.is_active),
        } : LINK_FORM);
        setLinkModal({ open: true, item });
    };

    const openIpModal = (item = null) => {
        setIpForm(item ? {
            ip_address: item.ip_address || '',
            notes: item.notes || '',
            is_active: Boolean(item.is_active),
        } : IP_FORM);
        setIpModal({ open: true, item });
    };

    const saveLink = async (event) => {
        event.preventDefault();
        try {
            setSubmitting(true);
            const response = linkModal.item
                ? await customerWifiLinkService.updateLink(linkModal.item.id, linkForm)
                : await customerWifiLinkService.createLink(linkForm);
            setSuccess(response.data?.message || 'Link WiFi pelanggan berhasil disimpan.');
            setLinkModal({ open: false, item: null });
            await fetchData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan link WiFi pelanggan.');
        } finally {
            setSubmitting(false);
        }
    };

    const saveIp = async (event) => {
        event.preventDefault();
        try {
            setSubmitting(true);
            const response = ipModal.item
                ? await customerWifiLinkService.updateIp(ipModal.item.id, ipForm)
                : await customerWifiLinkService.createIp(ipForm);
            setSuccess(response.data?.message || 'IP publik valid berhasil disimpan.');
            setIpModal({ open: false, item: null });
            await fetchData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menyimpan IP publik valid.');
        } finally {
            setSubmitting(false);
        }
    };

    const deleteLink = async (item) => {
        if (!window.confirm(`Hapus link "${item.title}"?`)) return;
        try {
            const response = await customerWifiLinkService.deleteLink(item.id);
            setSuccess(response.data?.message || 'Link berhasil dihapus.');
            await fetchData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus link.');
        }
    };

    const deleteIp = async (item) => {
        if (!window.confirm(`Hapus IP "${item.ip_address}"?`)) return;
        try {
            const response = await customerWifiLinkService.deleteIp(item.id);
            setSuccess(response.data?.message || 'IP publik berhasil dihapus.');
            await fetchData();
        } catch (err) {
            setError(err.response?.data?.message || 'Gagal menghapus IP publik.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-600">Master Portal Pelanggan</p>
                    <h1 className="mt-2 text-2xl font-bold text-gray-900">Master Link WiFi Rumah</h1>
                    <p className="mt-1 text-gray-600">Kelola link ubah password WiFi dan daftar IP publik yang boleh mengakses link tersebut.</p>
                </div>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} onClose={() => setSuccess(null)} />}

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-white p-3 text-blue-600"><Link2 size={22} /></div>
                        <div>
                            <p className="text-sm text-blue-700">Link aktif</p>
                            <p className="text-2xl font-bold text-blue-950">{summary.active_link_count || 0}</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-white p-3 text-emerald-600"><Globe2 size={22} /></div>
                        <div>
                            <p className="text-sm text-emerald-700">IP publik aktif</p>
                            <p className="text-2xl font-bold text-emerald-950">{summary.active_ip_count || 0}</p>
                        </div>
                    </div>
                </div>
            </div>

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Daftar Link</h2>
                        <p className="text-sm text-gray-600">Link aktif akan tampil di portal pelanggan.</p>
                    </div>
                    <Button onClick={() => openLinkModal()}><Plus size={16} className="mr-2" />Tambah Link</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                            <tr>
                                <th className="px-5 py-3">Judul</th>
                                <th className="px-5 py-3">URL</th>
                                <th className="px-5 py-3">Urutan</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td className="px-5 py-4 text-gray-500" colSpan={5}>Memuat...</td></tr>
                            ) : links.length === 0 ? (
                                <tr><td className="px-5 py-4 text-gray-500" colSpan={5}>Belum ada link.</td></tr>
                            ) : links.map((item) => (
                                <tr key={item.id}>
                                    <td className="px-5 py-4">
                                        <p className="font-semibold text-gray-900">{item.title}</p>
                                        {item.description && <p className="mt-1 text-xs text-gray-500">{item.description}</p>}
                                    </td>
                                    <td className="max-w-md px-5 py-4 font-mono text-xs text-blue-700 break-all">{item.url}</td>
                                    <td className="px-5 py-4">{item.sort_order}</td>
                                    <td className="px-5 py-4"><StatusBadge active={item.is_active} /></td>
                                    <td className="px-5 py-4">
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="secondary" onClick={() => openLinkModal(item)}><Edit2 size={14} /></Button>
                                            <Button size="sm" variant="danger" onClick={() => deleteLink(item)}><Trash2 size={14} /></Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-gray-100 p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">IP Publik Valid</h2>
                        <p className="text-sm text-gray-600">Pelanggan harus memakai IP ini agar tombol link aktif.</p>
                    </div>
                    <Button onClick={() => openIpModal()}><Plus size={16} className="mr-2" />Tambah IP</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                            <tr>
                                <th className="px-5 py-3">IP Publik</th>
                                <th className="px-5 py-3">Catatan</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td className="px-5 py-4 text-gray-500" colSpan={4}>Memuat...</td></tr>
                            ) : ips.length === 0 ? (
                                <tr><td className="px-5 py-4 text-gray-500" colSpan={4}>Belum ada IP publik valid.</td></tr>
                            ) : ips.map((item) => (
                                <tr key={item.id}>
                                    <td className="px-5 py-4 font-mono font-semibold text-gray-900">{item.ip_address}</td>
                                    <td className="px-5 py-4 text-gray-600">{item.notes || '-'}</td>
                                    <td className="px-5 py-4"><StatusBadge active={item.is_active} /></td>
                                    <td className="px-5 py-4">
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="secondary" onClick={() => openIpModal(item)}><Edit2 size={14} /></Button>
                                            <Button size="sm" variant="danger" onClick={() => deleteIp(item)}><Trash2 size={14} /></Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <Modal isOpen={linkModal.open} onClose={() => setLinkModal({ open: false, item: null })} title={linkModal.item ? 'Edit Link WiFi' : 'Tambah Link WiFi'} theme="dashboard">
                <form onSubmit={saveLink} className="space-y-4">
                    <input className="w-full rounded-lg border px-3 py-2" value={linkForm.title} onChange={(e) => setLinkForm((p) => ({ ...p, title: e.target.value }))} placeholder="Nama link" required />
                    <input className="w-full rounded-lg border px-3 py-2" value={linkForm.url} onChange={(e) => setLinkForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://contoh.com/ubah-wifi" required />
                    <textarea className="w-full rounded-lg border px-3 py-2" rows={3} value={linkForm.description} onChange={(e) => setLinkForm((p) => ({ ...p, description: e.target.value }))} placeholder="Deskripsi opsional" />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <input className="w-full rounded-lg border px-3 py-2" type="number" min="0" value={linkForm.sort_order} onChange={(e) => setLinkForm((p) => ({ ...p, sort_order: Number(e.target.value) }))} placeholder="Urutan" />
                        <select className="w-full rounded-lg border px-3 py-2" value={linkForm.is_active ? '1' : '0'} onChange={(e) => setLinkForm((p) => ({ ...p, is_active: e.target.value === '1' }))}>
                            <option value="1">Aktif</option>
                            <option value="0">Nonaktif</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setLinkModal({ open: false, item: null })}>Batal</Button>
                        <Button type="submit" disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={ipModal.open} onClose={() => setIpModal({ open: false, item: null })} title={ipModal.item ? 'Edit IP Publik' : 'Tambah IP Publik'} theme="dashboard">
                <form onSubmit={saveIp} className="space-y-4">
                    <input className="w-full rounded-lg border px-3 py-2" value={ipForm.ip_address} onChange={(e) => setIpForm((p) => ({ ...p, ip_address: e.target.value }))} placeholder="Contoh: 103.123.45.67" required />
                    <textarea className="w-full rounded-lg border px-3 py-2" rows={3} value={ipForm.notes} onChange={(e) => setIpForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Catatan opsional" />
                    <select className="w-full rounded-lg border px-3 py-2" value={ipForm.is_active ? '1' : '0'} onChange={(e) => setIpForm((p) => ({ ...p, is_active: e.target.value === '1' }))}>
                        <option value="1">Aktif</option>
                        <option value="0">Nonaktif</option>
                    </select>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIpModal({ open: false, item: null })}>Batal</Button>
                        <Button type="submit" disabled={submitting}>{submitting ? 'Menyimpan...' : 'Simpan'}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

export default CustomerWifiLinksPage;
