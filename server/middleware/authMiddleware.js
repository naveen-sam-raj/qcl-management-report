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
    if (decoded.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Requires SUPER_ADMIN privileges.',
      });
    }

    // Verify SuperAdmin in database
    let admin = null;
    if (decoded.id) {
      admin = await SuperAdmin.findById(decoded.id);
    }
    if (!admin && decoded.username) {
      admin = await SuperAdmin.findOne({ username: decoded.username });
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
