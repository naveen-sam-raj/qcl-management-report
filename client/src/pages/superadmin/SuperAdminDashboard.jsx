import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import api from '../../services/api';
import { MOCK_COMPANIES, MOCK_COMPANY_ADMINS } from '../../services/mockData';
import {
  Shield,
  UserPlus,
  Users,
  Building2,
  Eye,
  EyeOff,
  Search,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Edit3,
  Clock,
  Settings,
} from 'lucide-react';

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('all');

  // Create Admin Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [adminFormData, setAdminFormData] = useState({
    companyId: '',
    name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    mobile: '',
    status: 'active',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit Admin Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '', mobile: '', status: 'active' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Reset Password Modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetAdmin, setResetAdmin] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // Delete Confirm Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingAdmin, setDeletingAdmin] = useState(null);

  // Super Admin Change Password Modal State
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [superAdminNewPassword, setSuperAdminNewPassword] = useState('');
  const [superAdminConfirmPassword, setSuperAdminConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showSuperAdminNewPassword, setShowSuperAdminNewPassword] = useState(false);
  const [showSuperAdminConfirmPassword, setShowSuperAdminConfirmPassword] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('');

  const handleSuperAdminChangePassword = async (e) => {
    e.preventDefault();
    setChangePasswordError('');
    setChangePasswordSuccess('');

    if (!currentPassword) {
      setChangePasswordError('Current password is required.');
      return;
    }
    if (!superAdminNewPassword) {
      setChangePasswordError('New password is required.');
      return;
    }
    if (!superAdminConfirmPassword) {
      setChangePasswordError('Confirm password is required.');
      return;
    }
    if (superAdminNewPassword.length < 8) {
      setChangePasswordError('Password must contain at least 8 characters');
      return;
    }
    if (superAdminNewPassword !== superAdminConfirmPassword) {
      setChangePasswordError('New password and confirm password do not match');
      return;
    }
    if (currentPassword === superAdminNewPassword) {
      setChangePasswordError('New password must be different from your current password');
      return;
    }

    setChangePasswordLoading(true);
    try {
      const res = await api.post('/super-admin/change-password', {
        currentPassword,
        newPassword: superAdminNewPassword,
        confirmPassword: superAdminConfirmPassword,
      });

      if (res.data?.success) {
        setCurrentPassword('');
        setSuperAdminNewPassword('');
        setSuperAdminConfirmPassword('');
        setChangePasswordSuccess('Password changed successfully');
        showToast('Password changed successfully', 'success');
        setTimeout(() => {
          setIsChangePasswordModalOpen(false);
          setChangePasswordSuccess('');
        }, 1500);
      } else {
        setChangePasswordError(res.data?.message || 'Failed to update password.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Current password is incorrect';
      setChangePasswordError(msg);
      showToast(msg, 'error');
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      // Use mock data — no backend required
      await new Promise((r) => setTimeout(r, 400)); // simulate load
      setCompanies(MOCK_COMPANIES);
      setAdmins(MOCK_COMPANY_ADMINS);
    } catch (err) {
      showToast('Failed to load data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter admins list
  const filteredAdmins = admins.filter((a) => {
    const matchSearch =
      !searchTerm ||
      a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.username?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCompany =
      selectedCompanyFilter === 'all' ||
      a.company?._id === selectedCompanyFilter ||
      a.company?.code?.toLowerCase() === selectedCompanyFilter.toLowerCase();
    return matchSearch && matchCompany;
  });

  // Get company badge color
  const getCompanyColor = (code) => {
    switch (code?.toUpperCase()) {
      case 'SPIC': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'TFL': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'GSFL': return 'bg-teal-100 text-teal-800 border-teal-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const resetCreateForm = () => {
    setAdminFormData({ companyId: '', name: '', email: '', username: '', password: '', confirmPassword: '', mobile: '', status: 'active' });
    setFormError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  // CREATE admin — add to local state (mock)
  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!adminFormData.companyId) { setFormError('Please select a company.'); return; }
    if (!adminFormData.name || !adminFormData.email || !adminFormData.username || !adminFormData.password) {
      setFormError('All required fields must be filled.'); return;
    }
    if (adminFormData.password !== adminFormData.confirmPassword) {
      setFormError('Passwords do not match.'); return;
    }
    if (adminFormData.password.length < 6) {
      setFormError('Password must be at least 6 characters.'); return;
    }

    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    const selectedCompany = companies.find((c) => c._id === adminFormData.companyId);
    const newAdmin = {
      _id: 'admin_' + Date.now(),
      name: adminFormData.name,
      email: adminFormData.email,
      username: adminFormData.username,
      mobile: adminFormData.mobile,
      status: adminFormData.status,
      lastLogin: null,
      company: selectedCompany ? { _id: selectedCompany._id, name: selectedCompany.name, code: selectedCompany.code } : null,
    };
    setAdmins((prev) => [...prev, newAdmin]);
    showToast('Company admin created successfully!', 'success');
    setIsCreateModalOpen(false);
    resetCreateForm();
    setSubmitting(false);
  };

  // EDIT admin — update local state (mock)
  const openEditModal = (admin) => {
    setEditingAdmin(admin);
    setEditFormData({ name: admin.name, email: admin.email, mobile: admin.mobile || '', status: admin.status });
    setIsEditModalOpen(true);
  };

  const handleEditAdmin = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    setAdmins((prev) => prev.map((a) => a._id === editingAdmin._id ? { ...a, ...editFormData } : a));
    showToast('Admin updated successfully!', 'success');
    setIsEditModalOpen(false);
    setEditSubmitting(false);
  };

  // RESET password — mock (just simulate)
  const openResetModal = (admin) => {
    setResetAdmin(admin);
    setNewPassword('');
    setConfirmNewPassword('');
    setIsResetModalOpen(true);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) { showToast('Passwords do not match.', 'error'); return; }
    if (newPassword.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
    setResetSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    showToast('Password reset successfully! (demo mode)', 'success');
    setIsResetModalOpen(false);
    setResetSubmitting(false);
  };

  // DELETE admin — remove from local state (mock)
  const openDeleteModal = (admin) => {
    setDeletingAdmin(admin);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteAdmin = async () => {
    await new Promise((r) => setTimeout(r, 400));
    setAdmins((prev) => prev.filter((a) => a._id !== deletingAdmin._id));
    showToast('Company admin removed.', 'success');
    setIsDeleteModalOpen(false);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center shadow-md">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Super Admin Control</h1>
          </div>
          <p className="text-sm text-slate-500 ml-10">
            Manage company administrator accounts across all subsidiaries.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={fetchData}
            title="Refresh"
            className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            id="btn-superadmin-change-password"
            onClick={() => {
              setCurrentPassword('');
              setSuperAdminNewPassword('');
              setSuperAdminConfirmPassword('');
              setChangePasswordError('');
              setChangePasswordSuccess('');
              setIsChangePasswordModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition shadow-xs"
            title="Change Super Admin Password"
          >
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <span>Change Password</span>
          </button>

          <button
            id="btn-superadmin-settings"
            onClick={() => navigate('/super-admin/settings')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition"
            title="Super Admin Settings"
          >
            <Settings className="w-4 h-4 text-slate-600" />
            <span>Settings</span>
          </button>

          <button
            id="btn-create-company-admin"
            onClick={() => { resetCreateForm(); setIsCreateModalOpen(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Company Admin</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-900">{admins.length}</div>
              <div className="text-xs text-slate-500 font-medium">Total Company Admins</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-900">
                {admins.filter((a) => a.status === 'active').length}
              </div>
              <div className="text-xs text-slate-500 font-medium">Active Admins</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-900">{companies.length}</div>
              <div className="text-xs text-slate-500 font-medium">Registered Companies</div>
            </div>
          </div>
        </div>
      </div>

      {/* Company Admin Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header with filters */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-900">Company Administrators</h2>
            <p className="text-xs text-slate-500 mt-0.5">{filteredAdmins.length} admin(s) found</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                placeholder="Search admins..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none w-full sm:w-48"
              />
            </div>
            {/* Company Filter */}
            <select
              value={selectedCompanyFilter}
              onChange={(e) => setSelectedCompanyFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            >
              <option value="all">All Companies</option>
              {companies.map((c) => (
                <option key={c._id} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Loading administrators...</p>
            </div>
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <Users className="w-8 h-8 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-700">No Company Admins Found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchTerm ? 'No admins match your search.' : 'Create the first company admin to get started.'}
              </p>
            </div>
            {!searchTerm && (
              <button
                onClick={() => { resetCreateForm(); setIsCreateModalOpen(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create First Admin
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Admin</th>
                  <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Company</th>
                  <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Contact</th>
                  <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Last Login</th>
                  <th className="text-right px-6 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdmins.map((admin) => (
                  <tr key={admin._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-700 shrink-0">
                          {admin.name?.[0]?.toUpperCase() || 'A'}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{admin.name}</div>
                          <div className="text-xs text-slate-500">@{admin.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${getCompanyColor(admin.company?.code)}`}>
                        {admin.company?.code || '—'}
                      </span>
                      <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[120px]">{admin.company?.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-700 font-medium">{admin.email}</div>
                      {admin.mobile && <div className="text-xs text-slate-400">{admin.mobile}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                        admin.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${admin.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {admin.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {admin.lastLogin
                            ? new Date(admin.lastLogin).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : 'Never'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(admin)}
                          title="Edit admin"
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openResetModal(admin)}
                          title="Reset password"
                          className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openDeleteModal(admin)}
                          title="Remove admin"
                          className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================== CREATE ADMIN MODAL ===================== */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => { setIsCreateModalOpen(false); resetCreateForm(); }}
        title="Create Company Administrator"
      >
        <form onSubmit={handleCreateAdmin} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Company Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Assign to Company <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={adminFormData.companyId}
              onChange={(e) => setAdminFormData({ ...adminFormData, companyId: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            >
              <option value="">— Select a company —</option>
              {companies.map((c) => (
                <option key={c._id} value={c._id}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Full Name <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                placeholder="e.g., Rajesh Kumar"
                value={adminFormData.name}
                onChange={(e) => setAdminFormData({ ...adminFormData, name: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            {/* Username */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Username <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                placeholder="e.g., rajesh.admin"
                value={adminFormData.username}
                onChange={(e) => setAdminFormData({ ...adminFormData, username: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Email <span className="text-rose-500">*</span></label>
            <input
              type="email"
              required
              placeholder="admin@company.in"
              value={adminFormData.email}
              onChange={(e) => setAdminFormData({ ...adminFormData, email: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          {/* Mobile */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Mobile (optional)</label>
            <input
              type="tel"
              placeholder="+91 XXXXXXXXXX"
              value={adminFormData.mobile}
              onChange={(e) => setAdminFormData({ ...adminFormData, mobile: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Password <span className="text-rose-500">*</span></label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Min. 6 characters"
                  value={adminFormData.password}
                  onChange={(e) => setAdminFormData({ ...adminFormData, password: e.target.value })}
                  className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Confirm Password <span className="text-rose-500">*</span></label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  placeholder="Re-enter password"
                  value={adminFormData.confirmPassword}
                  onChange={(e) => setAdminFormData({ ...adminFormData, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Account Status</label>
            <select
              value={adminFormData.status}
              onChange={(e) => setAdminFormData({ ...adminFormData, status: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { setIsCreateModalOpen(false); resetCreateForm(); }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md shadow-purple-600/20 transition disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Admin Account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== EDIT ADMIN MODAL ===================== */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Company Admin">
        <form onSubmit={handleEditAdmin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={editFormData.email}
              onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Mobile</label>
            <input
              type="tel"
              value={editFormData.mobile}
              onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
            <select
              value={editFormData.status}
              onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-none"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition">Cancel</button>
            <button type="submit" disabled={editSubmitting} className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition disabled:opacity-50">
              {editSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== RESET PASSWORD MODAL ===================== */}
      <Modal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} title={`Reset Password — ${resetAdmin?.name}`}>
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Set a new password for <strong>{resetAdmin?.name}</strong> ({resetAdmin?.email}).
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
              placeholder="Min. 6 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
              placeholder="Re-enter new password"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={() => setIsResetModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition">Cancel</button>
            <button type="submit" disabled={resetSubmitting} className="px-6 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition disabled:opacity-50">
              {resetSubmitting ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== SUPER ADMIN CHANGE PASSWORD MODAL ===================== */}
      <Modal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        title="Super Admin — Change Password"
      >
        <form onSubmit={handleSuperAdminChangePassword} className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            Update your master password for account <strong>QCL_ADMIN</strong>. Password must contain at least 8 characters.
          </p>

          {changePasswordSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{changePasswordSuccess}</span>
            </div>
          )}

          {changePasswordError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{changePasswordError}</span>
            </div>
          )}

          {/* Current Password */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Current Password <span className="text-indigo-600">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                required
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono rounded-xl px-3.5 py-2.5 pr-10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              New Password <span className="text-indigo-600">*</span>
            </label>
            <div className="relative">
              <input
                type={showSuperAdminNewPassword ? 'text' : 'password'}
                required
                placeholder="Enter new password (min. 8 characters)"
                value={superAdminNewPassword}
                onChange={(e) => setSuperAdminNewPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono rounded-xl px-3.5 py-2.5 pr-10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowSuperAdminNewPassword(!showSuperAdminNewPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showSuperAdminNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Confirm New Password <span className="text-indigo-600">*</span>
            </label>
            <div className="relative">
              <input
                type={showSuperAdminConfirmPassword ? 'text' : 'password'}
                required
                placeholder="Confirm new password"
                value={superAdminConfirmPassword}
                onChange={(e) => setSuperAdminConfirmPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-xs font-mono rounded-xl px-3.5 py-2.5 pr-10 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowSuperAdminConfirmPassword(!showSuperAdminConfirmPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showSuperAdminConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsChangePasswordModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={changePasswordLoading}
              className="inline-flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              {changePasswordLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Changing Password...</span>
                </>
              ) : (
                <span>Change Password</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== DELETE CONFIRM MODAL ===================== */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteAdmin}
        title="Remove Company Admin"
        message={`Are you sure you want to remove ${deletingAdmin?.name} (${deletingAdmin?.email}) as a company admin? This action cannot be undone.`}
        confirmLabel="Remove Admin"
        confirmVariant="danger"
      />
    </div>
  );
};

export default SuperAdminDashboard;
