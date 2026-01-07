import apiClient from './api';

export const authService = {
    // Login
    login: (credentials) => apiClient.post('/login', credentials),

    // Register
    register: (data) => apiClient.post('/register', data),

    // Logout
    logout: () => apiClient.post('/logout'),

    // Get current user
    getUser: () => apiClient.get('/user'),

    // Update profile
    updateProfile: (data) => apiClient.patch('/profile', data),

    // Update password
    updatePassword: (data) => apiClient.put('/password', data),

    // Delete account
    deleteAccount: (password) => apiClient.delete('/profile', { data: { password } }),

    // Forgot password
    forgotPassword: (email) => apiClient.post('/forgot-password', { email }),

    // Reset password
    resetPassword: (data) => apiClient.post('/reset-password', data),
};

export default authService;
