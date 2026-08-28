import apiClient from './api';
import axios from 'axios';

export const customerService = {
    // Get semua customers
    getAll: (params = {}) => apiClient.get('/customers', { params }),

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

    // Give compensation (update due date)
    giveCompensation: (id, dueDate) => apiClient.post(`/customers/${id}/compensation`, { due_date: dueDate }),

    // Get active packages for customer service package change
    getActivePackages: () => apiClient.get('/packages/active'),

    // Update customer service package with MikroTik sync
    updateServicePackage: (id, packageId) =>
        apiClient.patch(`/customers/${id}/service-package`, { package_id: packageId }),

    getWifiDevice: (id) => apiClient.get(`/customers/${id}/wifi/device`),

    updateWifiPassword: (id, data) => apiClient.post(`/customers/${id}/wifi/password`, data),

    getWifiPasswordVerification: (id, verificationId) =>
        apiClient.get(`/customers/${id}/wifi/password-verifications/${verificationId}`),

    // Get active/inactive status in bulk without blocking initial list render
    getActiveStatusBulk: (customerIds = []) =>
        apiClient.post('/customers/active-status', { customer_ids: customerIds }),

    getContracts: (id) => apiClient.get(`/customers/${id}/contracts`),

    generateContract: (id, formData) => apiClient.post(`/customers/${id}/contracts`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    }),

    sendContractWhatsApp: (id, contractId) =>
        apiClient.post(`/customers/${id}/contracts/${contractId}/send-whatsapp`),

    getTerminations: (id) => apiClient.get(`/customers/${id}/termination`),

    createTermination: (id, data) => apiClient.post(`/customers/${id}/termination`, data),

    sendTerminationWhatsApp: (id, terminationId) =>
        apiClient.post(`/customers/${id}/termination/${terminationId}/send-whatsapp`),

    finalizeTermination: (id, terminationId) =>
        apiClient.post(`/customers/${id}/termination/${terminationId}/finalize`),

    cancelTermination: (id, terminationId) =>
        apiClient.post(`/customers/${id}/termination/${terminationId}/cancel`),
};

export default customerService;
