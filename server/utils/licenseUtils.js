/**
 * License Utility functions for SPIC-TFL-Greenstar Analytics
 * Enforces IST (Asia/Kolkata) timezone calculations for License Start & Expiry
 */

/**
 * Format a Date or date string to YYYY-MM-DD in Asia/Kolkata timezone
 */
const toISTDateString = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
};

/**
 * Get start of day (00:00:00.000) in Asia/Kolkata for a given date
 */
const getISTStartOfDay = (dateVal) => {
  if (!dateVal) return null;
  const dateStr = typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())
    ? dateVal.trim()
    : toISTDateString(dateVal);

  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00+05:30`);
};

/**
 * Get end of day (23:59:59.999) in Asia/Kolkata for a given date
 * Ensures license does not expire hours early due to UTC timezone offset
 */
const getISTEndOfDay = (dateVal) => {
  if (!dateVal) return null;
  const dateStr = typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())
    ? dateVal.trim()
    : toISTDateString(dateVal);

  if (!dateStr) return null;
  return new Date(`${dateStr}T23:59:59.999+05:30`);
};

/**
 * Check whether a Company Admin license is valid at the current moment
 * @param {Object} admin - The user document (role: company_admin)
 * @param {Date} [currentTime=new Date()]
 * @returns {Object} { valid: boolean, status: 'Active' | 'Not Started' | 'Expired', message?: string, remainingDays?: number }
 */
const checkLicenseValidity = (admin, currentTime = new Date()) => {
  // Super Admin and regular users have no direct license document restriction
  if (!admin || admin.role !== 'company_admin') {
    return { valid: true, status: 'Active' };
  }

  // Backward compatibility: If existing records do not have licenseFrom or licenseTo
  if (!admin.licenseFrom || !admin.licenseTo) {
    return { valid: true, status: 'Active', isLegacy: true };
  }

  const startIST = getISTStartOfDay(admin.licenseFrom);
  const endIST = getISTEndOfDay(admin.licenseTo);

  if (!startIST || !endIST) {
    return { valid: true, status: 'Active', isLegacy: true };
  }

  const now = currentTime instanceof Date ? currentTime : new Date(currentTime);

  if (now < startIST) {
    return {
      valid: false,
      status: 'Not Started',
      message: 'Your license has not started yet. Please contact the Super Admin.',
    };
  }

  if (now > endIST) {
    return {
      valid: false,
      status: 'Expired',
      message: 'Your license has expired. Please contact the Super Admin.',
    };
  }

  // Active - calculate remaining days until end of day IST
  const diffMs = endIST.getTime() - now.getTime();
  const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return {
    valid: true,
    status: 'Active',
    remainingDays,
  };
};

/**
 * Calculate license status for table listings (Active, Expired, Not Started)
 */
const getLicenseStatus = (licenseFrom, licenseTo, currentTime = new Date()) => {
  if (!licenseFrom || !licenseTo) return 'Active';

  const startIST = getISTStartOfDay(licenseFrom);
  const endIST = getISTEndOfDay(licenseTo);

  if (!startIST || !endIST) return 'Active';

  const now = currentTime instanceof Date ? currentTime : new Date(currentTime);

  if (now < startIST) return 'Not Started';
  if (now > endIST) return 'Expired';
  return 'Active';
};

module.exports = {
  toISTDateString,
  getISTStartOfDay,
  getISTEndOfDay,
  checkLicenseValidity,
  getLicenseStatus,
};
