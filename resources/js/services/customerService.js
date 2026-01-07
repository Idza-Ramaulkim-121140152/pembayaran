import apiClient from './api';
import axios from 'axios';

export const customerService = {
    // Get semua customers
    getAll: () => apiClient.get('/customers'),

    // Get detail customer
    getById: (id) => apiClient.get(`/customers/${id}`),

    // Create customer baru - using axios directly to avoid /api prefix
    create: (data) => axios.post('/pelanggan', data, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
        },
        withCredentials: true,
    }),

    // Create customer dengan file uploads - using axios directly
    createWithFiles: (formData) => axios.post('/pelanggan', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
        },
        withCredentials: true,
    }),

    // Update customer - using axios directly
    update: (id, data) => axios.post(`/pelanggan/${id}/edit`, data, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
        },
        withCredentials: true,
    }),

    // Update customer dengan file uploads - using axios directly
    updateWithFiles: (id, formData) => axios.post(`/pelanggan/${id}/edit`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
        },
        withCredentials: true,
    }),

    // Delete customer
    delete: (id) => apiClient.delete(`/customers/${id}`),

    // Get riwayat pembayaran customer
    getPaymentHistory: (id) => apiClient.get(`/customers/${id}/riwayat`),
};

export default customerService;
