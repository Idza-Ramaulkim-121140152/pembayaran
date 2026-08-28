import apiClient from './api';

const installationPricingService = {
    get: () => apiClient.get('/master/installation-pricing'),
    store: (payload) => apiClient.post('/master/installation-pricing', payload),
};

export default installationPricingService;
