const { verifyToken } = require('../utils/token');
const { User, SuperAdmin } = require('../models');
const { checkLicenseValidity } = require('../utils/licenseUtils');

const protect = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authorization token provided.',
      });
    }

    const decoded = verifyToken(token);

    // Find user by decoded ID
    let user = await User.findById(decoded.id).select('-password').populate('company').populate('plant');

    // If not found in User collection, check SuperAdmin collection (QCL_ADMIN)
    if (!user && (decoded.role === 'SUPER_ADMIN' || decoded.role === 'super_admin' || decoded.username === 'QCL_ADMIN')) {
      const superAdminDoc = await SuperAdmin.findById(decoded.id) || await SuperAdmin.findOne({ username: decoded.username || 'QCL_ADMIN' });
      if (superAdminDoc) {
        user = {
          _id: superAdminDoc._id,
          id: superAdminDoc._id,
          username: superAdminDoc.username,
          name: 'Super Admin',
          email: `${superAdminDoc.username.toLowerCase()}@spicglobal.com`,
          role: 'super_admin',
        };
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.',
      });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Please contact administrator.',
      });
    }

    // ── Check if password was changed after token was issued ──
    if (user.role !== 'super_admin') {
      const tokenVersionMismatch = (
        user.tokenVersion !== undefined &&
        decoded.tokenVersion !== undefined &&
        user.tokenVersion !== decoded.tokenVersion
      );
      const passwordChangedAfterToken = (
        user.passwordChangedAt &&
        decoded.iat &&
        (decoded.iat < Math.floor(new Date(user.passwordChangedAt).getTime() / 1000))
      );

      if (tokenVersionMismatch || passwordChangedAfterToken) {
        return res.status(401).json({
          success: false,
          code: 'PASSWORD_CHANGED',
          passwordChanged: true,
          message: 'Your password has been changed. Please contact admin.',
        });
      }
    }

    // ── Requirement 14: Centralized License Expiry Check for Protected APIs ──
    // Super Admin is NEVER blocked by license restriction
    if (user.role === 'company_admin') {
      const licenseCheck = checkLicenseValidity(user);
      if (!licenseCheck.valid) {
        return res.status(403).json({
          success: false,
          licenseExpired: licenseCheck.status === 'Expired',
          message: licenseCheck.message,
        });
      }
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed: ' + (error.message || 'Invalid token'),
    });
  }
};

module.exports = { protect };
