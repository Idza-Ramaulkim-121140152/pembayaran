import axios from 'axios';

// Buat instance axios dengan config default
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

// Interceptor untuk menambahkan token CSRF
apiClient.interceptors.request.use((config) => {
    const token = document.querySelector('meta[name="csrf-token"]');
    if (token) {
        config.headers['X-CSRF-TOKEN'] = token.getAttribute('content');
    }
    return config;
});

// Interceptor untuk handle error
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 || error.response?.status === 419) {
            // Redirect ke login jika sesi/CSRF sudah kedaluwarsa atau unauthorized
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default apiClient;
