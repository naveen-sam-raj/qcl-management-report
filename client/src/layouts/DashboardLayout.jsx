import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/common/Sidebar';
import Navbar from '../components/common/Navbar';
import { Eye, ShieldAlert } from 'lucide-react';

/**
 * DashboardLayout
 * - requiredRole: if set, only this role can access the route
 * - requiredCompany: if set (e.g. 'TFL', 'SPIC', 'GSFL'), company_admin must belong to this company
 */
const DashboardLayout = ({ requiredRole = null, requiredCompany = null }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Not logged in → go to landing
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // Role check
  if (requiredRole && user?.role !== requiredRole) {
    // Redirect to the correct dashboard based on actual role
    if (user?.role === 'super_admin') return <Navigate to="/super-admin" replace />;
    if (user?.role === 'company_admin') {
      const code = user.company?.code?.toLowerCase() || 'tfl';
      return <Navigate to={`/admin/${code}`} replace />;
    }
    return <Navigate to="/portal" replace />;
  }

  // Company isolation check for company_admin
  if (requiredCompany && user?.role === 'company_admin') {
    const userCompanyCode = user.company?.code?.toUpperCase();
    if (userCompanyCode !== requiredCompany.toUpperCase()) {
      // Redirect them to their own company dashboard
      const theirCode = userCompanyCode?.toLowerCase() || 'tfl';
      return <Navigate to={`/admin/${theirCode}`} replace />;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Container */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'lg:pl-64' : 'pl-0'}`}>
        <Navbar onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} isSidebarOpen={isSidebarOpen} />

        {/* View-Only Banner for Normal Users */}
        {user?.role === 'user' && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <Eye className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>View-Only Mode:</strong> You are browsing with read-only privileges.
              </span>
            </div>
            <span className="text-[11px] font-mono text-amber-700 uppercase tracking-wider hidden md:inline-block">
              {user.plant ? `Plant: ${user.plant.name}` : 'Company Portal'}
            </span>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
