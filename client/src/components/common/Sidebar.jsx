import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Users2,
  UserCheck,
  ShieldAlert,
  FileSpreadsheet,
  Activity,
  Settings,
  LogOut,
  Factory,
  BarChart3,
  Flame,
  Globe,
  Gauge,
  X,
  Eye,
} from 'lucide-react';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Define navigation based on user role
  const getNavLinks = () => {
    if (user?.role === 'super_admin' || user?.role === 'SUPER_ADMIN') {
      return [
        { label: 'Company Admins', to: '/super-admin', icon: UserCheck, exact: true },
        { label: 'Account Settings', to: '/super-admin/settings', icon: Settings },
      ];
    }

    if (user?.role === 'company_admin') {
      // Company admins only see their own company dashboard
      const companySlug = user.company?.code?.toLowerCase() || 'tfl';
      return [
        { label: 'Dashboard', to: `/admin/${companySlug}`, icon: LayoutDashboard, exact: true },
        { label: 'Plants', to: `/admin/${companySlug}/plants`, icon: Factory },
        { label: 'Users', to: `/admin/${companySlug}/users`, icon: Users2 },
        { label: 'Reports', to: `/admin/${companySlug}/reports`, icon: FileSpreadsheet },
        { label: 'Settings', to: `/admin/${companySlug}/settings`, icon: Settings },
      ];
    }

    // Normal User (View-Only) — just their assigned plant dashboard
    return [
      { label: 'My Plant Dashboard', to: '/portal', icon: Factory, exact: true },
      { label: 'Reports', to: '/portal/reports', icon: FileSpreadsheet },
    ];
  };

  const navLinks = getNavLinks();

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-40 h-full w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out shadow-2xl ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-6 bg-slate-950/60 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
              S
            </div>
            <div>
              <div className="font-extrabold text-white text-sm tracking-wide">SPIC GROUP</div>
              <div className="text-[10px] text-blue-400 font-medium tracking-wider uppercase">
                Enterprise Analytics
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Collapse Sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Scope Banner */}
        <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/40">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 mb-1">
            Current Workspace
          </div>
          <div className="flex items-center justify-between">
            <div className="font-bold text-white text-sm truncate">
              {user?.role === 'super_admin'
                ? 'Universal Control'
                : user?.role === 'user'
                ? (user?.plant?.name || user?.company?.name || 'Plant Portal')
                : user?.company?.name || 'Company Portal'}
            </div>
            {user?.role === 'user' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Eye className="w-3 h-3" /> View-Only
              </span>
            )}
          </div>
          {/* Show plant code for user */}
          {user?.role === 'user' && user?.plant && (
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
              Unit: {user.plant.code} · {user.company?.name}
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => onClose && onClose()}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 space-y-3">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-blue-400 border border-slate-700">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate">{user?.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{user?.role?.replace('_', ' ')}</div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl transition border border-slate-800 hover:border-rose-900/50"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
