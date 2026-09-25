import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { ShieldCheck, Calendar, Users, AlertTriangle, Clock } from 'lucide-react';

const formatDateDisplay = (dateVal) => {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return '—';
  }
};

const LicenseInfoCard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(user);

  useEffect(() => {
    // Fetch latest user profile from /api/auth/me to get live user count and license status
    const fetchMe = async () => {
      try {
        const res = await api.get('/auth/me');
        if (res.data?.success && res.data.user) {
          setProfile(res.data.user);
        }
      } catch {
        // use local user profile
      }
    };
    fetchMe();
  }, []);

  const admin = profile || user;
  if (!admin || admin.role !== 'company_admin') return null;

  const licenseStatus = admin.licenseStatus || 'Active';
  const licenseFrom = admin.licenseFrom;
  const licenseTo = admin.licenseTo;
  const maxUsers = admin.maxUsers !== undefined && admin.maxUsers !== null ? admin.maxUsers : 10;
  const usersCount = admin.usersCount !== undefined ? admin.usersCount : 0;

  // Calculate remaining days if licenseTo is present
  let remainingDays = admin.remainingDays;
  if (remainingDays === undefined && licenseTo) {
    try {
      const now = new Date();
      const end = new Date(licenseTo);
      const diff = end.getTime() - now.getTime();
      remainingDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    } catch {
      remainingDays = null;
    }
  }

  const isExpiringSoon = remainingDays !== null && remainingDays !== undefined && remainingDays <= 7 && remainingDays >= 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 transition-all">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Shield Icon + Status + Expiry countdown */}
        <div className="flex items-center gap-3.5">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
              licenseStatus === 'Active'
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : licenseStatus === 'Not Started'
                ? 'bg-amber-50 text-amber-600 border border-amber-100'
                : 'bg-rose-50 text-rose-600 border border-rose-100'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">License Information</h3>
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                  licenseStatus === 'Active'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : licenseStatus === 'Not Started'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                License Status: {licenseStatus}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {remainingDays !== null && remainingDays !== undefined
                ? `License expires in ${remainingDays} days`
                : 'Enterprise Subscription'}
            </p>
          </div>
        </div>

        {/* Right: Key Stats Columns */}
        <div className="grid grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-6 text-left">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              License From
            </span>
            <span className="text-xs font-bold text-slate-800">
              {formatDateDisplay(licenseFrom)}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              License To
            </span>
            <span className="text-xs font-bold text-slate-800">
              {formatDateDisplay(licenseTo)}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Users
            </span>
            <span className="text-xs font-bold text-slate-800">
              {usersCount} / {maxUsers}
            </span>
          </div>
        </div>
      </div>

      {/* Expiry Warning Banner (Requirement 9: When license is close to expiry <= 7 days) */}
      {isExpiringSoon && (
        <div className="mt-3.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Your license expires in <strong>{remainingDays} days</strong>. Please contact the Super Admin for renewal.
          </span>
        </div>
      )}
    </div>
  );
};

export default LicenseInfoCard;
