import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import { Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import Modal from '../../components/common/Modal';

const GreenstarLogin = () => {
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

  // Redirect if already logged in for GSFL
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.company?.code?.toUpperCase() === 'GSFL') {
        if (user.role === 'company_admin') {
          navigate('/admin/greenstar');
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
      const res = await login(identifier, password, null, 'GSFL');
      if (res.success) {
        // Enforce company isolation — Greenstar login only for GSFL users
        if (res.user.role !== 'super_admin' && res.user.company?.code?.toUpperCase() !== 'GSFL') {
          logout();
          showToast('Access denied. This login is for Greenstar (GSFL) users only.', 'error');
          setErrorMsg('Access denied. This portal is for Greenstar (GSFL) company users only.');
          setLoading(false);
          return;
        }
        showToast(`Welcome, ${res.user.name}!`, 'success');
        if (res.user.role === 'company_admin') {
          navigate('/admin/greenstar');
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
    <div className="h-screen max-h-screen relative flex flex-col font-sans selection:bg-teal-600 selection:text-white overflow-hidden">
      {/* Blurred Industrial Ambient Background - Identical to Landing Page */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <img
          src="/plant-bg.jpg"
          alt="SPIC Plant Background"
          className="w-full h-full object-cover object-center filter blur-[4px] scale-105 opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-slate-50/50 to-teal-50/70" />
      </div>

      {/* Top navigation bar */}
      <header className="px-6 py-3 flex items-center justify-end z-10 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/85 border border-slate-200/90 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-teal-500" />
          <span className="text-slate-800 text-xs font-bold tracking-wide">GREENSTAR ENTERPRISE</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-2 z-10 overflow-hidden">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="bg-white/95 backdrop-blur-2xl border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)]">
            {/* Real Greenstar Logo & Header */}
            <div className="text-center mb-6">
              <div className="h-16 w-full flex items-center justify-center mb-3">
                <img
                  src="/greenstar-logo.png"
                  alt="Greenstar Fertilizers Limited"
                  className="max-h-12 max-w-[210px] w-auto object-contain filter drop-shadow-2xs"
                />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Greenstar Portal Login
              </h1>
              <p className="mt-1 text-xs text-slate-500 font-medium">
                Greenstar Fertilizers Limited (GSFL)
              </p>
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 inline-block animate-pulse" />
                <span>Complex Phosphatic Nutrients</span>
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
                <label htmlFor="gsfl-identifier" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Username or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="gsfl-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin@gsfl.in"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition shadow-2xs font-medium"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="gsfl-password" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotSuccess(''); setIsForgotModalOpen(true); }}
                    className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="gsfl-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition shadow-2xs font-mono font-medium"
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
                id="btn-gsfl-login"
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 active:scale-[0.99] transition shadow-md shadow-teal-500/25 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Lock className="w-4 h-4" />
                <span>{loading ? 'Authenticating...' : 'Sign In to Greenstar Portal'}</span>
              </button>
            </form>

            {/* Footer links */}
            <div className="mt-5 pt-3 border-t border-slate-100 text-center">
              <span className="text-xs text-slate-500">Other company? </span>
              <Link to="/" className="text-xs font-bold text-teal-600 hover:text-teal-800 transition">
                Return to Landing Page
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal isOpen={isForgotModalOpen} onClose={() => setIsForgotModalOpen(false)} title="Reset Greenstar Account Password">
        {forgotSuccess ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Request Sent</h4>
            <p className="text-xs text-slate-600">{forgotSuccess}</p>
            <button type="button" onClick={() => setIsForgotModalOpen(false)} className="mt-3 px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-semibold">
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Enter the email address registered to your Greenstar (GSFL) account.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Corporate Email</label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="admin@gsfl.in"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setIsForgotModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={forgotLoading} className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50">
                {forgotLoading ? 'Sending...' : 'Send Reset Email'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default GreenstarLogin;
