import apiClient from './api';

const revenuePredictionService = {
    get: (params = {}) => apiClient.get('/revenue-prediction', { params }),
    recalculate: (params = {}) => apiClient.post('/revenue-prediction/recalculate', {}, { params }),
};

export default revenuePredictionService;
