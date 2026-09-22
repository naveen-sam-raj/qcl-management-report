import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Shield,
  Building2,
  Factory,
  ChevronRight,
  Lock,
  ArrowRight,
  Layers,
  BarChart4,
  Cpu,
  CheckCircle2,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const companies = [
    {
      id: 'spic',
      code: 'SPIC',
      name: 'SPIC',
      fullName: 'Southern Petrochemical Industries Corporation Ltd.',
      industry: 'Agri-Nutrients & Chemical Manufacturing',
      description: 'Premier agri-nutrients powerhouse manufacturing high-grade urea, complex fertilizers, and industrial chemicals across South India.',
      color: 'emerald',
      borderColor: 'hover:border-emerald-500',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      buttonColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      accentBg: 'bg-emerald-500',
      plantsText: 'Telemetry Pipeline Standby',
      telemetryStatus: 'Pending Configuration',
      targetRoute: '/login/spic',
      directAdminRoute: '/admin/spic',
    },
    {
      id: 'tfl',
      code: 'TFL',
      name: 'TFL',
      fullName: 'Tuticorin Alkali Chemicals and Fertilizers Ltd.',
      industry: 'Chemical Synthesis & Carbon Recovery',
      description: 'Pioneering synthetic soda ash and ammonium chloride manufacturer equipped with operational CCU (Carbon Capture & Utilization) technology.',
      color: 'blue',
      borderColor: 'hover:border-blue-500',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      buttonColor: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 shadow-md',
      accentBg: 'bg-blue-600',
      plantsText: '4 Operational Plants Active',
      telemetryStatus: 'Live Telemetry & Reports',
      targetRoute: '/login/tfl',
      directAdminRoute: '/admin/tfl',
      featured: true,
    },
    {
      id: 'greenstar',
      code: 'GSFL',
      name: 'Greenstar',
      fullName: 'Greenstar Fertilizers Limited (GSFL)',
      industry: 'Complex Phosphatic Nutrients',
      description: 'Major phosphatic fertilizer and water-soluble nutrient manufacturer delivering precision plant nourishment across the subcontinent.',
      color: 'teal',
      borderColor: 'hover:border-teal-500',
      badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
      buttonColor: 'bg-teal-600 hover:bg-teal-700 text-white',
      accentBg: 'bg-teal-600',
      plantsText: 'Telemetry Pipeline Standby',
      telemetryStatus: 'Pending Configuration',
      targetRoute: '/login/greenstar',
      directAdminRoute: '/admin/greenstar',
    },
  ];

  const handleCompanyClick = (company) => {
    // If logged in as super admin or that company's admin, navigate directly
    if (isAuthenticated) {
      if (user?.role === 'super_admin') {
        navigate(company.directAdminRoute);
        return;
      }
      if (user?.company?.code?.toLowerCase() === company.code.toLowerCase()) {
        if (user.role === 'company_admin') {
          navigate(company.directAdminRoute);
        } else {
          navigate('/portal');
        }
        return;
      }
    }
    // Navigate to company login with query param
    navigate(company.targetRoute);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Corporate Navigation */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-900 to-blue-700 flex items-center justify-center text-white font-extrabold text-xl shadow-md">
              S
            </div>
            <div>
              <div className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight flex items-center gap-2">
                SPIC GROUP
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  ENTERPRISE
                </span>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Analytics Management Platform
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Prominent Super Admin Button */}
            <button
              id="btn-super-admin-login"
              onClick={() => navigate('/login/super-admin')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-slate-900 hover:bg-slate-800 transition shadow-sm hover:shadow-md border border-slate-800"
            >
              <Shield className="w-4 h-4 text-purple-400" />
              <span>Super Admin</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-12 sm:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Ambient Backlight Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-[520px] h-28 bg-gradient-to-r from-blue-500/15 via-indigo-500/15 to-cyan-400/15 blur-3xl pointer-events-none rounded-full" />

        <div className="relative z-10">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-wider uppercase drop-shadow-xs">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700">
              QCL
            </span>{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-800">
              MANAGEMENT REPORTS
            </span>
          </h1>

          {/* Premium Modern Accent Line */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <span className="h-1 w-4 rounded-full bg-blue-400" />
            <span className="h-1.5 w-20 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-400 shadow-xs" />
            <span className="h-1 w-4 rounded-full bg-indigo-400" />
          </div>
        </div>

        {/* Corporate subsidiary selector label */}
        <div className="mt-10 flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          <div className="h-px w-12 bg-slate-200" />
          Select Subsidiary Dashboard
          <div className="h-px w-12 bg-slate-200" />
        </div>
      </section>

      {/* 3 Company Cards Section */}
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-16 flex-1 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {companies.map((c) => (
            <div
              key={c.id}
              onClick={() => handleCompanyClick(c)}
              className={`relative bg-white rounded-2xl border-2 border-slate-200/80 transition-all duration-300 hover-card-lift shadow-card hover:shadow-card-hover self-center p-4 sm:p-5 cursor-pointer group ${c.borderColor} ${
                c.featured ? 'ring-2 ring-blue-500/20' : ''
              }`}
            >
              {c.featured && (
                <div className="absolute -top-3 right-6 px-3 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white shadow-xs">
                  Active Telemetry & Plants
                </div>
              )}

              {c.id === 'tfl' ? (
                <div
                  id={`btn-open-${c.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCompanyClick(c)}
                  className="w-full flex items-center justify-center p-2"
                  title="Click to enter TFL Portal"
                >
                  <img
                    src="/tfl-logo.png"
                    alt="Tuticorin Alkali Chemicals and Fertilizers"
                    className="w-full max-w-[320px] sm:max-w-[340px] h-auto object-contain filter drop-shadow-xs transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              ) : c.id === 'spic' ? (
                <div
                  id={`btn-open-${c.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCompanyClick(c)}
                  className="w-full flex items-center justify-center p-2"
                  title="Click to enter SPIC Portal"
                >
                  <img
                    src="/spic-logo.png"
                    alt="SPIC Nourishing Growth"
                    className="w-full max-w-[300px] sm:max-w-[320px] h-auto object-contain filter drop-shadow-xs transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              ) : (
                <div
                  id={`btn-open-${c.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCompanyClick(c)}
                  className="w-full flex items-center justify-center p-2"
                  title="Click to enter Greenstar Portal"
                >
                  <img
                    src="/greenstar-logo.png"
                    alt="Greenstar"
                    className="w-full max-w-[280px] sm:max-w-[310px] h-auto object-contain filter drop-shadow-xs transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Super Admin Callout Banner */}
        <div className="mt-12 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-700/50">
          <div className="flex items-center gap-4 text-left">
            <div className="p-4 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-300 shrink-0">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/30 text-purple-300 border border-purple-400/30 mb-1">
                CORPORATE HEADQUARTERS ACCESS
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white">
                Super Administrator Governance Center
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mt-1">
                Manage all three subsidiary companies, provision company administrators, audit system logs, and inspect consolidated metrics.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/login/super-admin')}
            className="w-full sm:w-auto shrink-0 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-white text-slate-900 hover:bg-slate-100 transition shadow-md"
          >
            <Lock className="w-4 h-4 text-purple-600" />
            <span>Open Super Admin Login</span>
          </button>
        </div>
      </section>

      {/* Platform Features Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-8 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            © 2026 SPIC Group. Tuticorin Alkali Chemicals & Fertilizers (TFL) • Greenstar (GSFL).
          </div>
          <div className="flex items-center gap-6 font-medium text-slate-600">
            <span>Role-Based Access Control</span>
            <span>•</span>
            <span>Dynamic XLSX Reports</span>
            <span>•</span>
            <span>MERN Stack Architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
