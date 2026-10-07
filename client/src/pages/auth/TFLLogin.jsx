import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import { Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import Modal from '../../components/common/Modal';

const TFLLogin = () => {
  const navigate = useNavigate();
  const { login, logout, isAuthenticated, user } = useAuth();
  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Redirect if already logged in for TFL
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.company?.code?.toUpperCase() === 'TFL') {
        if (user.role === 'company_admin') {
          navigate('/admin/tfl');
        } else {
          navigate('/portal');
        }
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!identifier || !password) {
      setErrorMsg('Please enter your email/username and password.');
      return;
    }
    try {
      setLoading(true);
      const res = await login(identifier, password, null, 'TFL');
      if (res.success) {
        // Enforce company isolation — TFL login only for TFL users
        if (res.user.role !== 'super_admin' && res.user.company?.code?.toUpperCase() !== 'TFL') {
          logout();
          showToast('Access denied. This login is for TFL users only.', 'error');
          setErrorMsg('Access denied. This portal is for TFL company users only.');
          setLoading(false);
          return;
        }
        showToast(`Welcome, ${res.user.name}!`, 'success');
        if (res.user.role === 'company_admin') {
          navigate('/admin/tfl');
        } else if (res.user.role === 'super_admin') {
          navigate('/super-admin');
        } else {
          navigate('/portal');
        }
      } else {
        setErrorMsg(res.message || 'Invalid credentials.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    // Mock mode
    setForgotLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    setForgotSuccess('Password reset instructions sent to ' + forgotEmail + ' (demo mode)');
    setForgotLoading(false);
  };

  return (
    <div className="h-screen max-h-screen relative flex flex-col font-sans selection:bg-blue-600 selection:text-white overflow-hidden">
      {/* Blurred Industrial Ambient Background - Identical to Landing Page */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <img
          src="/plant-bg.jpg"
          alt="SPIC Plant Background"
          className="w-full h-full object-cover object-center filter blur-[4px] scale-105 opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-slate-50/50 to-white/70" />
      </div>

      {/* Top navigation bar */}
      <header className="px-6 py-3 flex items-center justify-end z-10 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/85 border border-slate-200/90 shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-slate-800 text-xs font-bold tracking-wide">TFL ENTERPRISE</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-2 z-10 overflow-hidden">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)]">
            {/* Real TFL Logo & Header */}
            <div className="text-center mb-6">
              <div className="h-16 w-full flex items-center justify-center mb-3">
                <img
                  src="/tfl-logo.png"
                  alt="Tuticorin Alkali Chemicals and Fertilizers"
                  className="max-h-12 max-w-[210px] w-auto object-contain filter drop-shadow-2xs"
                />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                TFL Portal Login
              </h1>
              <p className="mt-1 text-xs text-slate-500 font-medium">
                Tuticorin Alkali Chemicals and Fertilizers Ltd.
              </p>
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block animate-pulse" />
                <span>Soda Ash &amp; CCU Carbon Recovery</span>
              </div>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email / Username */}
              <div>
                <label htmlFor="tfl-identifier" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Username or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="tfl-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin@tfl.in"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-2xs font-medium"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="tfl-password" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotSuccess(''); setIsForgotModalOpen(true); }}
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
                    id="tfl-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition shadow-2xs font-mono font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                id="btn-tfl-login"
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] transition shadow-md shadow-blue-500/25 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Lock className="w-4 h-4" />
                <span>{loading ? 'Authenticating...' : 'Sign In to TFL Portal'}</span>
              </button>
            </form>

            {/* Footer links */}
            <div className="mt-5 pt-3 border-t border-slate-100 text-center">
              <span className="text-xs text-slate-500">Other company? </span>
              <Link to="/" className="text-xs font-bold text-blue-600 hover:text-blue-800 transition">
                Return to Landing Page
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal isOpen={isForgotModalOpen} onClose={() => setIsForgotModalOpen(false)} title="Reset TFL Account Password">
        {forgotSuccess ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Request Sent</h4>
            <p className="text-xs text-slate-600">{forgotSuccess}</p>
            <button type="button" onClick={() => setIsForgotModalOpen(false)} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold">
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Enter the email address registered to your TFL account.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Corporate Email</label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="admin@tfl.in"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setIsForgotModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={forgotLoading} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
                {forgotLoading ? 'Sending...' : 'Send Reset Email'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default TFLLogin;
