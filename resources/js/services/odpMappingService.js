import apiClient from './api';

const odpMappingService = {
    listCustomers: (params = {}) => apiClient.get('/odp-mapping/customers', { params }),
    assign: (payload) => apiClient.post('/odp-mapping/assign', payload),
    unassign: (payload) => apiClient.post('/odp-mapping/unassign', payload),
    options: () => apiClient.get('/odps/options'),
    createOdp: (payload) => apiClient.post('/odp', payload),
    backfill: () => apiClient.post('/odp-mapping/backfill'),
    qualityAudit: () => apiClient.get('/odp-mapping/quality-audit'),
    getAiSuggestions: (params = {}) => apiClient.get('/odp-mapping/ai-suggestions', { params }),
    applyAiSuggestions: (payload) => apiClient.post('/odp-mapping/ai-apply', payload),
};

export default odpMappingService;
