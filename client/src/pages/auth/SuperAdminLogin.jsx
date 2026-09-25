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
        const apiRes = await api.post('/super-admin/login', {
          username: identifier.trim(),
          password,
        });

        if (apiRes.data?.success && apiRes.data?.token) {
          localStorage.setItem('spic_auth_token', apiRes.data.token);
          const adminUser = {
            username: apiRes.data.user.username,
            name: 'Super Admin',
            role: 'SUPER_ADMIN',
          };
          localStorage.setItem('spic_auth_user', JSON.stringify(adminUser));
          if (setUser) setUser(adminUser);
          showToast('Super Admin authenticated successfully', 'success');
          navigate('/super-admin');
          return;
        }
      } catch (backendErr) {
        if (backendErr.response?.data?.message) {
          setErrorMsg(backendErr.response.data.message);
          return;
        }
        console.warn('Backend unavailable, trying mock fallback:', backendErr.message);
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
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-purple-600 selection:text-white relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Back to Home Link */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md mb-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Subsidiary Selection</span>
        </Link>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Shield Icon Badge */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-xl shadow-purple-600/30 mb-4 border border-purple-400/30">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Super Admin Console
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-slate-400">
          Central Corporate Governance • SPIC • TFL • Greenstar
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800/80 backdrop-blur-xl py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/80">
          {errorMsg && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username / Email Field */}
            <div>
              <label
                htmlFor="identifier"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
              >
                Username
              </label>
              <div className="relative rounded-xl shadow-sm">
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
                  className="block w-full pl-10 pr-3 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide toggle */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotSuccess('');
                    setIsForgotModalOpen(true);
                  }}
                  className="text-xs font-semibold text-purple-400 hover:text-purple-300 transition"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative rounded-xl shadow-sm">
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
                  className="block w-full pl-10 pr-10 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-mono"
                />
                <button
                  type="button"
                  id="btn-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Security Notice */}
            <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 text-[11px] text-slate-400 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                Protected under Zero-Trust RBAC. Access events are cryptographically audited in compliance with corporate IT policies.
              </span>
            </div>

            {/* Submit Button */}
            <button
              id="btn-submit-login"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition shadow-lg shadow-purple-600/30 disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Authenticating...' : 'Secure Sign In'}</span>
            </button>
          </form>
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
