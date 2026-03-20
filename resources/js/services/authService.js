import axios from 'axios';
import apiClient from './api';

// Auth routes live at / (not /api/), so use a separate client
const authClient = axios.create({
    baseURL: '/',
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

authClient.interceptors.request.use((config) => {
    const token = document.querySelector('meta[name="csrf-token"]');
    if (token) {
        config.headers['X-CSRF-TOKEN'] = token.getAttribute('content');
    }
    return config;
});

export const authService = {
    // Login
    login: (credentials) => authClient.post('/login', credentials),

    // Register
    register: (data) => authClient.post('/register', data),

    // Logout
    logout: () => authClient.post('/logout'),

    // Get current user (this one is at /api/user)
    getUser: () => apiClient.get('/user'),

    // Update profile
    updateProfile: (data) => authClient.patch('/profile', data),

    // Update password
    updatePassword: (data) => authClient.put('/password', data),

    // Delete account
    deleteAccount: (password) => authClient.delete('/profile', { data: { password } }),

    // Forgot password
    forgotPassword: (email) => authClient.post('/forgot-password', { email }),

    // Reset password
    resetPassword: (data) => authClient.post('/reset-password', data),
};

export default authService;
