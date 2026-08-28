import apiClient from './api';

const monthlyBudgetService = {
    get: (month) => apiClient.get('/monthly-budgets', { params: { month } }),
    create: (payload) => apiClient.post('/monthly-budgets', payload),
    update: (id, payload) => apiClient.put(`/monthly-budgets/${id}`, payload),
};

export default monthlyBudgetService;
