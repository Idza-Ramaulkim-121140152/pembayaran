import apiClient from './api';

const cashObligationCalendarService = {
    get: (params = {}) => apiClient.get('/cash-obligation-calendar', { params }),
    createManualEntry: (payload) => apiClient.post('/cash-obligation-calendar/manual-entries', payload),
    updateManualEntry: (id, payload) => apiClient.put(`/cash-obligation-calendar/manual-entries/${id}`, payload),
    updateManualEntryStatus: (id, payload) => apiClient.patch(`/cash-obligation-calendar/manual-entries/${id}/status`, payload),
    deleteManualEntry: (id) => apiClient.delete(`/cash-obligation-calendar/manual-entries/${id}`),
};

export default cashObligationCalendarService;
