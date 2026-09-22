import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MOCK_USERS, MOCK_PLANTS, MOCK_REPORTS, MOCK_LOGS } from '../../services/mockData';
import {
  ArrowLeft,
  User,
  Factory,
  Mail,
  Phone,
  Shield,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Cpu,
  Eye,
  Calendar,
  Building2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const UserProfileDashboard = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: adminUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState(null);
  const [assignedPlant, setAssignedPlant] = useState(null);
  const [telemetry, setTelemetry] = useState([]);
  const [userReports, setUserReports] = useState([]);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 400));

      // Find user by id
      const found = MOCK_USERS.find((u) => u._id === userId);
      if (!found) {
        navigate(-1);
        return;
      }
      const { password: _, ...safeUser } = found;
      setProfileUser(safeUser);

      // Find their assigned plant
      const plant = MOCK_PLANTS.find(
        (p) => p._id === (safeUser.plant?._id || safeUser.plant)
      );
      setAssignedPlant(plant || null);

      if (plant) {
        // Generate mock telemetry for this user's plant
        const mockTelemetry = Array.from({ length: 14 }, (_, i) => ({
          date: new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(
            'en-IN',
            { day: '2-digit', month: 'short' }
          ),
          efficiency: Math.max(60, (plant.efficiency || 90) + Math.floor(Math.random() * 10) - 5),
          production: Math.max(50, (plant.currentProduction || 100) + Math.floor(Math.random() * 20) - 10),
        }));
        setTelemetry(mockTelemetry);
      }

      // Filter reports for this user's company/plant
      const companyCode = safeUser.company?.code;
      const plantCode = safeUser.plant?.code;
      const reports = MOCK_REPORTS.filter(
        (r) =>
          (!companyCode || r.company.code === companyCode) &&
          (!plantCode || r.plant?.code === plantCode)
      );
      setUserReports(reports);

      setLoading(false);
    };

    loadProfile();
  }, [userId, navigate]);

  // Determine the back URL based on the admin's company
  const getBackUrl = () => {
    const companyCode = adminUser?.company?.code?.toLowerCase();
    if (companyCode) return `/admin/${companyCode}/users`;
    return -1;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading user profile...</p>
        </div>
      </div>
    );
  }

  if (!profileUser) return null;

  const statusColor =
    profileUser.status === 'active'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : 'bg-rose-100 text-rose-800 border-rose-200';

  const plantStatusColor =
    assignedPlant?.status === 'operational'
      ? 'text-emerald-600 bg-emerald-50'
      : assignedPlant?.status === 'maintenance'
      ? 'text-amber-600 bg-amber-50'
      : 'text-slate-500 bg-slate-100';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Back Navigation ── */}
      <div>
        <button
          onClick={() => navigate(getBackUrl())}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to User Management
        </button>

        {/* Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 mb-1.5">
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              USER PROFILE DASHBOARD
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {profileUser.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              @{profileUser.username} · {profileUser.company?.name || 'No Company'}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${statusColor}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                profileUser.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'
              } inline-block`}
            />
            {profileUser.status === 'active' ? 'Active Account' : 'Inactive Account'}
          </span>
        </div>
      </div>

      {/* ── Profile Info Cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* User Details Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-black shadow-lg">
              {profileUser.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="font-extrabold text-slate-900 text-base">{profileUser.name}</div>
              <div className="text-xs text-slate-400 font-mono">@{profileUser.username}</div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">{profileUser.email}</span>
            </div>
            {profileUser.mobile && (
              <div className="flex items-center gap-2.5 text-xs text-slate-600">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{profileUser.mobile}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <Shield className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="capitalize font-semibold">{profileUser.role.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{profileUser.company?.name || 'No Company'}</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-600">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                Last login:{' '}
                {profileUser.lastLogin
                  ? new Date(profileUser.lastLogin).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Assigned Plant Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
              <Factory className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Assigned Plant Unit</h3>
          </div>

          {assignedPlant ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-slate-900 text-base">{assignedPlant.name}</div>
                  <div className="text-xs text-slate-400 font-mono">{assignedPlant.code}</div>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${plantStatusColor}`}>
                  {assignedPlant.status === 'operational' ? '● Operational' : '⚠ Maintenance'}
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">{assignedPlant.description}</p>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <div className="text-lg font-extrabold text-slate-900">
                    {assignedPlant.efficiency > 0 ? `${assignedPlant.efficiency}%` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Efficiency</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <div className="text-lg font-extrabold text-slate-900">
                    {assignedPlant.currentProduction > 0
                      ? `${assignedPlant.currentProduction} MT`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">Today's Output</div>
                </div>
              </div>

              {/* Metrics */}
              {assignedPlant.metrics?.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-t border-slate-100">
                  <span className="text-slate-500">{m.label}</span>
                  <span className="font-bold text-slate-800">{m.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <Factory className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-xs font-semibold text-slate-500">No Plant Assigned</p>
              <p className="text-[11px] text-slate-400 text-center">
                This user hasn't been assigned to a plant unit yet.
              </p>
            </div>
          )}
        </div>

        {/* Quick Stats Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
              <Activity className="w-4 h-4 text-purple-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Activity Overview</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-slate-700">Reports Available</span>
              </div>
              <span className="text-sm font-extrabold text-slate-900">{userReports.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-medium text-slate-700">Plant Capacity</span>
              </div>
              <span className="text-sm font-extrabold text-slate-900">
                {assignedPlant ? `${assignedPlant.capacity} MT` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-slate-700">Current Output</span>
              </div>
              <span className="text-sm font-extrabold text-slate-900">
                {assignedPlant?.currentProduction > 0
                  ? `${assignedPlant.currentProduction} MT`
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-medium text-slate-700">Plant Status</span>
              </div>
              <span
                className={`text-xs font-extrabold ${
                  assignedPlant?.status === 'operational'
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {assignedPlant
                  ? assignedPlant.status === 'operational'
                    ? 'Operational'
                    : 'Maintenance'
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Telemetry Chart ── */}
      {telemetry.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {assignedPlant?.name} — 14-Day Telemetry
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Production output and efficiency trend for this user's assigned plant
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                Production (MT)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                Efficiency (%)
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={telemetry} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '11px',
                  color: '#f1f5f9',
                }}
              />
              <Area
                type="monotone"
                dataKey="production"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#prodGrad)"
                name="Production (MT)"
              />
              <Area
                type="monotone"
                dataKey="efficiency"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#effGrad)"
                name="Efficiency (%)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Reports Section ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Available Reports</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Reports linked to {profileUser.name}'s plant assignment
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">
            {userReports.length} report{userReports.length !== 1 ? 's' : ''}
          </span>
        </div>

        {userReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-slate-300" />
            </div>
            <p className="text-xs text-slate-500 font-semibold">No reports available</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {userReports.map((report) => (
              <div
                key={report._id}
                className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/60 transition"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      report.status === 'completed'
                        ? 'bg-emerald-100'
                        : 'bg-amber-100'
                    }`}
                  >
                    <FileSpreadsheet
                      className={`w-4 h-4 ${
                        report.status === 'completed'
                          ? 'text-emerald-600'
                          : 'text-amber-600'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">{report.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {report.reportType} · {report.period}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
                    <Calendar className="w-3 h-3" />
                    {new Date(report.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                      report.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {report.status === 'completed' ? 'Completed' : 'Pending'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfileDashboard;
