import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import { Lock, User, Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle2, Sprout } from 'lucide-react';
import Modal from '../../components/common/Modal';

const GreenstarLogin = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
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

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'super_admin') {
        navigate('/super-admin');
      } else if (user.role === 'company_admin') {
        const code = user.company?.code?.toLowerCase() || 'greenstar';
        navigate(`/admin/${code}`);
      } else {
        navigate('/portal');
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
      const res = await login(identifier, password);
      if (res.success) {
        // Enforce company isolation — Greenstar login only for GSFL users
        if (res.user.role !== 'super_admin' && res.user.company?.code?.toUpperCase() !== 'GSFL') {
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
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #134e4a 0%, #0f766e 40%, #0d9488 70%, #14b8a6 100%)' }}>
      {/* Top navigation bar */}
      <header className="px-6 py-4 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-teal-200 hover:text-white transition text-xs font-semibold">
          <ArrowLeft className="w-4 h-4" />
          Back to Portal
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
            <Sprout className="w-4 h-4 text-white" />
          </div>
          <span className="text-white text-xs font-bold tracking-wide">GREENSTAR ENTERPRISE</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-sm border border-white/30 shadow-2xl mb-5">
              <span className="text-2xl font-black text-white tracking-tighter">GSFL</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Greenstar Portal Login</h1>
            <p className="mt-2 text-teal-200 text-sm font-medium">
              Greenstar Fertilizers Limited (GSFL)
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/30 border border-teal-400/40 text-teal-100 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-300 inline-block animate-pulse" />
              Complex Phosphatic Nutrients
            </div>
          </div>

          {/* Login Card */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 shadow-2xl">
            {errorMsg && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-500/20 border border-red-400/40 text-red-100 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email / Username */}
              <div>
                <label htmlFor="gsfl-identifier" className="block text-xs font-bold uppercase tracking-wider text-teal-100 mb-2">
                  Username or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-teal-300">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="gsfl-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin@gsfl.in"
                    className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/30 rounded-xl text-white placeholder-teal-300/70 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="gsfl-password" className="block text-xs font-bold uppercase tracking-wider text-teal-100">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotSuccess(''); setIsForgotModalOpen(true); }}
                    className="text-xs font-semibold text-teal-200 hover:text-white transition"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-teal-300">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="gsfl-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-11 pr-12 py-3 bg-white/10 border border-white/30 rounded-xl text-white placeholder-teal-300/70 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-teal-300 hover:text-white transition"
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
                className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-teal-900 bg-white hover:bg-teal-50 transition shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Lock className="w-4 h-4" />
                <span>{loading ? 'Authenticating...' : 'Sign In to Greenstar Portal'}</span>
              </button>
            </form>

            {/* Demo Credentials quick-fill */}
            <div className="mt-5 pt-4 border-t border-white/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400/70 mb-2 text-center">Demo Credentials</p>
              <button
                type="button"
                onClick={() => { setIdentifier('gsfl.admin'); setPassword('Gsfl@123'); }}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white/10 rounded-xl border border-white/20 hover:border-teal-400/50 transition"
              >
                <span className="text-xs text-teal-200">Click to auto-fill</span>
                <span className="text-xs font-mono text-white">gsfl.admin / Gsfl@123</span>
              </button>
            </div>

            {/* Footer links */}
            <div className="mt-4 text-center">
              <span className="text-xs text-teal-300">Other company? </span>
              <Link to="/" className="text-xs font-bold text-white hover:text-teal-200 transition">
                Return to Landing Page →
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
