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

    // Start auto-invoice async job
    startAutoInvoice: (payload) =>
        apiClient.post('/billing/auto-invoice', payload),

    // Billing automation per customer (superadmin only)
    updateCustomerAutomation: (customerId, billingAutoDisabled) =>
        apiClient.put(`/billing/customers/${customerId}/automation`, {
            billing_auto_disabled: billingAutoDisabled,
        }),

    // Poll auto-invoice async job status
    getAutoInvoiceStatus: (jobId) =>
        apiClient.get(`/billing/auto-invoice/${jobId}`),

    // Update customer service package from billing flow
    updateCustomerServicePackage: (customerId, packageId) =>
        apiClient.patch(`/billing/customer/${customerId}/service-package`, { package_id: packageId }),

    // Konfirmasi pembayaran
    confirmPayment: (
        invoiceId,
        paidAmount,
        paymentReceiptOptionId = null,
        includeInMutation = true,
        paymentReceiverUserId = null,
        options = {}
    ) =>
        apiClient.post(`/billing/invoice/${invoiceId}/confirm`, {
            paid_amount: paidAmount,
            payment_receipt_option_id: paymentReceiptOptionId,
            include_in_mutation: includeInMutation,
            payment_receiver_user_id: paymentReceiverUserId,
            other_receiver_confirmed: options.otherReceiverConfirmed ?? false,
            receiver_conflict_resolution: options.receiverConflictResolution ?? null,
        }),

    // Get selectable payment receivers
    getPaymentReceivers: () =>
        apiClient.get('/payment-receivers'),

    // Get active payment receipt options for receive-via selector
    getActivePaymentReceiptOptions: () =>
        apiClient.get('/payment-receipt-options/active'),

    // Update nominal invoice
    updateInvoiceAmount: (invoiceId, amount) =>
        apiClient.put(`/billing/invoice/${invoiceId}/amount`, { amount }),

    // Fetch payment proof as blob for stable in-app preview
    getPaymentProofBlob: (invoiceId) =>
        apiClient.get(`/billing/invoice/${invoiceId}/payment-proof/blob`, {
            responseType: 'blob',
        }),

    // Fetch payment proof as base64 data URL fallback when direct image rendering fails
    getPaymentProofPreview: (invoiceId) =>
        apiClient.get(`/billing/invoice/${invoiceId}/payment-proof/preview`),


    sendManagedInvoiceWhatsApp: (invoiceId) =>
        apiClient.post(`/billing/invoice-management/${invoiceId}/send-whatsapp`),
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
                'Accept': 'application/json',
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

    // Check isolation status in bulk (for faster table render)
    getBulkIsolationStatus: (customerIds = []) =>
        apiClient.post('/billing/isolation-status-bulk', { customer_ids: customerIds }),
};

export default billingService;
