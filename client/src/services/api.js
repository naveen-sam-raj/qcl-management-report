import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token from localStorage to every outgoing request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('spic_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercept 401 Unauthorized or 403 License Expired responses to clear stale sessions
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const is401 = error.response.status === 401;
      const is403LicenseOrDisabled =
        error.response.status === 403 &&
        (error.response.data?.licenseExpired ||
          (typeof error.response.data?.message === 'string' &&
            (error.response.data.message.toLowerCase().includes('license') ||
              error.response.data.message.toLowerCase().includes('disabled'))));

      if (is401 || is403LicenseOrDisabled) {
        const currentPath = window.location.pathname;
        if (currentPath !== '/' && !currentPath.includes('/login')) {
          localStorage.removeItem('spic_auth_token');
          localStorage.removeItem('spic_auth_user');
          const message = error.response.data?.message || 'Your license has expired. Please contact the Super Admin.';
          window.location.href = `/?expired=true&msg=${encodeURIComponent(message)}`;
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
