import axios from 'axios';

// Ensure baseURL is formatted cleanly without duplicate /api or trailing slash issues
const getBaseURL = () => {
  let envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) {
    return '/api';
  }
  let url = envUrl.trim().replace(/\/+$/, '');
  if (!url.endsWith('/api')) {
    url = `${url}/api`;
  }
  return url;
};

const api = axios.create({
  baseURL: getBaseURL(),
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

      // Specifically intercept PASSWORD_CHANGED so we can display the requested alert modal
      if (
        error.response.data?.code === 'PASSWORD_CHANGED' ||
        error.response.data?.passwordChanged ||
        (typeof error.response.data?.message === 'string' &&
          error.response.data.message.toLowerCase().includes('password has been changed'))
      ) {
        window.dispatchEvent(
          new CustomEvent('auth:password-changed', {
            detail: {
              message: error.response.data?.message || 'Your password has been changed. Please contact admin.',
            },
          })
        );
        return Promise.reject(error);
      }

      if (is401 || is403LicenseOrDisabled) {
        const currentPath = window.location.pathname;
        const requestUrl = error.config?.url || '';
        const isSuperAdminApi = requestUrl.includes('/super-admin');
        const isSuperAdminPage = currentPath.startsWith('/super-admin');

        if (currentPath !== '/' && !currentPath.includes('/login')) {
          localStorage.removeItem('spic_auth_token');
          localStorage.removeItem('spic_auth_user');
          const message = error.response.data?.message || 'Your license has expired. Please contact the Super Admin.';

          if (isSuperAdminApi || isSuperAdminPage) {
            // Super admin 401 → go to super-admin login, not landing page
            window.location.href = `/login/super-admin?expired=true&msg=${encodeURIComponent(message)}`;
          } else {
            window.location.href = `/?expired=true&msg=${encodeURIComponent(message)}`;
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
