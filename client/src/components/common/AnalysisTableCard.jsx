import React from 'react';
import { FlaskConical } from 'lucide-react';

/**
 * AnalysisTableCard
 * Shared wrapper for analysis data tables matching the P413 WSC Tank standard:
 * - Rounded bordered card container with subtle shadow
 * - Top title bar with icon, uppercase title, and metadata pill (frequency, units)
 * - Scrollable children table area
 * - Bottom card footer with metadata summary and shift lock/correction policy note
 */
const AnalysisTableCard = ({
  icon: Icon = FlaskConical,
  title,
  frequencyText,
  unitText,
  headerExtra,
  footerTitle,
  footerMeta,
  footerNote = 'One correction allowed after first save; saving the next shift locks the previous one.',
  className = '',
  children,
}) => {
  return (
    <div className={`bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden ${className}`}>
      {/* Table Header Bar with Integrated Details */}
      {(title || frequencyText || unitText || headerExtra) && (
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            {frequencyText && (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
                <span>{frequencyText}</span>
              </>
            )}
            {frequencyText && unitText && <span>•</span>}
            {unitText && <span>{unitText}</span>}
            {headerExtra}
          </div>
        </div>
      )}

      {/* The Analysis Table / Content */}
      {children}

      {/* Card Footer */}
      {(footerTitle || footerMeta || footerNote) && (
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            {footerTitle && <span className="font-semibold text-slate-700">{footerTitle}:</span>}
            {footerMeta && <span>{footerMeta}</span>}
          </div>
          {footerNote && (
            <div className="text-[11px] text-slate-500 font-medium shrink-0">
              {footerNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalysisTableCard;

