import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, LogOut } from 'lucide-react';

const PasswordChangedModal = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState('Your password has been changed. Please contact admin.');

  // Handle logout and redirection
  const handleAcknowledge = () => {
    // Determine the login portal based on current user company
    const compCode = user?.company?.code?.toUpperCase();
    let loginUrl = '/';
    if (compCode === 'TFL') loginUrl = '/login/tfl';
    else if (compCode === 'SPIC') loginUrl = '/login/spic';
    else if (compCode === 'GSFL') loginUrl = '/login/greenstar';

    logout();
    setIsOpen(false);
    navigate(loginUrl, { replace: true });
  };

  useEffect(() => {
    // 1. Listen for API interceptor custom event
    const handleCustomEvent = (e) => {
      if (isAuthenticated) {
        if (e.detail?.message) setModalMessage(e.detail.message);
        setIsOpen(true);
      }
    };
    window.addEventListener('auth:password-changed', handleCustomEvent);

    // 2. BroadcastChannel for instant cross-tab synchronization
    let channel;
    try {
      channel = new BroadcastChannel('spic_auth_sync');
      channel.onmessage = (event) => {
        if (event.data?.type === 'PASSWORD_RESET') {
          const targetId = event.data.targetId;
          const targetUsername = event.data.targetUsername;
          const currentUserId = user?._id || user?.id;
          const currentUsername = user?.username;

          if (
            (targetId && targetId === currentUserId) ||
            (targetUsername && currentUsername && targetUsername.toLowerCase() === currentUsername.toLowerCase())
          ) {
            setIsOpen(true);
          }
        }
      };
    } catch {
      /* BroadcastChannel not supported in legacy browsers */
    }

    // 3. Storage event fallback for cross-tab communication
    const handleStorage = (e) => {
      if (e.key === 'spic_password_reset_signal' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const currentUserId = user?._id || user?.id;
          const currentUsername = user?.username;

          if (
            (data.targetId && data.targetId === currentUserId) ||
            (data.targetUsername && currentUsername && data.targetUsername.toLowerCase() === currentUsername.toLowerCase())
          ) {
            setIsOpen(true);
          }
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('auth:password-changed', handleCustomEvent);
      window.removeEventListener('storage', handleStorage);
      if (channel) channel.close();
    };
  }, [user, isAuthenticated]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-amber-200 p-6 sm:p-8 text-center relative overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500" />

        {/* Icon with glowing badge */}
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 border-4 border-amber-100 flex items-center justify-center mb-5 text-amber-600 shadow-inner">
          <ShieldAlert className="w-8 h-8 text-amber-600 animate-pulse" />
        </div>

        {/* Modal Title */}
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          Security Alert: Password Changed
        </h3>

        {/* Alert Message Requested by User */}
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 mb-4">
          <p className="text-sm font-semibold text-amber-900 leading-snug">
            {modalMessage}
          </p>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed mb-6">
          Your account credentials were modified by the Super Administrator. For your security, this session is now closed. Please click <span className="font-semibold text-slate-700">OK</span> to return to the portal login screen.
        </p>

        {/* OK / Confirm Button */}
        <button
          onClick={handleAcknowledge}
          className="w-full py-3 px-5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <span>OK</span>
          <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
};

export default PasswordChangedModal;
