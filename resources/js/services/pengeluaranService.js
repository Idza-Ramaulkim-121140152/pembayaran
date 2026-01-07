import apiClient from './api';

export const pengeluaranService = {
    // Get semua pengeluaran
    getAll: (params = {}) => apiClient.get('/pengeluaran', { params }),

    // Create pengeluaran baru
    create: (data) => apiClient.post('/pengeluaran', data),

    // Update pengeluaran
    update: (id, data) => apiClient.put(`/pengeluaran/${id}`, data),

    // Delete pengeluaran
    delete: (id) => apiClient.delete(`/pengeluaran/${id}`),
};

export default pengeluaranService;
