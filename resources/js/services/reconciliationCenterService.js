import apiClient from './api';

const reconciliationCenterService = {
    summary: (params = {}) => apiClient.get('/reconciliation-center/summary', { params }),
    issues: (params = {}) => apiClient.get('/reconciliation-center/issues', { params }),
    refresh: () => apiClient.post('/reconciliation-center/refresh'),
    updateStatus: (id, payload) => apiClient.patch(`/reconciliation-center/issues/${id}/status`, payload),
    performAction: (id, action) => apiClient.post(`/reconciliation-center/issues/${id}/actions/${action}`),
};

export default reconciliationCenterService;
