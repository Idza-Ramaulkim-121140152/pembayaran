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

    // Upload bukti pembayaran (public)
    uploadPaymentProof: (invoiceId, formData) => 
        apiClient.post(`/invoice/${invoiceId}/confirm`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),
};

export default billingService;
