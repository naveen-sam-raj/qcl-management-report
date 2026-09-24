import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Shield,
  Building2,
  Menu,
  Eye,
  User,
  ExternalLink,
} from 'lucide-react';

const Navbar = ({ onToggleSidebar, isSidebarOpen }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getRoleBadge = () => {
    if (!user) return null;
    const roleLower = (user.role || '').toLowerCase();
    if (roleLower === 'super_admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
          <Shield className="w-3 h-3 text-purple-600" />
          Super Admin
        </span>
      );
    }
    if (user.role === 'company_admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
          <Building2 className="w-3 h-3 text-blue-600" />
          Company Admin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
        <Eye className="w-3 h-3 text-amber-600" />
        View-Only User
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white border-b border-slate-200/80 shadow-xs">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition border border-slate-200 shadow-xs"
          aria-label="Toggle Sidebar"
          title={isSidebarOpen ? "Collapse Sidebar" : "Open Sidebar"}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand / Context Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {user?.company?.name?.slice(0, 2) || 'SP'}
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-slate-900 tracking-tight text-sm">
                {user?.company?.name || 'SPIC • TFL • Greenstar'}
              </span>
              <span className="text-slate-400 mx-1.5 text-xs">/</span>
              <span className="text-xs font-medium text-slate-500">
                {user?.role === 'super_admin' ? 'Super Admin Console' : 'Analytics Portal'}
              </span>
            </div>
          </div>

          {/* Plant Pill if assigned */}
          {user?.plant && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
              Unit: {user.plant.name}
            </span>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Role Badge */}
        {getRoleBadge()}

        {/* User Card */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs">
            {user?.name?.slice(0, 1) || <User className="w-4 h-4" />}
          </div>
          <div className="hidden md:block text-left">
            <div className="text-xs font-bold text-slate-800 leading-none">{user?.name}</div>
            <div className="text-[11px] text-slate-400 leading-tight mt-0.5 font-mono">{user?.username}</div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          title="Logout"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-200"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Navbar;
