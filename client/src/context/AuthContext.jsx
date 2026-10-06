import React, { createContext, useContext, useState, useEffect } from 'react';
import { MOCK_USERS } from '../services/mockData';
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
      // If backend explicitly rejected (e.g. License not started, License expired, disabled, or wrong company 403)
      if (apiErr.response?.data?.message) {
        return {
          success: false,
          status: apiErr.response.status,
          message: apiErr.response.data.message,
          licenseStatus: apiErr.response.data.licenseStatus,
        };
      }
      console.warn('Backend login unavailable, checking local records:', apiErr.message);
    }

    // 2. Fallback to mock data if offline
    await new Promise((r) => setTimeout(r, 400));
    const matched = MOCK_USERS.find(
      (u) =>
        (u.username?.toLowerCase() === identifier.trim().toLowerCase() ||
          u.email?.toLowerCase() === identifier.trim().toLowerCase()) &&
        u.password === password
    );

    if (matched) {
      if (matched.status === 'inactive' || matched.status === 'disabled') {
        return { success: false, message: 'Your account has been disabled. Please contact administrator.' };
      }

      // Role check
      if (expectedRole && matched.role !== expectedRole) {
        return {
          success: false,
          message: `Unauthorized portal. This portal requires ${expectedRole.replace('_', ' ')} privileges.`,
        };
      }

      // Company isolation check
      if (companyCode && matched.role !== 'super_admin') {
        const userCompanyCode = (matched.company?.code || matched.company || '').toString().toUpperCase();
        const reqCompanyCode = companyCode.trim().toUpperCase();
        if (userCompanyCode !== reqCompanyCode) {
          const compName = matched.company?.name || userCompanyCode || 'another company';
          return {
            success: false,
            message: `Access denied. This account is registered under ${compName}. You cannot log in to the ${reqCompanyCode} portal.`,
          };
        }
      }

      const { password: _, ...safeUser } = matched;
      setUser(safeUser);
      localStorage.setItem('spic_auth_user', JSON.stringify(safeUser));
      return { success: true, user: safeUser };
    }

    return { success: false, message: 'Invalid username/email or password.' };
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
