const { verifyToken } = require('../utils/token');
const { User } = require('../models');

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
    const user = await User.findById(decoded.id).select('-password').populate('company').populate('plant');
    
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
