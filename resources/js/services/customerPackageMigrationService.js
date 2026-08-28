import apiClient from './api';

const customerPackageMigrationService = {
    preview: (params = {}) => apiClient.get('/customer-package-migration/preview', { params }),
    run: (payload) => apiClient.post('/customer-package-migration/run', payload),
};

export default customerPackageMigrationService;
