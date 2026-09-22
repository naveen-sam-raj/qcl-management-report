import React from 'react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import { Building2, Users, FileSpreadsheet, ShieldAlert, Sparkles } from 'lucide-react';

const EmptyCompanyDashboard = ({ companyName = 'SPIC', companyCode = 'SPIC' }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Subsidiary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-1.5">
            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
            {companyCode} SUBSIDIARY PORTAL
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {companyName} Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Enterprise Management Center for {companyName}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/admin/${companyCode.toLowerCase()}/users`)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            <Users className="w-4 h-4 text-slate-600" />
            <span>Manage Users</span>
          </button>
        </div>
      </div>

      {/* Exact Requested Empty State Screen */}
      <EmptyState
        companyName={companyName}
        title="No Analytics Data Available"
        subtitle="Analytics and plant information will appear here once data is configured."
      />
    </div>
  );
};

export default EmptyCompanyDashboard;
