import apiClient from './api';

export const odpService = {
    // Get semua ODP
    getAll: () => apiClient.get('/api/odp'),

    // Get detail ODP
    getById: (id) => apiClient.get(`/api/odp/${id}`),

    // Create ODP baru
    create: (formData) => apiClient.post('/api/odp', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),

    // Update ODP
    update: (id, formData) => apiClient.post(`/api/odp/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),

    // Delete ODP
    delete: (id) => apiClient.delete(`/api/odp/${id}`),
};

export default odpService;
