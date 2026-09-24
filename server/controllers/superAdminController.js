const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { SuperAdmin, ActivityLog } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'spic_tfl_greenstar_super_secret_jwt_key_2026';

/**
 * Validate password requirements:
 * - Minimum 8 characters.
 * - Require at least one uppercase letter.
 * - Require at least one lowercase letter.
 * - Require at least one number.
 * - Require at least one special character.
 */
const validatePasswordRequirements = (password) => {
  if (!password || typeof password !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter (A-Z).';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter (a-z).';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number (0-9).';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&*...).';
  }
  return null;
};

/**
 * Initialize default Super Admin if not already present.
 * Uses environment variable INITIAL_SUPER_ADMIN_PASSWORD / DEFAULT_SUPER_ADMIN_PASSWORD
 * Default username: QCL_ADMIN
 */
const initializeDefaultSuperAdmin = async () => {
  try {
    const existing = await SuperAdmin.findOne({ username: 'QCL_ADMIN' });
    if (existing) {
      console.log('[Super Admin] Account "QCL_ADMIN" already configured.');
      return;
    }

    const defaultPassword =
      process.env.INITIAL_SUPER_ADMIN_PASSWORD ||
      process.env.DEFAULT_SUPER_ADMIN_PASSWORD ||
      'Admin@QCL2026!';

    // Hash password with bcrypt before saving
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(defaultPassword, salt);

    await SuperAdmin.create({
      username: 'QCL_ADMIN',
      passwordHash,
      role: 'SUPER_ADMIN',
    });

    console.log('[Super Admin] ✅ Default Super Admin "QCL_ADMIN" successfully initialized with secure bcrypt hash.');
  } catch (error) {
    console.error('[Super Admin] Error initializing default Super Admin:', error.message);
  }
};

/**
 * @desc    Super Admin Login
 * @route   POST /api/super-admin/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.',
      });
    }

    const trimmedUsername = username.trim();

    // Find Super Admin by username
    const admin = await SuperAdmin.findOne({ username: trimmedUsername });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Super Admin credentials.',
      });
    }

    // Verify role is SUPER_ADMIN
    if (admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Not authorized as Super Admin.',
      });
    }

    // Verify password using bcrypt
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Super Admin credentials.',
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: admin._id || admin.id,
        username: admin.username,
        role: 'SUPER_ADMIN',
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Audit log
    try {
      await ActivityLog.create({
        userName: admin.username,
        role: 'super_admin',
        action: 'SUPER_ADMIN_LOGIN',
        details: `Super Admin "${admin.username}" authenticated successfully.`,
        status: 'SUCCESS',
      });
    } catch {
      // Ignore log error in test modes
    }

    // Return token and user information (Never return passwordHash)
    return res.status(200).json({
      success: true,
      token,
      user: {
        username: admin.username,
        role: 'SUPER_ADMIN',
      },
    });
  } catch (error) {
    console.error('[Super Admin Login Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during Super Admin authentication.',
      error: error.message,
    });
  }
};

/**
 * @desc    Change Super Admin Username
 * @route   PUT /api/super-admin/change-username
 * @access  Private (SUPER_ADMIN)
 */
const changeUsername = async (req, res) => {
  try {
    const { currentPassword, newUsername } = req.body;
    const admin = req.superAdmin;

    if (!currentPassword || !newUsername) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new username are required.',
      });
    }

    const trimmedNewUsername = newUsername.trim();

    if (trimmedNewUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'New username must be at least 3 characters long.',
      });
    }

    // Verify current password using bcrypt
    const isPasswordValid = await admin.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Verification failed: Current password is incorrect.',
      });
    }

    // Check if new username is already used
    if (trimmedNewUsername.toLowerCase() === admin.username.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: 'New username cannot be identical to your current username.',
      });
    }

    const existingUser = await SuperAdmin.findOne({ username: trimmedNewUsername });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `Username "${trimmedNewUsername}" is already in use. Please select a different username.`,
      });
    }

    const oldUsername = admin.username;
    admin.username = trimmedNewUsername;
    await admin.save();

    // Log the change
    try {
      await ActivityLog.create({
        userName: trimmedNewUsername,
        role: 'super_admin',
        action: 'SUPER_ADMIN_CHANGE_USERNAME',
        details: `Super Admin username changed from "${oldUsername}" to "${trimmedNewUsername}".`,
        status: 'SUCCESS',
      });
    } catch {
      // Ignore log error
    }

    return res.status(200).json({
      success: true,
      message: 'Username updated successfully.',
      user: {
        username: admin.username,
        role: 'SUPER_ADMIN',
      },
    });
  } catch (error) {
    console.error('[Change Username Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating username.',
      error: error.message,
    });
  }
};

/**
 * @desc    Change Super Admin Password
 * @route   PUT /api/super-admin/change-password
 * @access  Private (SUPER_ADMIN)
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const admin = req.superAdmin;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields (Current Password, New Password, Confirm Password) are required.',
      });
    }

    // Ensure new password and confirm password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation password do not match.',
      });
    }

    // Verify current password using bcrypt
    const isPasswordValid = await admin.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Verification failed: Current password is incorrect.',
      });
    }

    // Validate new password requirements
    const passwordError = validatePasswordRequirements(newPassword);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError,
      });
    }

    // Ensure new password is not the same as current
    const isSamePassword = await admin.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be the same as your current password.',
      });
    }

    // Hash new password using bcrypt
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Save only passwordHash in MongoDB
    admin.passwordHash = newPasswordHash;
    await admin.save();

    // Log the change
    try {
      await ActivityLog.create({
        userName: admin.username,
        role: 'super_admin',
        action: 'SUPER_ADMIN_CHANGE_PASSWORD',
        details: `Super Admin "${admin.username}" changed password successfully.`,
        status: 'SUCCESS',
      });
    } catch {
      // Ignore log error
    }

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    console.error('[Change Password Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating password.',
      error: error.message,
    });
  }
};

/**
 * @desc    Get currently authenticated Super Admin info
 * @route   GET /api/super-admin/me
 * @access  Private (SUPER_ADMIN)
 */
const getMe = async (req, res) => {
  try {
    const admin = req.superAdmin;
    return res.status(200).json({
      success: true,
      user: {
        username: admin.username,
        role: 'SUPER_ADMIN',
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve Super Admin details.',
    });
  }
};

module.exports = {
  login,
  changeUsername,
  changePassword,
  getMe,
  initializeDefaultSuperAdmin,
  validatePasswordRequirements,
};
