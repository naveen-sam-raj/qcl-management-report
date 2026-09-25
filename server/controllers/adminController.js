const { User, Company, Plant, Report, ActivityLog } = require('../models');
const {
  getISTStartOfDay,
  getISTEndOfDay,
  getLicenseStatus,
} = require('../utils/licenseUtils');

// @desc    Create a new Company Admin
// @route   POST /api/admin/company-admins
// @access  Private (Super Admin)
const createCompanyAdmin = async (req, res) => {
  try {
    const {
      companyId,
      name,
      email,
      username,
      password,
      confirmPassword,
      mobile,
      status = 'active',
      maxUsers,
      licensePeriodFrom,
      licensePeriodTo,
      licenseFrom,
      licenseTo,
    } = req.body;

    // Validation - Required fields
    if (!companyId || !name || !email || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (Company, Name, Email, Username, Password).',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password and Confirm Password do not match.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    // ── Maximum Users Validation ──
    const parsedMaxUsers = Number(maxUsers);
    if (
      maxUsers === undefined ||
      maxUsers === null ||
      maxUsers === '' ||
      isNaN(parsedMaxUsers) ||
      !Number.isInteger(parsedMaxUsers) ||
      parsedMaxUsers < 1
    ) {
      return res.status(400).json({
        success: false,
        message: 'Maximum Users is required and must be a positive whole number (minimum 1).',
      });
    }

    // ── License Dates Validation ──
    const rawFrom = licensePeriodFrom || licenseFrom;
    const rawTo = licensePeriodTo || licenseTo;

    if (!rawFrom) {
      return res.status(400).json({
        success: false,
        message: 'License Period From date is required.',
      });
    }

    if (!rawTo) {
      return res.status(400).json({
        success: false,
        message: 'License Period To date is required.',
      });
    }

    const startIST = getISTStartOfDay(rawFrom);
    const endIST = getISTEndOfDay(rawTo);

    if (!startIST || isNaN(startIST.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid License Period From date format.',
      });
    }

    if (!endIST || isNaN(endIST.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid License Period To date format.',
      });
    }

    if (endIST.getTime() < startIST.getTime()) {
      return res.status(400).json({
        success: false,
        message: 'License end date must be after the license start date.',
      });
    }

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Specified company does not exist.',
      });
    }

    // Check if email or username already taken
    const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    const existingUsername = await User.findOne({ username: username.trim().toLowerCase() });
    if (existingUsername) {
      return res.status(400).json({
        success: false,
        message: 'This username is already taken. Please choose another.',
      });
    }

    // Create Company Admin with maxUsers and license period
    const newAdmin = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      username: username.trim().toLowerCase(),
      password,
      mobile: mobile || '',
      role: 'company_admin',
      company: company._id,
      status: status || 'active',
      maxUsers: parsedMaxUsers,
      licenseFrom: startIST,
      licenseTo: endIST,
    });

    // Record audit log
    try {
      await ActivityLog.create({
        user: req.user?._id || req.user?.id,
        userName: req.user?.name || req.user?.username || 'Super Admin',
        userEmail: req.user?.email || 'admin@spicglobal.com',
        role: req.user?.role || 'super_admin',
        company: company._id,
        companyName: company.name,
        action: 'COMPANY_ADMIN_CREATED',
        details: `Created Company Admin "${name}" (${username}) for ${company.name} [Max Users: ${parsedMaxUsers}, License: ${rawFrom} to ${rawTo}]`,
        ipAddress: req.ip || '127.0.0.1',
      });
    } catch (e) {
      console.warn('Audit log error:', e.message);
    }

    const safeAdmin = await User.findById(newAdmin._id).select('-password').populate('company');
    const adminObj = safeAdmin.toObject ? safeAdmin.toObject() : { ...safeAdmin };
    adminObj.usersCount = 0;
    adminObj.licenseStatus = getLicenseStatus(startIST, endIST);

    return res.status(201).json({
      success: true,
      message: `Company Admin for ${company.name} successfully created.`,
      admin: adminObj,
    });
  } catch (error) {
    console.error('Error creating company admin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all Company Admins with user counts and license statuses
// @route   GET /api/admin/company-admins
// @access  Private (Super Admin)
const getCompanyAdmins = async (req, res) => {
  try {
    const rawAdmins = await User.find({ role: 'company_admin' })
      .select('-password')
      .populate('company')
      .sort({ createdAt: -1 });

    const admins = await Promise.all(
      rawAdmins.map(async (adminDoc) => {
        const admin = adminDoc.toObject ? adminDoc.toObject() : { ...adminDoc };
        const companyId = admin.company?._id || admin.company;

        // Count regular users belonging to this company
        const usersCount = companyId
          ? await User.countDocuments({ role: 'user', company: companyId })
          : 0;

        admin.usersCount = usersCount;
        admin.maxUsers = admin.maxUsers !== undefined && admin.maxUsers !== null ? admin.maxUsers : 10;
        admin.licenseStatus = getLicenseStatus(admin.licenseFrom, admin.licenseTo);

        return admin;
      })
    );

    return res.status(200).json({
      success: true,
      count: admins.length,
      admins,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update an existing Company Admin
// @route   PUT /api/admin/company-admins/:id
// @access  Private (Super Admin)
const updateCompanyAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await User.findById(id);

    if (!admin || admin.role !== 'company_admin') {
      return res.status(404).json({ success: false, message: 'Company Admin not found.' });
    }

    const {
      name,
      email,
      mobile,
      status,
      maxUsers,
      licensePeriodFrom,
      licensePeriodTo,
      licenseFrom,
      licenseTo,
    } = req.body;

    const updates = {};
    if (name) updates.name = name.trim();
    if (email) updates.email = email.trim().toLowerCase();
    if (mobile !== undefined) updates.mobile = mobile;
    if (status) updates.status = status;

    // Validate and update Maximum Users if provided
    if (maxUsers !== undefined && maxUsers !== null && maxUsers !== '') {
      const parsedMaxUsers = Number(maxUsers);
      if (isNaN(parsedMaxUsers) || !Number.isInteger(parsedMaxUsers) || parsedMaxUsers < 1) {
        return res.status(400).json({
          success: false,
          message: 'Maximum Users must be a positive whole number (minimum 1).',
        });
      }
      updates.maxUsers = parsedMaxUsers;
    }

    // Validate and update License Dates if provided
    const rawFrom = licensePeriodFrom !== undefined ? licensePeriodFrom : licenseFrom;
    const rawTo = licensePeriodTo !== undefined ? licensePeriodTo : licenseTo;

    const targetFrom = rawFrom ? getISTStartOfDay(rawFrom) : (admin.licenseFrom ? new Date(admin.licenseFrom) : null);
    const targetTo = rawTo ? getISTEndOfDay(rawTo) : (admin.licenseTo ? new Date(admin.licenseTo) : null);

    if (rawFrom !== undefined && (!targetFrom || isNaN(targetFrom.getTime()))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid License Period From date format.',
      });
    }

    if (rawTo !== undefined && (!targetTo || isNaN(targetTo.getTime()))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid License Period To date format.',
      });
    }

    if (targetFrom && targetTo && targetTo.getTime() < targetFrom.getTime()) {
      return res.status(400).json({
        success: false,
        message: 'License end date must be after the license start date.',
      });
    }

    if (rawFrom !== undefined) updates.licenseFrom = targetFrom;
    if (rawTo !== undefined) updates.licenseTo = targetTo;

    const updatedAdmin = await User.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .select('-password')
      .populate('company');

    const adminObj = updatedAdmin.toObject ? updatedAdmin.toObject() : { ...updatedAdmin };
    const companyId = adminObj.company?._id || adminObj.company;
    adminObj.usersCount = companyId
      ? await User.countDocuments({ role: 'user', company: companyId })
      : 0;
    adminObj.licenseStatus = getLicenseStatus(adminObj.licenseFrom, adminObj.licenseTo);

    return res.status(200).json({
      success: true,
      message: 'Company Admin updated successfully.',
      admin: adminObj,
    });
  } catch (error) {
    console.error('Error updating company admin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Super Admin Overview Stats
// @route   GET /api/admin/overview-stats
// @access  Private (Super Admin)
const getSuperAdminStats = async (req, res) => {
  try {
    const totalCompanies = await Company.countDocuments();
    const activeCompanies = await Company.countDocuments({ status: 'active' });
    const totalAdmins = await User.countDocuments({ role: 'company_admin' });
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalPlants = await Plant.countDocuments();
    const totalReports = await Report.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });

    return res.status(200).json({
      success: true,
      stats: {
        totalCompanies,
        activeCompanies,
        totalAdmins,
        totalUsers,
        totalPlants,
        totalReports,
        activeUsers,
        systemHealth: '100% Operational',
        uptime: '99.98%',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset Company Admin Password
// @route   POST /api/admin/company-admins/:id/reset-password
// @access  Private (Super Admin)
const resetCompanyAdminPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password is required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.',
      });
    }

    const admin = await User.findById(id).populate('company');
    if (!admin || admin.role !== 'company_admin') {
      return res.status(404).json({
        success: false,
        message: 'Company Admin not found.',
      });
    }

    admin.password = newPassword;
    await admin.save();

    // Record audit log
    try {
      await ActivityLog.create({
        user: req.user?._id || req.user?.id,
        userName: req.user?.name || req.user?.username || 'Super Admin',
        userEmail: req.user?.email || 'admin@spicglobal.com',
        role: req.user?.role || 'super_admin',
        company: admin.company?._id || admin.company || null,
        companyName: admin.company?.name || 'Company',
        action: 'COMPANY_ADMIN_PASSWORD_RESET',
        details: `Super Admin reset password for Company Admin "${admin.name}" (${admin.username})`,
        ipAddress: req.ip || '127.0.0.1',
      });
    } catch (e) {
      console.warn('Audit log error:', e.message);
    }

    return res.status(200).json({
      success: true,
      message: `Password for ${admin.name} has been reset successfully.`,
    });
  } catch (error) {
    console.error('Error resetting company admin password:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete Company Admin
// @route   DELETE /api/admin/company-admins/:id
// @access  Private (Super Admin)
const deleteCompanyAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await User.findById(id);

    if (!admin || admin.role !== 'company_admin') {
      return res.status(404).json({
        success: false,
        message: 'Company Admin not found.',
      });
    }

    await User.findByIdAndDelete(id);

    try {
      await ActivityLog.create({
        user: req.user?._id || req.user?.id,
        userName: req.user?.name || req.user?.username || 'Super Admin',
        userEmail: req.user?.email || 'admin@spicglobal.com',
        role: req.user?.role || 'super_admin',
        company: admin.company?._id || admin.company || null,
        action: 'COMPANY_ADMIN_DELETED',
        details: `Deleted Company Admin "${admin.name}" (${admin.username})`,
        ipAddress: req.ip || '127.0.0.1',
      });
    } catch (e) {
      console.warn('Audit log error:', e.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Company Admin removed successfully.',
    });
  } catch (error) {
    console.error('Error deleting company admin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createCompanyAdmin,
  getCompanyAdmins,
  updateCompanyAdmin,
  getSuperAdminStats,
  resetCompanyAdminPassword,
  deleteCompanyAdmin,
};
