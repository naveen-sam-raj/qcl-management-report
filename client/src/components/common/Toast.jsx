import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success', duration = 5000, action = null) => {
    // Automatically elevate to warning if message indicates email failure or unassigned user
    let resolvedType = type;
    if (
      type === 'success' &&
      typeof message === 'string' &&
      (message.toLowerCase().includes('failed') ||
        message.toLowerCase().includes('no user is assigned') ||
        message.toLowerCase().includes('not assigned'))
    ) {
      resolvedType = 'warning';
    }

    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type: resolvedType, action }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast floating container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-4 rounded-xl border shadow-lg transition-all animate-slideUp ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : toast.type === 'error'
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : toast.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border-amber-300'
                : 'bg-blue-50 text-blue-900 border-blue-200'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-blue-600 shrink-0" />}
              <span className="text-sm font-medium leading-snug break-words">{toast.message}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action.onClick?.();
                    removeToast(toast.id);
                  }}
                  className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-200 hover:bg-amber-300 text-amber-900 transition cursor-pointer"
                >
                  {toast.action.label || 'Retry'}
                </button>
              )}
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
