import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import Modal from '../../components/common/Modal';
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowLeft,
  Building,
  CheckCircle2,
  Sparkles,
  HelpCircle,
} from 'lucide-react';

const SuperAdminLogin = () => {
  const navigate = useNavigate();
  const { login, setUser } = useAuth();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Forgot Password Modal state
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!identifier || !password) {
      setErrorMsg('Please enter both your Super Admin identifier and password.');
      return;
    }

    try {
      setLoading(true);

      // Attempt authenticated Super Admin login via backend API
      try {
        const finalSuperAdminUrl = `${api.defaults.baseURL}/super-admin/login`;
        console.log('Super Admin Login API URL:', finalSuperAdminUrl);
        console.log('Login method: POST');

        const apiRes = await api.post('/super-admin/login', {
          username: identifier.trim(),
          password,
        });

        if (apiRes.data?.success && apiRes.data?.token) {
          localStorage.setItem('spic_auth_token', apiRes.data.token);
          const adminUser = {
            username: apiRes.data.user.username,
            name: apiRes.data.user.name || 'Super Admin',
            role: 'super_admin',
          };
          localStorage.setItem('spic_auth_user', JSON.stringify(adminUser));
          if (setUser) setUser(adminUser);
          showToast('Super Admin authenticated successfully', 'success');
          navigate('/super-admin');
          return;
        }
      } catch (backendErr) {
        if (backendErr.response) {
          const status = backendErr.response.status;
          const msg =
            backendErr.response.data?.message ||
            (status === 405
              ? 'Super Admin login returned 405 Method Not Allowed. Check API configuration.'
              : `Super Admin authentication failed (${status}).`);
          setErrorMsg(msg);
          return;
        }
        if (!import.meta.env.DEV) {
          setErrorMsg('Unable to connect to authentication server. Please check your network connection.');
          return;
        }
        console.warn('Backend unavailable in local DEV mode, trying mock fallback:', backendErr.message);
      }

      // Fallback to local auth if backend was unreachable
      const res = await login(identifier, password, 'super_admin');
      if (res.success) {
        showToast('Super Admin authenticated successfully', 'success');
        navigate('/super-admin');
      } else {
        setErrorMsg(res.message || 'Authentication failed. Please verify credentials.');
      }
    } catch (err) {
      setErrorMsg(
        err.response?.data?.message || 'Access denied: Requires Super Admin privileges.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    // Mock mode: simulate sending reset email
    setForgotLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    setForgotSuccess('Password reset instructions have been sent to ' + forgotEmail + ' (demo mode — no email actually sent).');
    setForgotLoading(false);
    showToast('Reset link simulated (demo mode)', 'info');
  };

  return (
    <div className="h-screen max-h-screen relative flex flex-col font-sans selection:bg-blue-600 selection:text-white overflow-hidden">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <img src="/plant-bg.jpg" alt="SPIC Plant Background" className="w-full h-full object-cover object-center filter blur-[4px] scale-105 opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-slate-50/50 to-white/70" />
      </div>


      <div className="flex-1 flex items-center justify-center px-4 py-2 z-10 overflow-hidden">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="flex justify-center items-center gap-6 mb-4">
              <img src="/spic-logo.png" alt="SPIC" className="max-h-12 w-auto object-contain" />
              <img src="/tfl-logo.png" alt="TFL" className="max-h-12 w-auto object-contain" />
              <img src="/greenstar-logo.png" alt="Greenstar" className="max-h-12 w-auto object-contain" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Super Admin Login
            </h2>
            <p className="mt-1 text-xs text-slate-500 font-medium">
              Centralized Administration Portal
            </p>
          </div>
          <div className="bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)]">
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username / Email Field */}
            <div>
              <label
                htmlFor="identifier"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="identifier"
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="QCL_ADMIN"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-2xs font-medium"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotSuccess('');
                    setIsForgotModalOpen(true);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-2xs font-mono font-medium"
                />
                <button
                  type="button"
                  id="btn-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Security Notice */}
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-[11px] text-blue-700 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <span>
                Protected under Zero-Trust RBAC. Access events are cryptographically audited in compliance with corporate IT policies.
              </span>
            </div>

            {/* Submit Button */}
            <button
              id="btn-submit-login"
              type="submit"
              disabled={loading}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition shadow-md shadow-blue-500/25 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Authenticating...' : 'Sign In to Super Admin Portal'}</span>
            </button>
          </form>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        title="Reset Super Admin Password"
      >
        {forgotSuccess ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Recovery Instructions Dispatched</h4>
            <p className="text-xs text-slate-600">{forgotSuccess}</p>
            <button
              type="button"
              onClick={() => setIsForgotModalOpen(false)}
              className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Enter your corporate email address associated with the Super Administrator account to receive a secure password reset link.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Corporate Email Address
              </label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="superadmin@spicglobal.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={forgotLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50"
              >
                {forgotLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default SuperAdminLogin;
