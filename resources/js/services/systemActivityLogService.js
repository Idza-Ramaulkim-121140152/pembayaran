import apiClient from './api';

const systemActivityLogService = {
    list: (params = {}) => apiClient.get('/system-activity-logs', { params }),
};

export default systemActivityLogService;
