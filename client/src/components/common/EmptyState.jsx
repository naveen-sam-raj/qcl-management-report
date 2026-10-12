import React from 'react';
import { BarChart3, Clock, AlertCircle } from 'lucide-react';

const EmptyState = ({
  companyName = 'SPIC',
  title = 'No Analytics Data Available',
  subtitle = 'Analytics and plant information will appear here once data is configured.',
  actionLabel = null,
  onAction = null,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[480px] p-8 text-center bg-white rounded-2xl border border-slate-200/80 shadow-card">
      {/* Visual illustration icon with layered circles */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center border-4 border-slate-50 shadow-inner">
          <BarChart3 className="w-12 h-12 text-slate-400 stroke-[1.5]" />
        </div>
        <div className="absolute -bottom-1 -right-1 p-2 bg-amber-50 rounded-full border-2 border-white shadow-sm">
          <Clock className="w-5 h-5 text-amber-500" />
        </div>
      </div>

      {/* Badge */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 mb-3 tracking-wide">
        <AlertCircle className="w-3.5 h-3.5 text-slate-500" />
        {companyName.toUpperCase()} • TELEMETRY PENDING
      </div>

      {/* Main Title & Subtitle */}
      <h3 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-slate-500 max-w-md text-base leading-relaxed mb-8">
        {subtitle}
      </p>

      {/* Enterprise Info Box */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl p-4 bg-slate-50/80 rounded-xl border border-slate-100 text-left mb-6">
        <div className="p-3 bg-white rounded-lg border border-slate-200/60 shadow-xs">
          <div className="text-xs text-slate-400 font-medium">Data Pipeline</div>
          <div className="text-sm font-semibold text-slate-700 mt-0.5">Provisioned</div>
        </div>
        <div className="p-3 bg-white rounded-lg border border-slate-200/60 shadow-xs">
          <div className="text-xs text-slate-400 font-medium">IoT Gateway</div>
          <div className="text-sm font-semibold text-amber-600 mt-0.5">Standby Mode</div>
        </div>
        <div className="p-3 bg-white rounded-lg border border-slate-200/60 shadow-xs">
          <div className="text-xs text-slate-400 font-medium">Sensor Feed</div>
          <div className="text-sm font-semibold text-slate-700 mt-0.5">0 of 0 Online</div>
        </div>
      </div>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
