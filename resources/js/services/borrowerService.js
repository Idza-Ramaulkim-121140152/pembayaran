import apiClient from './api';

const borrowerService = {
    getAll: (params = {}) => apiClient.get('/borrowers', { params }),
};

export default borrowerService;
