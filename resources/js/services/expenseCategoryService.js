import apiClient from './api';

const expenseCategoryService = {
    getAll: () => apiClient.get('/expense-categories'),
    create: (payload) => apiClient.post('/expense-categories', payload),
    update: (id, payload) => apiClient.put(`/expense-categories/${id}`, payload),
    delete: (id) => apiClient.delete(`/expense-categories/${id}`),
};

export default expenseCategoryService;
