import apiClient from './api';

export const odpService = {
    // Get semua ODP
    getAll: () => apiClient.get('/odp'),

    // Get detail ODP
    getById: (id) => apiClient.get(`/odp/${id}`),

    // Create ODP baru
    create: (formData) => apiClient.post('/odp', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),

    // Update ODP
    update: (id, formData) => apiClient.post(`/odp/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),

    // Delete ODP
    delete: (id) => apiClient.delete(`/odp/${id}`),
};

export default odpService;
