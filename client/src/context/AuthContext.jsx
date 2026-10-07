import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on page load
  useEffect(() => {
    const storedUser = localStorage.getItem('spic_auth_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('spic_auth_user');
      }
    }
    setLoading(false);
  }, []);

  /**
   * Authenticate user with backend API, enforcing License Period, User Limits, and Multi-Tenant Company Isolation.
   * Falls back gracefully if backend is unreachable.
   */
  const login = async (identifier, password, expectedRole = null, companyCode = null) => {
    try {
      const finalLoginUrl = `${api.defaults.baseURL}/auth/login`;
      console.log('Login API URL:', finalLoginUrl);
      console.log('Login method: POST');

      // 1. Attempt backend authentication
      const response = await api.post('/auth/login', {
        identifier: identifier.trim(),
        password,
        expectedRole,
        companyCode,
      });

      if (response.data?.success && response.data?.user) {
        const safeUser = response.data.user;
        if (response.data.token) {
          localStorage.setItem('spic_auth_token', response.data.token);
        }
        setUser(safeUser);
        localStorage.setItem('spic_auth_user', JSON.stringify(safeUser));
        return { success: true, user: safeUser, token: response.data.token };
      }
    } catch (apiErr) {
      // If backend or proxy responded with an HTTP status code (400, 401, 403, 404, 405, 500, etc.)
      if (apiErr.response) {
        const status = apiErr.response.status;
        const message =
          apiErr.response.data?.message ||
          (status === 405
            ? 'Login API returned 405 Method Not Allowed. Please verify VITE_API_URL and API routing.'
            : `Authentication failed (${status}).`);
        return {
          success: false,
          status,
          message,
          licenseStatus: apiErr.response.data?.licenseStatus,
        };
      }

      // If no response received (network error / offline)
      return {
        success: false,
        message: 'Unable to connect to authentication server. Please check your network connection.',
      };
    }

  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('spic_auth_user');
    localStorage.removeItem('spic_auth_token');
  };

  // Real-time session verification heartbeat (detects remote password reset by Super Admin)
  useEffect(() => {
    if (!user || user.role === 'super_admin') return;

    let isSubscribed = true;
    const verifySession = async () => {
      const token = localStorage.getItem('spic_auth_token');
      if (!token) return;
      try {
        await api.get('/auth/me');
      } catch (err) {
        // api.js response interceptor automatically handles PASSWORD_CHANGED and fires custom event
      }
    };

    const intervalId = setInterval(() => {
      if (isSubscribed) verifySession();
    }, 3500);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
    };
  }, [user]);

  /**
   * refreshUser — re-reads from localStorage
   */
  const refreshUser = () => {
    const storedUser = localStorage.getItem('spic_auth_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        token: localStorage.getItem('spic_auth_token') || (user ? 'mock-token' : null),
        isAuthenticated: !!user,
        role: user?.role || null,
        company: user?.company || null,
        plant: user?.plant || null,
        loading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
