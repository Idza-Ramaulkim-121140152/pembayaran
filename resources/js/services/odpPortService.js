import apiClient from './api';

const odpPortService = {
    getPortsSummary: (odpId) => apiClient.get(`/odp/${odpId}/ports-summary`),
    lookupByCode: (code) => apiClient.get(`/odp/lookup-code/${encodeURIComponent(code)}`),
    assignPort: (odpId, payload) => apiClient.post(`/odp/${odpId}/ports/assign`, payload),
    unassignPort: (odpId, payload) => apiClient.post(`/odp/${odpId}/ports/unassign`, payload),
    swapPort: (odpId, payload) => apiClient.post(`/odp/${odpId}/ports/swap`, payload),
    autoAssignPorts: (odpId) => apiClient.post(`/odp/${odpId}/ports/auto-assign`),
    autoAssignAllPorts: () => apiClient.post('/odp/ports/auto-assign-all'),
    getCustomers: (params = {}) => apiClient.get('/customers', { params }),
    getOdps: (params = {}) => apiClient.get('/odp', { params }),
};

export default odpPortService;
