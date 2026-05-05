import apiClient from './api';

const masterMikrotikService = {
    getAll: () => apiClient.get('/master-mikrotik'),
    create: (payload) => apiClient.post('/master-mikrotik', payload),
    update: (id, payload) => apiClient.put(`/master-mikrotik/${id}`, payload),
    remove: (id) => apiClient.delete(`/master-mikrotik/${id}`),
    activate: (id) => apiClient.patch(`/master-mikrotik/${id}/activate`),
    testConnection: (id) => apiClient.post(`/master-mikrotik/${id}/test-connection`),
};

export default masterMikrotikService;
