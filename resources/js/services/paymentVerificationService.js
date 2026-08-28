import apiClient from './api';

const paymentVerificationService = {
    getConfig: () => apiClient.get('/billing/payment-verification/config'),
    updateConfig: (payload) => apiClient.put('/billing/payment-verification/config', payload),
    getCaptures: (params = {}) => apiClient.get('/billing/payments/unmatched', { params }),
    resolveCapture: (captureId, payload) => apiClient.post(`/billing/payments/${captureId}/resolve`, payload),
    reanalyzeCapture: (captureId) => apiClient.post(`/billing/payments/${captureId}/reanalyze`),
};

export default paymentVerificationService;
