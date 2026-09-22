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

// Intercept 401 Unauthorized responses to clear stale sessions
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If unauthorized, clear auth and notify user if not on login page
      const currentPath = window.location.pathname;
      if (currentPath !== '/' && !currentPath.includes('/login')) {
        localStorage.removeItem('spic_auth_token');
        localStorage.removeItem('spic_auth_user');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
