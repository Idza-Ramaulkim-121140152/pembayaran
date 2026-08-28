import apiClient from './api';

const customerAccountService = {
    list: (params = {}) => apiClient.get('/customer-accounts', { params }),
    update: (customerId, payload) => apiClient.patch(`/customer-accounts/${customerId}`, payload),
    setPassword: (customerId, payload) => apiClient.post(`/customer-accounts/${customerId}/set-password`, payload),
    resetPassword: (customerId) => apiClient.post(`/customer-accounts/${customerId}/reset-password`),
    updateLoginStatus: (customerId, portalLoginEnabled) =>
        apiClient.patch(`/customer-accounts/${customerId}/login-status`, { portal_login_enabled: portalLoginEnabled }),
};

export default customerAccountService;
