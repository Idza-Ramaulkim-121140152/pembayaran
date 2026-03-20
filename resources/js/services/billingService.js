import axios from 'axios';
import apiClient from './api';

export const billingService = {
    // Get billing data (customers dengan status pembayaran)
    getAll: (params = {}) => apiClient.get('/billing', { params }),

    // Create invoice untuk customer
    createInvoice: (customerId, amount) => 
        apiClient.post(`/billing/${customerId}/create-invoice`, { amount }),

    // Konfirmasi pembayaran
    confirmPayment: (invoiceId, paidAmount) => 
        apiClient.post(`/billing/invoice/${invoiceId}/confirm`, { paid_amount: paidAmount }),

    // Tolak pembayaran
    rejectPayment: (invoiceId, reason) => 
        apiClient.post(`/billing/invoice/${invoiceId}/reject`, { reason }),

    // Get invoice by link (public)
    getInvoiceByLink: (link) => apiClient.get(`/invoice/${link}`),

    // Upload bukti pembayaran (public - no /api prefix)
    uploadPaymentProof: (invoiceId, formData) => {
        const token = document.querySelector('meta[name="csrf-token"]');
        return axios.post(`/invoice/${invoiceId}/konfirmasi`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'X-CSRF-TOKEN': token ? token.getAttribute('content') : '',
                'X-Requested-With': 'XMLHttpRequest',
            },
            withCredentials: true,
        });
    },

    // Isolate customer
    isolateCustomer: (customerId) => 
        apiClient.post(`/billing/customer/${customerId}/isolate`),

    // Check isolation status
    checkIsolationStatus: (customerId) => 
        apiClient.get(`/billing/customer/${customerId}/isolation-status`),
};

export default billingService;
