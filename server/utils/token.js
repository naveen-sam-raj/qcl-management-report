const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'spic_tfl_greenstar_super_secret_jwt_key_2026';

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      company: user.company,
      plant: user.plant,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

module.exports = {
  generateToken,
  verifyToken,
  JWT_SECRET,
};
