import React, { createContext, useContext, useState, useEffect } from 'react';
import { MOCK_USERS } from '../services/mockData';

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
   * Mock login — matches against MOCK_USERS by username OR email + password.
   * No backend call needed.
   */
  const login = async (identifier, password) => {
    // Simulate a tiny delay so it feels real
    await new Promise((r) => setTimeout(r, 600));

    const matched = MOCK_USERS.find(
      (u) =>
        (u.username === identifier.trim() || u.email === identifier.trim()) &&
        u.password === password
    );

    if (matched) {
      if (matched.status === 'inactive') {
        return { success: false, message: 'Your account is inactive. Contact the Super Admin.' };
      }
      // Strip password from stored user object
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
