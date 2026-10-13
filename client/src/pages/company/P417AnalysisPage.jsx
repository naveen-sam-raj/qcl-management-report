import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft,
  Flame,
  ChevronRight,
  Database,
  Layers,
} from 'lucide-react';
import P4171AnalysisPage from './P4171AnalysisPage';
import P4172AnalysisPage from './P4172AnalysisPage';
import P4173AnalysisPage from './P4173AnalysisPage';

// ── 3 P417 Tank Variants ──
const P417_VARIANTS = [
  {
    key: 'p417-1',
    label: 'P417-1',
    name: 'P417-1',
    subtitle: 'Shift Twice • FNH₃ Limit: 1.98–2.18 Kgm/m³',
    badge: 'Shift Twice',
  },
  {
    key: 'p417-2',
    label: 'P417-2',
    name: 'P417-2',
    subtitle: '3 Shifts • FNH₃ / CNH₃ / TCl / NaCl',
    badge: '3 Shifts',
  },
  {
    key: 'p417-3',
    label: 'P417-3',
    name: 'P417-3',
    subtitle: '3 Shifts • FNH₃ / CNH₃ / TCl / NaCl',
    badge: '3 Shifts',
  },
];

const P417AnalysisPage = ({ plantId = 'sa', defaultTab = 'p417-1' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(defaultTab || 'p417-1');

  const basePath = user?.role === 'user' ? '/portal' : '/admin/tfl';

  return (
    <div className="space-y-3 animate-fadeIn">
      {/* ── Sub-navigation Tank Selector Bar ── */}
      <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`${basePath}/plants/${plantId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 font-bold text-xs transition shadow-2xs shrink-0 cursor-pointer"
            title="Back to SA Plant Options"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Options</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium leading-tight">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span>SA Plant</span>
            <ChevronRight className="w-3 h-3 text-slate-300" />
            <Database className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-slate-800 font-bold">P417 Tank Analysis</span>
          </div>
        </div>

        {/* Tank Variant Tabs (P417-1, P417-2, P417-3) */}
        <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
          <div className="flex items-center gap-1 px-2 text-[11px] font-bold text-slate-600 hidden sm:flex">
            <Layers className="w-3 h-3 text-slate-500" />
            <span>Tank Variant:</span>
          </div>
          {P417_VARIANTS.map((v) => {
            const isActive = activeTab === v.key;
            return (
              <button
                key={v.key}
                id={`tab-${v.key}`}
                type="button"
                onClick={() => setActiveTab(v.key)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/80'
                }`}
                title={v.subtitle}
              >
                <span>{v.label}</span>
                <span
                  className={`text-[9.5px] font-semibold px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-blue-700/80 text-blue-100'
                      : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {v.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active Variant Analysis Component ── */}
      <div>
        {activeTab === 'p417-1' && <P4171AnalysisPage plantId={plantId} />}
        {activeTab === 'p417-2' && <P4172AnalysisPage plantId={plantId} />}
        {activeTab === 'p417-3' && <P4173AnalysisPage plantId={plantId} />}
      </div>
    </div>
  );
};

export default P417AnalysisPage;
