const jwt = require('jsonwebtoken');
const { SuperAdmin } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'spic_tfl_greenstar_super_secret_jwt_key_2026';

/**
 * Super Admin Authentication Middleware
 * Validates JWT token from Authorization header and verifies SUPER_ADMIN privileges.
 */
const superAdminAuth = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authorization token provided. Please log in as Super Admin.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Super Admin session expired. Please log in again.',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization token. Please log in again.',
      });
    }

    // Role check in JWT
    if (decoded.role !== 'SUPER_ADMIN' && decoded.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Requires SUPER_ADMIN privileges.',
      });
    }

    // Verify SuperAdmin in database — try SuperAdmin collection first
    let admin = null;
    if (decoded.id) {
      try {
        admin = await SuperAdmin.findById(decoded.id);
      } catch (_) { /* invalid ObjectId format — skip */ }
    }
    if (!admin && decoded.username) {
      admin = await SuperAdmin.findOne({ username: decoded.username });
    }

    // Fallback: token may have been issued for a User-collection record with role super_admin
    if (!admin) {
      const { User } = require('../models');
      let userAdmin = null;
      if (decoded.id) {
        try {
          userAdmin = await User.findById(decoded.id);
        } catch (_) { /* skip */ }
      }
      if (!userAdmin && decoded.username) {
        userAdmin = await User.findOne({
          $or: [
            { username: decoded.username },
            { email: decoded.username },
          ],
          role: 'super_admin',
        });
      }
      // Accept if role matches
      if (userAdmin && (userAdmin.role === 'super_admin' || userAdmin.role === 'SUPER_ADMIN')) {
        // Wrap in a compatible admin object so downstream handlers work
        req.superAdmin = userAdmin;
        req.user = {
          id: userAdmin._id || userAdmin.id,
          username: userAdmin.username,
          role: 'SUPER_ADMIN',
        };
        return next();
      }
    }

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Super Admin account not found or has been modified. Please re-authenticate.',
      });
    }

    // Attach to request
    req.superAdmin = admin;
    req.user = {
      id: admin._id || admin.id,
      username: admin.username,
      role: 'SUPER_ADMIN',
    };

    next();
  } catch (error) {
    console.error('[Super Admin Auth Middleware Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication verification.',
    });
  }
};

module.exports = { superAdminAuth };
