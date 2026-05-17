import apiClient from './api';

const customerPackageManagementService = {
    summary: (params = {}) => apiClient.get('/customer-package-management/summary', { params }),
    customers: (params = {}) => apiClient.get('/customer-package-management/customers', { params }),
    pppoeSecrets: (params = {}) => apiClient.get('/customer-package-management/pppoe-secrets', { params }),
    resolveSystemToMikrotik: (customerId) =>
        apiClient.post(`/customer-package-management/${customerId}/resolve-system-to-mikrotik`),
    resolveMikrotikToSystem: (customerId) =>
        apiClient.post(`/customer-package-management/${customerId}/resolve-mikrotik-to-system`),
    createPppoe: (customerId) =>
        apiClient.post(`/customer-package-management/${customerId}/pppoe/create`),
    linkPppoe: (customerId, payload) =>
        apiClient.post(`/customer-package-management/${customerId}/pppoe/link`, payload),
    assignPackage: (customerId, payload) =>
        apiClient.post(`/customer-package-management/${customerId}/assign-package`, payload),
    ignore: (customerId, payload) =>
        apiClient.post(`/customer-package-management/${customerId}/ignore`, payload),
    unignore: (customerId, payload) =>
        apiClient.delete(`/customer-package-management/${customerId}/ignore`, { data: payload }),
};

export default customerPackageManagementService;

