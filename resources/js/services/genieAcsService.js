import apiClient from './api';

const genieAcsService = {
    getDevices: (params = {}) => apiClient.get('/genieacs/devices', { params }),
    getDevice: (deviceId) => apiClient.get(`/genieacs/devices/${encodeURIComponent(deviceId)}`),
    updateWifi: (deviceId, payload) => apiClient.post(`/genieacs/devices/${encodeURIComponent(deviceId)}/wifi`, payload),
    rebootDevice: (deviceId) => apiClient.post(`/genieacs/devices/${encodeURIComponent(deviceId)}/reboot`),
    refreshDevice: (deviceId) => apiClient.post(`/genieacs/devices/${encodeURIComponent(deviceId)}/refresh`),
    assignCustomer: (deviceId, customerId) => apiClient.post(`/genieacs/devices/${encodeURIComponent(deviceId)}/assign-customer`, { customer_id: customerId }),
    sendPortalLinkWa: (payload) => apiClient.post('/genieacs/send-portal-link', payload),
    getCustomers: (params = {}) => apiClient.get('/customers', { params }),
};

export default genieAcsService;
