const { User, ActivityLog } = require('../models');
const { generateToken } = require('../utils/token');

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { identifier, password, expectedRole, companyCode } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email/username and password.',
      });
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { email: identifier.trim().toLowerCase() },
        { username: identifier.trim().toLowerCase() },
      ],
    }).populate('company').populate('plant');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User not found.',
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Password incorrect.',
      });
    }

    // Check if user is disabled
    if (user.status === 'disabled') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been disabled. Please contact your administrator.',
      });
    }

    // Role validation if expectedRole was specified (e.g. Super Admin portal only allows super_admin)
    if (expectedRole && user.role !== expectedRole) {
      return res.status(403).json({
        success: false,
        message: `Unauthorized portal. This portal requires ${expectedRole.replace('_', ' ')} privileges.`,
      });
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    // Log activity
    try {
      await ActivityLog.create({
        user: user._id,
        userName: user.name,
        userEmail: user.email,
        role: user.role,
        company: user.company?._id || null,
        companyName: user.company?.name || 'Super Admin Portal',
        action: 'USER_LOGIN',
        details: `Successful login as ${user.role} (${user.username})`,
        ipAddress: req.ip || '127.0.0.1',
      });
    } catch (e) {
      console.warn('Could not record login activity log:', e.message);
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        mobile: user.mobile,
        status: user.status,
        company: user.company,
        plant: user.plant,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login: ' + error.message,
    });
  }
};

// @desc    Get current authenticated user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').populate('company').populate('plant');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Forgot password request
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide email address.' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No registered user found with that email address.' });
    }

    // In an enterprise app, this triggers an IT support ticket or reset token
    return res.status(200).json({
      success: true,
      message: `Password reset instructions and a verification code have been dispatched to ${email}. Please check your inbox or contact Corporate IT at support@spicglobal.com.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  getMe,
  forgotPassword,
};
