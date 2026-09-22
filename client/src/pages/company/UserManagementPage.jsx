import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/common/Toast';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import { MOCK_USERS, MOCK_PLANTS } from '../../services/mockData';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Edit,
  Trash2,
  KeyRound,
  Shield,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Factory,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

const UserManagementPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [usersList, setUsersList] = useState([]);
  const [plants, setPlants] = useState([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlantFilter, setSelectedPlantFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeUser, setActiveUser] = useState(null);

  // Forms
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    mobile: '',
    plantId: '',
    role: 'user',
    status: 'active',
  });

  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    plantId: '',
    role: 'user',
    status: 'active',
  });

  const [resetFormData, setResetFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  const [submitting, setSubmitting] = useState(false);

  // Load mock users and plants
  const loadData = async () => {
    try {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 400));
      // Filter by company admin's company
      const companyCode = user?.company?.code || 'TFL';
      const companyUsers = MOCK_USERS.filter(
        (u) => u.role === 'user' && u.company?.code === companyCode
      );
      const companyPlants = MOCK_PLANTS.filter(
        (p) => p.company.code === companyCode
      );
      setUsersList(companyUsers);
      setPlants(companyPlants);
      if (companyPlants.length > 0 && !formData.plantId) {
        setFormData((prev) => ({ ...prev, plantId: companyPlants[0]._id }));
      }
    } catch (err) {
      showToast('Error loading user directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Create User — mock (add to local state)
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (formData.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    const selectedPlant = plants.find((p) => p._id === formData.plantId);
    const newUser = {
      _id: 'user_' + Date.now(),
      name: formData.name,
      email: formData.email,
      username: formData.username,
      mobile: formData.mobile,
      role: formData.role || 'user',
      status: formData.status,
      company: user?.company,
      plant: selectedPlant ? { _id: selectedPlant._id, name: selectedPlant.name, code: selectedPlant.code } : null,
      lastLogin: null,
    };
    setUsersList((prev) => [...prev, newUser]);
    showToast('User created successfully', 'success');
    setIsCreateModalOpen(false);
    setFormData({ name: '', email: '', username: '', password: '', confirmPassword: '', mobile: '', plantId: plants[0]?._id || '', role: 'user', status: 'active' });
    setSubmitting(false);
  };

  // Edit User — mock (update local state)
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!activeUser) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 400));
    setUsersList((prev) => prev.map((u) => u._id === activeUser._id ? { ...u, ...editFormData } : u));
    showToast('User profile updated successfully', 'success');
    setIsEditModalOpen(false);
    setActiveUser(null);
    setSubmitting(false);
  };

  // Reset Password — mock (just simulate)
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (resetFormData.newPassword !== resetFormData.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (resetFormData.newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 400));
    showToast('Password reset successfully (demo mode)', 'success');
    setIsResetModalOpen(false);
    setActiveUser(null);
    setResetFormData({ newPassword: '', confirmPassword: '' });
    setSubmitting(false);
  };

  // Toggle User Status — mock
  const handleToggleStatus = async (targetUser) => {
    setUsersList((prev) => prev.map((u) =>
      u._id === targetUser._id
        ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' }
        : u
    ));
    showToast(`User ${targetUser.status === 'active' ? 'deactivated' : 'activated'} (demo)`, 'info');
  };

  // Delete User — mock
  const handleDeleteConfirm = async () => {
    if (!activeUser) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 400));
    setUsersList((prev) => prev.filter((u) => u._id !== activeUser._id));
    showToast('User removed successfully', 'success');
    setIsDeleteModalOpen(false);
    setActiveUser(null);
    setSubmitting(false);
  };

  // Filtered list
  const filteredUsers = usersList.filter((u) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      !s ||
      u.name.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      u.username.toLowerCase().includes(s);

    const plantId = (u.plant?._id || u.plant || '').toString();
    const matchesPlant = selectedPlantFilter === 'all' || plantId === selectedPlantFilter;

    const matchesStatus = selectedStatusFilter === 'all' || u.status === selectedStatusFilter;

    return matchesSearch && matchesPlant && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 mb-1.5">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            ORGANIZATIONAL ACCESS CONTROL
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            User Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage operators, assign plant units, toggle account access, and reset passwords
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            title="Refresh Users"
            className="p-2.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            id="btn-create-user-modal"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm shadow-blue-600/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-card">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by name, email, or username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={selectedPlantFilter}
          onChange={(e) => setSelectedPlantFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Plant Units</option>
          {plants.map((p) => (
            <option key={p._id || p.id} value={p._id || p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={selectedStatusFilter}
          onChange={(e) => setSelectedStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="disabled">Disabled Only</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">User <span className="normal-case font-normal text-blue-500 text-[10px]">(click to view dashboard)</span></th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Plant Assignment</th>
                <th className="px-6 py-3.5">Contact</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-slate-400">
                    No users matching the selected filters found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u._id || u.id} className="hover:bg-blue-50/30 transition group cursor-pointer">
                    {/* Name cell — click to open user profile */}
                    <td
                      className="px-6 py-4"
                      onClick={() => {
                        const companySlug = user?.company?.code?.toLowerCase() || 'tfl';
                        navigate(`/admin/${companySlug}/users/${u._id}`);
                      }}
                    >
                      <div className="font-bold text-slate-900 group-hover:text-blue-700 transition flex items-center gap-1.5">
                        {u.name}
                        <ExternalLink className="w-3 h-3 text-blue-400 opacity-0 group-hover:opacity-100 transition" />
                      </div>
                      <div className="text-slate-400 font-mono text-[11px]">{u.username}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          u.role === 'company_admin'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {u.plant ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                          <Factory className="w-3 h-3 text-blue-600" />
                          {u.plant.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-700">{u.email}</div>
                      <div className="text-slate-400 text-[11px]">{u.mobile || '—'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        title="Click to toggle status"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition ${
                          u.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.status === 'active' ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        />
                        {u.status.toUpperCase()}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {/* View Dashboard */}
                        <button
                          onClick={() => {
                            const companySlug = user?.company?.code?.toLowerCase() || 'tfl';
                            navigate(`/admin/${companySlug}/users/${u._id}`);
                          }}
                          title="View User Dashboard"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setActiveUser(u);
                            setEditFormData({
                              name: u.name,
                              email: u.email,
                              mobile: u.mobile || '',
                              plantId: u.plant?._id || u.plant || '',
                              role: u.role,
                              status: u.status,
                            });
                            setIsEditModalOpen(true);
                          }}
                          title="Edit User"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setActiveUser(u);
                            setResetFormData({ newPassword: '', confirmPassword: '' });
                            setIsResetModalOpen(true);
                          }}
                          title="Reset Password"
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setActiveUser(u);
                            setIsDeleteModalOpen(true);
                          }}
                          title="Delete User"
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE USER MODAL (Strictly fields: Full Name, Email, Username, Password, Confirm Password, Mobile, Select Plant, Role, Status) */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New User"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Create an operational crew or user account assigned specifically to this company and industrial plant.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Anand Murugan"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                placeholder="anand@tfl.in"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Username *
              </label>
              <input
                type="text"
                required
                placeholder="tfl_anand"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Password *
              </label>
              <input
                type="password"
                required
                placeholder="Min 6 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Confirm Password *
              </label>
              <input
                type="password"
                required
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                placeholder="+91 98400 00000"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Select Plant *
              </label>
              <select
                value={formData.plantId}
                onChange={(e) => setFormData({ ...formData, plantId: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- No Plant (General User) --</option>
                {plants.map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Role *
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="user">User (View-Only)</option>
                <option value="company_admin">Company Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Status *
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 shadow-sm"
            >
              {submitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT USER MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit User Profile"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                value={editFormData.mobile}
                onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Plant Assignment
              </label>
              <select
                value={editFormData.plantId}
                onChange={(e) => setEditFormData({ ...editFormData, plantId: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- No Plant --</option>
                {plants.map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Status
              </label>
              <select
                value={editFormData.status}
                onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* RESET PASSWORD MODAL */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title={`Reset Password for ${activeUser?.name || 'User'}`}
      >
        <form onSubmit={handleResetSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Set a new credentials password for <span className="font-semibold text-slate-800">{activeUser?.username}</span>.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              New Password *
            </label>
            <input
              type="password"
              required
              placeholder="Min 6 characters"
              value={resetFormData.newPassword}
              onChange={(e) =>
                setResetFormData({ ...resetFormData, newPassword: e.target.value })
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              placeholder="Re-enter password"
              value={resetFormData.confirmPassword}
              onChange={(e) =>
                setResetFormData({ ...resetFormData, confirmPassword: e.target.value })
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsResetModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50"
            >
              {submitting ? 'Resetting...' : 'Confirm Reset'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Confirm User Deletion"
        message={`Are you sure you want to permanently delete user account "${activeUser?.name}" (${activeUser?.username})? This action cannot be reversed.`}
        confirmText="Delete Account"
        isDestructive={true}
        loading={submitting}
      />
    </div>
  );
};

export default UserManagementPage;
