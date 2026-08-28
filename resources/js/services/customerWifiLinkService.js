import apiClient from './api';

const customerWifiLinkService = {
    getAll: () => apiClient.get('/master/customer-wifi-links'),
    createLink: (payload) => apiClient.post('/master/customer-wifi-links', payload),
    updateLink: (id, payload) => apiClient.put(`/master/customer-wifi-links/${id}`, payload),
    deleteLink: (id) => apiClient.delete(`/master/customer-wifi-links/${id}`),
    createIp: (payload) => apiClient.post('/master/customer-wifi-allowed-public-ips', payload),
    updateIp: (id, payload) => apiClient.put(`/master/customer-wifi-allowed-public-ips/${id}`, payload),
    deleteIp: (id) => apiClient.delete(`/master/customer-wifi-allowed-public-ips/${id}`),
};

export default customerWifiLinkService;
