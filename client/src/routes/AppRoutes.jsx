import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import SuperAdminLogin from '../pages/auth/SuperAdminLogin';
import SPICLogin from '../pages/auth/SPICLogin';
import TFLLogin from '../pages/auth/TFLLogin';
import GreenstarLogin from '../pages/auth/GreenstarLogin';
import DashboardLayout from '../layouts/DashboardLayout';
import SuperAdminDashboard from '../pages/superadmin/SuperAdminDashboard';
import SuperAdminSettings from '../pages/superadmin/SuperAdminSettings';
import TFLAdminDashboard from '../pages/company/TFLAdminDashboard';
import PlantAnalysisPage from '../pages/company/PlantAnalysisPage';
import EmptyCompanyDashboard from '../pages/company/EmptyCompanyDashboard';
import UserManagementPage from '../pages/company/UserManagementPage';
import UserProfileDashboard from '../pages/company/UserProfileDashboard';
import UserDashboard from '../pages/user/UserDashboard';
import ReportsPage from '../pages/reports/ReportsPage';

const AppRoutes = () => {
  return (
    <Routes>
      {/* ── Public Landing Page ── */}
      <Route path="/" element={<LandingPage />} />

      {/* ── Auth / Login Pages ── */}
      {/* Super Admin Login */}
      <Route path="/login/super-admin" element={<SuperAdminLogin />} />

      {/* Individual company login pages (separate, branded) */}
      <Route path="/login/spic" element={<SPICLogin />} />
      <Route path="/login/tfl" element={<TFLLogin />} />
      <Route path="/login/greenstar" element={<GreenstarLogin />} />

      {/* Legacy shared company login route — redirect to landing */}
      <Route path="/login/company" element={<Navigate to="/" replace />} />

      {/* ── Super Admin Protected Routes ── */}
      <Route path="/super-admin" element={<DashboardLayout requiredRole="super_admin" />}>
        <Route index element={<SuperAdminDashboard />} />
        <Route path="settings" element={<SuperAdminSettings />} />
        {/* All other sub-routes redirect to dashboard */}
        <Route path="*" element={<SuperAdminDashboard />} />
      </Route>

      {/* ── TFL Admin Protected Routes ── */}
      <Route path="/admin/tfl" element={<DashboardLayout requiredRole="company_admin" requiredCompany="TFL" />}>
        <Route index element={<TFLAdminDashboard />} />
        <Route path="plants" element={<TFLAdminDashboard />} />
        <Route path="plants/:id" element={<PlantAnalysisPage />} />
        <Route path="plants/:id/options/:optionName" element={<PlantAnalysisPage />} />
        <Route path="users" element={<UserManagementPage />} />
        <Route path="users/:userId" element={<UserProfileDashboard />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<UserManagementPage />} />
      </Route>

      {/* ── SPIC Admin Protected Routes ── */}
      <Route path="/admin/spic" element={<DashboardLayout requiredRole="company_admin" requiredCompany="SPIC" />}>
        <Route index element={<EmptyCompanyDashboard companyName="SPIC" companyCode="SPIC" />} />
        <Route path="plants" element={<EmptyCompanyDashboard companyName="SPIC" companyCode="SPIC" />} />
        <Route path="users" element={<UserManagementPage />} />
        <Route path="users/:userId" element={<UserProfileDashboard />} />
        <Route path="reports" element={<EmptyCompanyDashboard companyName="SPIC" companyCode="SPIC" />} />
        <Route path="settings" element={<EmptyCompanyDashboard companyName="SPIC" companyCode="SPIC" />} />
      </Route>

      {/* ── Greenstar (GSFL) Admin Protected Routes ── */}
      <Route path="/admin/greenstar" element={<DashboardLayout requiredRole="company_admin" requiredCompany="GSFL" />}>
        <Route index element={<EmptyCompanyDashboard companyName="Greenstar (GSFL)" companyCode="GSFL" />} />
        <Route path="plants" element={<EmptyCompanyDashboard companyName="Greenstar (GSFL)" companyCode="GSFL" />} />
        <Route path="users" element={<UserManagementPage />} />
        <Route path="users/:userId" element={<UserProfileDashboard />} />
        <Route path="reports" element={<EmptyCompanyDashboard companyName="Greenstar (GSFL)" companyCode="GSFL" />} />
        <Route path="settings" element={<EmptyCompanyDashboard companyName="Greenstar (GSFL)" companyCode="GSFL" />} />
      </Route>

      {/* ── Normal User (View-Only Plant Portal) ── */}
      <Route path="/portal" element={<DashboardLayout requiredRole="user" />}>
        <Route index element={<UserDashboard />} />
        <Route path="plants" element={<UserDashboard />} />
        <Route path="plants/:id" element={<PlantAnalysisPage />} />
        <Route path="plants/:id/options/:optionName" element={<PlantAnalysisPage />} />
        <Route path="reports" element={<ReportsPage />} />
        {/* Redirect any other portal sub-routes back to dashboard */}
        <Route path="*" element={<UserDashboard />} />
      </Route>

      {/* ── Fallback ── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
