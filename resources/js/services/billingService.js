import axios from 'axios';
import apiClient from './api';

export const billingService = {
    // Get billing data (customers dengan status pembayaran)
    getAll: (params = {}) => apiClient.get('/billing', { params }),

    // Get active packages for billing amount suggestion
    getActivePackages: () => apiClient.get('/packages/active'),

    // Create invoice untuk customer
    createInvoice: (customerId, amount) => 
        apiClient.post(`/billing/${customerId}/create-invoice`, { amount }),

    // Update customer service package from billing flow
    updateCustomerServicePackage: (customerId, packageId) =>
        apiClient.patch(`/billing/customer/${customerId}/service-package`, { package_id: packageId }),

    // Konfirmasi pembayaran
    confirmPayment: (invoiceId, paidAmount, paymentReceiptOptionId = null) =>
        apiClient.post(`/billing/invoice/${invoiceId}/confirm`, {
            paid_amount: paidAmount,
            payment_receipt_option_id: paymentReceiptOptionId,
        }),

    // Get active payment receipt options for receive-via selector
    getActivePaymentReceiptOptions: () =>
        apiClient.get('/payment-receipt-options/active'),

    // Update nominal invoice
    updateInvoiceAmount: (invoiceId, amount) =>
        apiClient.put(`/billing/invoice/${invoiceId}/amount`, { amount }),

    // Superadmin invoice management
    getInvoiceManagement: (params = {}) =>
        apiClient.get('/billing/invoice-management', { params }),

    updateManagedInvoice: (invoiceId, payload) =>
        apiClient.put(`/billing/invoice-management/${invoiceId}`, payload),

    deleteManagedInvoice: (invoiceId) =>
        apiClient.delete(`/billing/invoice-management/${invoiceId}`),

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
