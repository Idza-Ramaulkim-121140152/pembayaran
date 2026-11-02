import apiClient from './api';
import axios from 'axios';

export const customerDismantleService = {
    /**
     * Get list of customers eligible for equipment dismantling + summary metrics + filter options
     */
    list: (params = {}) => apiClient.get('/customer-dismantle', { params }),

    /**
     * Update dismantle status (siap_dicopot, proses, sudah_dicopot, batal_bayar)
     * Handles notes, retrieved items, technician name, and proof photo.
     */
    updateStatus: (customerId, payload) => {
        if (payload instanceof FormData) {
            return axios.post(`/api/customer-dismantle/${customerId}/status`, payload, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                withCredentials: true,
            });
        }
        return apiClient.post(`/customer-dismantle/${customerId}/status`, payload);
    },

    /**
     * Get WhatsApp share text and metadata for a customer
     */
    getShareText: (customerId) => apiClient.get(`/customer-dismantle/${customerId}/share-text`),
};

export default customerDismantleService;
