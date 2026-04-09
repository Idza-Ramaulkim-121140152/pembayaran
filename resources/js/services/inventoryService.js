import apiClient from './api';

const inventoryService = {
    getSummary: () => apiClient.get('/inventory/summary'),
    getItemOptions: () => apiClient.get('/inventory/items/options'),
    getInstallOptions: () => apiClient.get('/inventory/items/install-options'),
    getMovements: (params = {}) => apiClient.get('/inventory/movements', { params }),
    storeIncoming: (payload) => apiClient.post('/inventory/incoming', payload),
    storeOutgoing: (payload) => apiClient.post('/inventory/outgoing', payload),
    getDebts: (params = {}) => apiClient.get('/inventory/debts', { params }),
    payDebt: (id, payload) => apiClient.post(`/inventory/debts/${id}/pay`, payload),
    payDebtBulk: (payload) => apiClient.post('/inventory/debts/pay-bulk', payload),

    // Master data
    getTypes: () => apiClient.get('/inventory/master/types'),
    createType: (payload) => apiClient.post('/inventory/master/types', payload),
    updateType: (id, payload) => apiClient.put(`/inventory/master/types/${id}`, payload),
    deleteType: (id) => apiClient.delete(`/inventory/master/types/${id}`),

    getItems: (params = {}) => apiClient.get('/inventory/master/items', { params }),
    createItem: (payload) => apiClient.post('/inventory/master/items', payload),
    updateItem: (id, payload) => apiClient.put(`/inventory/master/items/${id}`, payload),
    deleteItem: (id) => apiClient.delete(`/inventory/master/items/${id}`),

    getDefaultPricing: () => apiClient.get('/inventory/master/default-pricing'),
    updateDefaultPricing: (payload) => apiClient.put('/inventory/master/default-pricing', payload),
};

export default inventoryService;
