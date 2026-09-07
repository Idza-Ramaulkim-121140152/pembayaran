import apiClient from './api';

const masterOltService = {
    getAll: () => apiClient.get('/master-olts'),
    getById: (id) => apiClient.get(`/master-olts/${id}`),
    create: (payload) => apiClient.post('/master-olts', payload),
    update: (id, payload) => apiClient.put(`/master-olts/${id}`, payload),
    remove: (id) => apiClient.delete(`/master-olts/${id}`),
    activate: (id) => apiClient.patch(`/master-olts/${id}/activate`),
    toggleSimulation: (id) => apiClient.post(`/master-olts/${id}/toggle-simulation`),
    testSnmp: (id) => apiClient.post(`/master-olts/${id}/test-snmp`),
    updatePonPort: (oltId, portId, payload) => apiClient.put(`/master-olts/${oltId}/pon-ports/${portId}`, payload),
    syncTopology: (id) => apiClient.post(`/master-olts/${id}/sync-topology`),
};

export default masterOltService;
