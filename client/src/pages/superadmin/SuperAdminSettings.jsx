import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import api from '../../services/api';
import {
  Shield,
  User,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ArrowLeft,
  Check,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Building2,
} from 'lucide-react';

const SuperAdminSettings = () => {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ── Username State ──
  const [currentUsername, setCurrentUsername] = useState(user?.username || 'QCL_ADMIN');
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [showUsernamePassword, setShowUsernamePassword] = useState(false);
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState({ type: '', text: '' });

  // ── Password State ──
  const [currPassword, setCurrPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrPassword, setShowCurrPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });

  // ── Verify session on mount ──
  useEffect(() => {
    const token = localStorage.getItem('spic_auth_token');
    if (!token) {
      navigate('/login/super-admin', { replace: true });
      return;
    }

    // Fetch current Super Admin profile
    api
      .get('/super-admin/me')
      .then((res) => {
        if (res.data?.success && res.data.user) {
          setCurrentUsername(res.data.user.username);
        }
      })
      .catch(() => {
        // If token expired or invalid, redirect to login
        logout();
        navigate('/login/super-admin', { replace: true });
      });
  }, [navigate, logout]);

  // ── Password Validation Rules ──
  const passwordChecks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(newPassword),
    match: newPassword && confirmPassword && newPassword === confirmPassword,
  };

  // ── Change Username Handler ──
  const handleChangeUsername = async (e) => {
    e.preventDefault();
    setUsernameMsg({ type: '', text: '' });

    if (!newUsername.trim()) {
      setUsernameMsg({ type: 'error', text: 'Please enter a valid new username.' });
      return;
    }
    if (!usernamePassword) {
      setUsernameMsg({ type: 'error', text: 'Current password is required to verify your identity.' });
      return;
    }

    setUsernameLoading(true);
    try {
      const res = await api.put('/super-admin/change-username', {
        currentPassword: usernamePassword,
        newUsername: newUsername.trim(),
      });

      if (res.data?.success) {
        const updatedName = res.data.user?.username || newUsername.trim();
        setCurrentUsername(updatedName);
        setNewUsername('');
        setUsernamePassword('');
        setUsernameMsg({ type: 'success', text: 'Username changed successfully!' });
        showToast('Super Admin username updated successfully', 'success');

        // Update auth state in context & localStorage
        const storedUser = localStorage.getItem('spic_auth_user');
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser);
            parsed.username = updatedName;
            localStorage.setItem('spic_auth_user', JSON.stringify(parsed));
            if (setUser) setUser(parsed);
          } catch {
            // Ignore
          }
        }
      } else {
        setUsernameMsg({ type: 'error', text: res.data?.message || 'Failed to update username.' });
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Error updating username. Please verify current password.';
      setUsernameMsg({ type: 'error', text: msg });
      showToast(msg, 'error');
    } finally {
      setUsernameLoading(false);
    }
  };

  // ── Change Password Handler ──
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg({ type: '', text: '' });

    if (!currPassword) {
      setPasswordMsg({ type: 'error', text: 'Please enter your current password.' });
      return;
    }
    if (!newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Please enter and confirm your new password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New password and confirmation password do not match.' });
      return;
    }

    // Check strength
    if (!passwordChecks.length || !passwordChecks.upper || !passwordChecks.lower || !passwordChecks.number || !passwordChecks.special) {
      setPasswordMsg({
        type: 'error',
        text: 'New password does not meet the security requirements listed below.',
      });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await api.put('/super-admin/change-password', {
        currentPassword: currPassword,
        newPassword,
        confirmPassword,
      });

      if (res.data?.success) {
        setCurrPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordMsg({ type: 'success', text: 'Super Admin password changed successfully!' });
        showToast('Password updated securely. Keep your credentials safe.', 'success');
      } else {
        setPasswordMsg({ type: 'error', text: res.data?.message || 'Failed to update password.' });
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Error updating password. Check your current password.';
      setPasswordMsg({ type: 'error', text: msg });
      showToast(msg, 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  // ── Logout Handler ──
  const handleLogout = () => {
    logout();
    showToast('Super Admin logged out', 'info');
    navigate('/login/super-admin');
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white px-6 py-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/super-admin')}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition flex items-center justify-center shadow-xs"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200/60 flex items-center gap-1">
                <Shield className="w-3 h-3 text-purple-600" />
                SUPER_ADMIN
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-mono font-bold text-slate-600">
                {currentUsername}
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              Account Security & Settings
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => navigate('/super-admin')}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-2"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Company Admins</span>
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 rounded-xl transition flex items-center gap-2 shadow-2xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── SECTION 1: CHANGE USERNAME ── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Change Username</h2>
                <p className="text-xs text-slate-500">
                  Update your Super Administrator login identifier.
                </p>
              </div>
            </div>

            {usernameMsg.text && (
              <div
                className={`mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  usernameMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {usernameMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{usernameMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleChangeUsername} className="space-y-4 mt-5">
              {/* Current Username (Read-only) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Current Username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value={currentUsername}
                    className="w-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-mono font-bold rounded-xl px-3.5 py-2.5 cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-2.5 text-[11px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                    Active
                  </span>
                </div>
              </div>

              {/* New Username */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  New Username <span className="text-purple-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. QCL_LEAD_ADMIN"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono font-semibold rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                />
              </div>

              {/* Current Password Verification */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Current Password (for verification) <span className="text-purple-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showUsernamePassword ? 'text' : 'password'}
                    required
                    placeholder="Enter current password"
                    value={usernamePassword}
                    onChange={(e) => setUsernamePassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono rounded-xl px-3.5 py-2.5 pr-10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUsernamePassword(!showUsernamePassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    title={showUsernamePassword ? 'Hide password' : 'Show password'}
                  >
                    {showUsernamePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={usernameLoading}
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-purple-600/20 disabled:opacity-50"
                >
                  <User className="w-4 h-4" />
                  <span>{usernameLoading ? 'Updating Username...' : 'Change Username'}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span>Username changes are logged in the cryptographically auditable activity log.</span>
          </div>
        </div>

        {/* ── SECTION 2: CHANGE PASSWORD ── */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Change Password</h2>
                <p className="text-xs text-slate-500">
                  Update your Super Administrator master password with bcrypt hashing.
                </p>
              </div>
            </div>

            {passwordMsg.text && (
              <div
                className={`mt-4 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  passwordMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {passwordMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4 mt-5">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Current Password <span className="text-indigo-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter current password"
                    value={currPassword}
                    onChange={(e) => setCurrPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono rounded-xl px-3.5 py-2.5 pr-10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrPassword(!showCurrPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  New Password <span className="text-indigo-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter strong new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono rounded-xl px-3.5 py-2.5 pr-10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Confirm New Password <span className="text-indigo-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono rounded-xl px-3.5 py-2.5 pr-10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Requirements Checklist */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-[11px] space-y-1.5">
                <span className="font-bold text-slate-700 block text-[10px] uppercase tracking-wider">
                  Password Requirements:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-slate-600">
                  <span className={`flex items-center gap-1.5 ${passwordChecks.length ? 'text-emerald-700 font-bold' : ''}`}>
                    {passwordChecks.length ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Minimum 8 characters
                  </span>
                  <span className={`flex items-center gap-1.5 ${passwordChecks.upper ? 'text-emerald-700 font-bold' : ''}`}>
                    {passwordChecks.upper ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    At least one uppercase (A-Z)
                  </span>
                  <span className={`flex items-center gap-1.5 ${passwordChecks.lower ? 'text-emerald-700 font-bold' : ''}`}>
                    {passwordChecks.lower ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    At least one lowercase (a-z)
                  </span>
                  <span className={`flex items-center gap-1.5 ${passwordChecks.number ? 'text-emerald-700 font-bold' : ''}`}>
                    {passwordChecks.number ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    At least one number (0-9)
                  </span>
                  <span className={`flex items-center gap-1.5 ${passwordChecks.special ? 'text-emerald-700 font-bold' : ''}`}>
                    {passwordChecks.special ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    At least one special char (!@#...)
                  </span>
                  <span className={`flex items-center gap-1.5 ${passwordChecks.match ? 'text-emerald-700 font-bold' : ''}`}>
                    {passwordChecks.match ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                    Passwords match
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>{passwordLoading ? 'Updating Password...' : 'Change Password'}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Never share your master Super Admin credentials. Passwords are never stored as plain text.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminSettings;
