import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
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
    <div className="fixed inset-0 overflow-hidden flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Blurred Industrial Ambient Background */}
      <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
        <img
          src="/plant-bg.jpg"
          alt="SPIC Plant Background"
          className="w-full h-full object-cover object-center filter blur-[4px] scale-105 opacity-80"
        />
        {/* Subtle Light Glass Gradient Overlay for high contrast readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-slate-50/50 to-white/70" />
      </div>

      {/* Top Corporate Navigation — Ultra-Minimal & Clean */}
      <header className="shrink-0 bg-white/75 backdrop-blur-md border-b border-slate-200/60 shadow-2xs">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 h-16 sm:h-18 flex items-center justify-between">
          {/* Official Fertilizer Group Brand Logo — Enlarged */}
          <div className="flex items-center">
            <img
              src="/fertilizer-group-logo.svg"
              alt="Fertilizer Group Logo"
              className="h-10 sm:h-13 w-auto object-contain cursor-pointer transition-transform hover:scale-102"
              onClick={() => navigate('/')}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area — Fills exactly remaining space, perfectly centered */}
      <main className="flex-1 min-h-0 flex flex-col justify-center items-center max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-2 overflow-hidden">
        {/* Hero Section — Enlarged Impactful Typography */}
        <section className="text-center mb-5 sm:mb-8 shrink-0">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/85 backdrop-blur-md border border-slate-200/90 shadow-2xs text-xs font-semibold text-slate-600 mb-2.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Industrial Quality Analytics Platform</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 leading-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700">
              QCL
            </span>{' '}
            <span className="text-slate-900">
              ANALYSIS REPORTS
            </span>
          </h1>

          {/* Accent underline */}
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            <span className="h-0.5 w-4 rounded-full bg-blue-400" />
            <span className="h-1.5 w-20 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-400" />
            <span className="h-0.5 w-4 rounded-full bg-indigo-400" />
          </div>

          <p className="mt-2.5 text-sm sm:text-base text-slate-600 max-w-xl mx-auto font-medium">
            Select a subsidiary division below to access automated plant telemetry, chemical analysis, and lab logs.
          </p>
        </section>

        {/* 3 Subsidiary Logo Cards - Clean & Direct (Restored to previous large size) */}
        <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
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
                className={`group relative bg-white/95 backdrop-blur-xl rounded-2xl sm:rounded-3xl border transition-all duration-300 cursor-pointer overflow-hidden flex items-center justify-center p-8 sm:p-10 h-36 sm:h-44 shadow-[0_6px_24px_rgba(0,0,0,0.05)] hover:shadow-[0_16px_36px_rgba(37,99,235,0.15)] hover:-translate-y-1.5 hover:scale-[1.02] ${
                  isTFL
                    ? 'border-blue-400 ring-2 ring-blue-500/20 shadow-blue-500/10'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Subtle top accent strip */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.accentGradient}`}
                />

                <img
                  src={c.logo}
                  alt={c.logoAlt}
                  className="max-h-16 sm:max-h-20 max-w-[200px] sm:max-w-[240px] w-auto object-contain filter drop-shadow-2xs transition-transform duration-300 group-hover:scale-110"
                />
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default LandingPage;
