import apiClient from './api';
import installationPricingService from './installationPricingService';

export const reportService = {
    summary: (params = {}) => apiClient.get('/reports/summary', { params }),
    customerIncome: (params = {}) => apiClient.get('/reports/customer-income', { params }),
    installations: (params = {}) => apiClient.get('/reports/installations', { params }),
    inactiveCustomers: (params = {}) => apiClient.get('/reports/inactive-customers', { params }),
    projectReports: {
        list: () => apiClient.get('/reports/projects'),
        options: () => apiClient.get('/reports/projects/options'),
        detail: (id) => apiClient.get(`/reports/projects/${id}`),
        store: (payload) => apiClient.post('/reports/projects', payload),
        update: (id, payload) => apiClient.put(`/reports/projects/${id}`, payload),
    },
    installationPricing: {
        get: () => installationPricingService.get(),
        store: (payload) => installationPricingService.store(payload),
    },
};

export default reportService;
