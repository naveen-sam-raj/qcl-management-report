import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Universal Confirm Save Modal for all QCL Plant Analysis Pages.
 * Matches the reference design in PclTclAnalysisPage.jsx:
 * - Slate/Blue-indigo gradient header
 * - Clear confirmation prompt & optional final-edit/warning banner
 * - Clean structured grid of values to be persisted
 * - Optional notification email recipient info
 * - Consistent Cancel / Confirm & Save footer with spinner
 */
const ConfirmSaveModal = ({
  isOpen = false,
  onClose,
  onCancel,
  onConfirm,
  saving = false,
  loading = false,
  title = 'Confirm Save',
  subtitle = '',
  prompt = 'Are you sure you want to save the entered measurements?',
  warningNotice = null,
  isFinalEdit = false,
  sectionTitle = 'Values to be saved:',
  items = [],
  sections = null,
  recipientEmail = '',
  emailTo = '',
  confirmText = 'Confirm & Save',
  cancelText = 'Cancel',
  columns = null,
}) => {
  if (!isOpen) return null;

  const handleCancel = onCancel || onClose;
  const isBusy = saving || loading;
  const email = emailTo || recipientEmail;

  // Determine grid columns
  const getGridClass = (count) => {
    if (columns) {
      if (columns === 1) return 'grid-cols-1';
      if (columns === 2) return 'grid-cols-2';
      if (columns === 3) return 'grid-cols-3';
      if (columns >= 4) return 'grid-cols-2 sm:grid-cols-4';
    }
    if (count <= 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-3';
    return 'grid-cols-2 sm:grid-cols-4';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
    >
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-scaleIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-6 py-4 text-white">
          <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
            <span>{title}</span>
          </h3>
          {subtitle && (
            <p className="text-xs text-blue-200 mt-0.5 font-medium">
              {subtitle}
            </p>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs text-slate-600 max-h-[70vh] overflow-y-auto">
          {prompt && (
            <p className="text-sm font-semibold text-slate-800 leading-snug">
              {prompt}
            </p>
          )}

          {/* Warning / Final Edit Notice */}
          {(warningNotice || isFinalEdit) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="font-medium text-[11px] leading-relaxed">
                {typeof warningNotice === 'string' ? (
                  warningNotice
                ) : (
                  <>
                    <strong>Final Edit Notice:</strong> This is the final permitted edit for this entry. After saving, all fields for today will be permanently locked.
                  </>
                )}
              </span>
            </div>
          )}

          {/* Multiple Sections */}
          {sections && sections.length > 0 && sections.map((sec, sIdx) => {
            const secItems = sec.items || [];
            if (secItems.length === 0) return null;
            return (
              <div key={sIdx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                {sec.title && (
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {sec.title}
                  </div>
                )}
                <div className={`grid ${getGridClass(secItems.length)} gap-2 text-center font-mono`}>
                  {secItems.map((item, idx) => (
                    <div key={idx} className="bg-white p-1.5 rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-sans truncate" title={item.label}>
                        {item.label}
                      </span>
                      <strong className="text-xs text-slate-800 break-words">
                        {item.value !== '' && item.value !== null && item.value !== undefined ? item.value : '—'}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Single Flat Items List */}
          {(!sections || sections.length === 0) && items && items.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              {sectionTitle && (
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {sectionTitle}
                </div>
              )}
              <div className={`grid ${getGridClass(items.length)} gap-2 text-center font-mono max-h-56 overflow-y-auto`}>
                {items.map((item, idx) => (
                  <div key={idx} className="bg-white p-1.5 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-sans truncate" title={item.label}>
                      {item.label}
                    </span>
                    <strong className="text-xs text-slate-800 break-words">
                      {item.value !== '' && item.value !== null && item.value !== undefined ? item.value : '—'}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isBusy}
            className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isBusy && (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmSaveModal;

