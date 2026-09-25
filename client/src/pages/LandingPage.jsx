import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Shield,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const companies = [
    {
      id: 'spic',
      code: 'SPIC',
      name: 'SPIC Limited',
      shortName: 'SPIC',
      subtitle: 'Agri-Nutrients & Fertilizer Powerhouse',
      description: 'High-grade urea, complex fertilizers, and industrial chemicals across South India.',
      logo: '/spic-logo.png',
      logoAlt: 'SPIC Nourishing Growth',
      status: 'Standby Pipeline',
      statusType: 'standby',
      accentGradient: 'from-blue-600 via-blue-500 to-indigo-600',
      activeBadge: 'Corporate Unit',
      targetRoute: '/login/spic',
      directAdminRoute: '/admin/spic',
      isPrimary: false,
    },
    {
      id: 'tfl',
      code: 'TFL',
      name: 'Tuticorin Alkali Chemicals',
      shortName: 'TFL',
      subtitle: 'Soda Ash & CCU Carbon Recovery',
      description: 'Synthetic soda ash and ammonium chloride with operational Carbon Capture & Utilization (CCU).',
      logo: '/tfl-logo.png',
      logoAlt: 'Tuticorin Alkali Chemicals and Fertilizers',
      status: '4 Active Plants',
      statusType: 'active',
      accentGradient: 'from-teal-500 via-emerald-500 to-blue-600',
      activeBadge: 'Live Telemetry & QCL',
      targetRoute: '/login/tfl',
      directAdminRoute: '/admin/tfl',
      isPrimary: true,
    },
    {
      id: 'greenstar',
      code: 'GSFL',
      name: 'Greenstar Fertilizers',
      shortName: 'Greenstar',
      subtitle: 'Phosphatic & Precision Nutrients',
      description: 'Major phosphatic fertilizer and water-soluble nutrient manufacturer across the subcontinent.',
      logo: '/greenstar-logo.png',
      logoAlt: 'Greenstar Fertilizers Limited',
      status: 'Standby Pipeline',
      statusType: 'standby',
      accentGradient: 'from-emerald-600 via-green-500 to-teal-500',
      activeBadge: 'Agri Solutions',
      targetRoute: '/login/greenstar',
      directAdminRoute: '/admin/greenstar',
      isPrimary: false,
    },
  ];

  const handleCompanyClick = (company) => {
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
    navigate(company.targetRoute);
  };

  return (
    <div className="min-h-screen relative flex flex-col selection:bg-blue-600 selection:text-white overflow-x-hidden font-sans">
      {/* Blurred Industrial Ambient Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <img
          src="/plant-bg.jpg"
          alt="SPIC Plant Background"
          className="w-full h-full object-cover object-center filter blur-[4px] scale-105 opacity-80"
        />
        {/* Subtle Light Glass Gradient Overlay for high contrast readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-slate-50/50 to-white/70" />
      </div>

      {/* Top Corporate Navigation */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-slate-900 to-blue-700 flex items-center justify-center text-white font-black text-lg shadow-sm">
              S
            </div>
            <div>
              <div className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight flex items-center gap-2">
                SPIC GROUP
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  ENTERPRISE
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                Quality Control Laboratory (QCL) Portal
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Super Admin Access Button */}
            <button
              id="btn-super-admin-login"
              onClick={() => navigate('/login/super-admin')}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl font-semibold text-xs sm:text-sm text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-sm hover:shadow-md border border-slate-800 active:scale-95 cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
              <span>Super Admin</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* Hero Section */}
        <section className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-2xs text-[11px] font-semibold text-slate-600 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Industrial Quality Analytics Platform</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700">
              QCL
            </span>{' '}
            <span className="text-slate-900">
              ANALYSIS REPORTS
            </span>
          </h1>

          {/* Accent underline */}
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            <span className="h-0.5 w-3 rounded-full bg-blue-400" />
            <span className="h-1 w-16 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-400" />
            <span className="h-0.5 w-3 rounded-full bg-indigo-400" />
          </div>

          <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto font-medium">
            Select a subsidiary division below to access automated plant telemetry, chemical analysis, and lab logs.
          </p>
        </section>

        {/* 3 Subsidiary Cards - Compact, Neat, & Unique */}
        <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {companies.map((c) => {
            const isTFL = c.id === 'tfl';
            return (
              <div
                key={c.id}
                id={`btn-open-${c.id}`}
                onClick={() => handleCompanyClick(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCompanyClick(c)}
                className={`group relative bg-white/90 backdrop-blur-xl rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_16px_32px_rgba(37,99,235,0.12)] hover:-translate-y-1 ${
                  isTFL
                    ? 'border-blue-300 ring-2 ring-blue-500/20 bg-gradient-to-b from-white to-blue-50/30'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Subtle Brand Gradient Strip */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.accentGradient}`}
                />

                <div>
                  {/* Top Bar: Subsidiary Code & Status Pill */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider uppercase bg-slate-100 text-slate-700 border border-slate-200/80">
                      {c.code}
                    </span>

                    {isTFL ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                        </span>
                        {c.status}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                        {c.status}
                      </span>
                    )}
                  </div>

                  {/* Logo Frame: Controlled size, perfectly centered & neat */}
                  <div className="h-16 w-full rounded-xl bg-slate-50/80 border border-slate-100/80 flex items-center justify-center p-2 mb-3 group-hover:bg-white group-hover:border-slate-200 transition-all duration-300">
                    <img
                      src={c.logo}
                      alt={c.logoAlt}
                      className="max-h-10 max-w-[150px] sm:max-w-[160px] w-auto object-contain filter drop-shadow-2xs transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>

                  {/* Details */}
                  <div className="text-center px-1 mb-4">
                    <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                      {c.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug line-clamp-1">
                      {c.subtitle}
                    </p>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div>
                  <div
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-300 ${
                      isTFL
                        ? 'bg-blue-600 text-white shadow-xs group-hover:bg-blue-700 group-hover:shadow-md'
                        : 'bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white'
                    }`}
                  >
                    <span>Enter Portal</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default LandingPage;
