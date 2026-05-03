import apiClient from './api';

const financialTargetService = {
    list: (params = {}) => apiClient.get('/dashboard/financial-targets', { params }),
    create: (payload) => apiClient.post('/dashboard/financial-targets', payload),
    update: (id, payload) => apiClient.put(`/dashboard/financial-targets/${id}`, payload),
    remove: (id) => apiClient.delete(`/dashboard/financial-targets/${id}`),
};

export default financialTargetService;
