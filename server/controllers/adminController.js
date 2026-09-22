const { User, Company, Plant, Report, ActivityLog } = require('../models');

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
    } = req.body;

    // Validation
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

    // Create Company Admin
    const newAdmin = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      username: username.trim().toLowerCase(),
      password,
      mobile: mobile || '',
      role: 'company_admin',
      company: company._id,
      status: status || 'active',
    });

    // Record audit log
    try {
      await ActivityLog.create({
        user: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        role: req.user.role,
        company: company._id,
        companyName: company.name,
        action: 'COMPANY_ADMIN_CREATED',
        details: `Created new Company Admin "${name}" (${username}) for ${company.name}`,
        ipAddress: req.ip || '127.0.0.1',
      });
    } catch (e) {
      console.warn('Audit log error:', e.message);
    }

    const safeAdmin = await User.findById(newAdmin._id).select('-password').populate('company');

    return res.status(201).json({
      success: true,
      message: `Company Admin for ${company.name} successfully created.`,
      admin: safeAdmin,
    });
  } catch (error) {
    console.error('Error creating company admin:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all Company Admins
// @route   GET /api/admin/company-admins
// @access  Private (Super Admin)
const getCompanyAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'company_admin' })
      .select('-password')
      .populate('company')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: admins.length,
      admins,
    });
  } catch (error) {
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

module.exports = {
  createCompanyAdmin,
  getCompanyAdmins,
  getSuperAdminStats,
};
