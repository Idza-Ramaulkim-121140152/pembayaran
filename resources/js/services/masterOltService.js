import apiClient from './api';

const masterOltService = {
    getAll: () => apiClient.get('/master-olts'),
    getById: (id) => apiClient.get(`/master-olts/${id}`),
    create: (payload) => apiClient.post('/master-olts', payload),
    update: (id, payload) => apiClient.put(`/master-olts/${id}`, payload),
    remove: (id) => apiClient.delete(`/master-olts/${id}`),
    activate: (id) => apiClient.patch(`/master-olts/${id}/activate`),
    testSnmp: (id) => apiClient.post(`/master-olts/${id}/test-snmp`),
    updatePonPort: (oltId, portId, payload) => apiClient.put(`/master-olts/${oltId}/pon-ports/${portId}`, payload),
    autoDiscover: (id) => apiClient.post(`/master-olts/${id}/auto-discover`),
    syncTopology: (id) => apiClient.post(`/master-olts/${id}/sync-topology`),
    syncGenieAcs: (oltId = null) => apiClient.post('/super-panel/sync-genieacs', { olt_id: oltId }),
    reassignOnu: (payload) => apiClient.post('/super-panel/reassign-onu', payload),
};

export default masterOltService;
