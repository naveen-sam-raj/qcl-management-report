import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Sparkles,
} from 'lucide-react';

const DEFAULT_COMPANIES = [
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

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [companies, setCompanies] = useState(DEFAULT_COMPANIES);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await api.get('/companies');
        if (res.data?.success && res.data.companies) {
          const dbCompanies = res.data.companies;
          const defaultCodes = DEFAULT_COMPANIES.map(c => c.code.toLowerCase());
          
          const newCompanies = dbCompanies
            .filter(c => c.status === 'active' && !defaultCodes.includes(c.code.toLowerCase()))
            .map(c => ({
              id: c._id || c.code.toLowerCase(),
              code: c.code,
              name: c.name,
              shortName: c.name,
              subtitle: 'Dynamic Company',
              description: '',
              logo: c.logo || '/default-company.png',
              logoAlt: c.name,
              status: 'Active',
              statusType: 'active',
              accentGradient: 'from-slate-400 via-slate-500 to-slate-600',
              activeBadge: 'Live',
              targetRoute: `/login/${c.code.toLowerCase()}`,
              directAdminRoute: `/admin/${c.code.toLowerCase()}`,
              isPrimary: false,
            }));
            
          if (newCompanies.length > 0) {
            setCompanies([...DEFAULT_COMPANIES, ...newCompanies]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch dynamic companies', err);
      }
    };
    fetchCompanies();
  }, []);

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

      {/* Top Corporate Navigation — Compact Brand Header */}
      <header className="shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-xs py-1.5 sm:py-2">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex items-center justify-between">
          {/* Quality Tracking System Brand Logo */}
          <div className="flex items-center">
            <img
              src="/qts-logo.svg"
              alt="Quality Tracking System"
              className="h-10 sm:h-12 md:h-14 w-auto object-contain cursor-pointer transition-transform hover:scale-105"
              onClick={() => navigate('/')}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area — Fills exactly remaining space, perfectly centered */}
      <main className="flex-1 min-h-0 flex flex-col justify-center items-center max-w-6xl mx-auto w-full px-4 sm:px-6 py-2 overflow-y-auto sm:overflow-hidden">
        {/* Hero Section — Balanced Typography */}
        <section className="text-center mb-4 sm:mb-6 shrink-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/85 backdrop-blur-md border border-slate-200/90 shadow-2xs text-[11px] sm:text-xs font-semibold text-slate-600 mb-2">
            <Sparkles className="w-3 h-3 text-blue-600" />
            <span>Industrial Quality Analytics Platform</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700">
              QUALITY
            </span>{' '}
            <span className="text-slate-900">
              TRACKING SYSTEM
            </span>
          </h1>

          {/* Accent underline */}
          <div className="flex items-center justify-center gap-1.5 mt-1.5">
            <span className="h-0.5 w-3 rounded-full bg-blue-400" />
            <span className="h-1 w-14 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-400" />
            <span className="h-0.5 w-3 rounded-full bg-indigo-400" />
          </div>

          <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto font-medium">
            Select a subsidiary division below to access automated plant telemetry, chemical analysis, and lab logs.
          </p>
        </section>

        {/* Subsidiary Logo Cards - Compact & Balanced for Laptops */}
        <div className="max-w-4xl mx-auto w-full grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
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
                className={`group relative bg-white/95 backdrop-blur-xl rounded-xl sm:rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex items-center justify-center p-4 sm:p-5 h-24 sm:h-28 md:h-32 shadow-[0_4px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(37,99,235,0.12)] hover:-translate-y-1 hover:scale-[1.02] ${
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
                  className="max-h-10 sm:max-h-12 md:max-h-14 max-w-[130px] sm:max-w-[160px] w-auto object-contain filter drop-shadow-2xs transition-transform duration-300 group-hover:scale-105"
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
