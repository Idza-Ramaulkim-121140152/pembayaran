import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import apiClient from '../../services/api';

function InstallationPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [leads, setLeads] = useState([]);
    const [workOrders, setWorkOrders] = useState([]);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [leadsRes, woRes] = await Promise.all([
                apiClient.get('/installations/leads', { params: { per_page: 20 } }),
                apiClient.get('/installations/work-orders', { params: { per_page: 20 } }),
            ]);

            setLeads(leadsRes?.data?.data?.data || []);
            setWorkOrders(woRes?.data?.data?.data || []);
        } catch (err) {
            setError('Gagal memuat data workflow instalasi.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Workflow Instalasi</h1>
                <p className="text-gray-600 mt-1">Pipeline lead -&gt; survey -&gt; work order -&gt; aktivasi.</p>
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

            {loading ? (
                <LoadingSpinner text="Memuat workflow instalasi..." />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100">
                            <h2 className="font-semibold text-gray-900">Leads</h2>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {leads.length === 0 ? (
                                <div className="p-4 text-sm text-gray-500">Belum ada lead.</div>
                            ) : leads.map((lead) => (
                                <div key={lead.id} className="p-4">
                                    <p className="font-medium text-gray-900">{lead.name}</p>
                                    <p className="text-sm text-gray-500">{lead.phone || '-'} | {lead.status}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100">
                            <h2 className="font-semibold text-gray-900">Work Orders</h2>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {workOrders.length === 0 ? (
                                <div className="p-4 text-sm text-gray-500">Belum ada work order.</div>
                            ) : workOrders.map((wo) => (
                                <div key={wo.id} className="p-4">
                                    <p className="font-medium text-gray-900">WO #{wo.id} | {wo.status}</p>
                                    <p className="text-sm text-gray-500">{wo.customer?.name || wo.lead?.name || '-'} | {wo.assignee?.name || 'Belum assign'}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default InstallationPage;
