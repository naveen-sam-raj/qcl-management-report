const mongoose = require('mongoose');
const MongooseUser = require('../models/User');
const MongoosePlant = require('../models/Plant');
const MongooseCompany = require('../models/Company');
const MongooseActivityLog = require('../models/ActivityLog');
const { sendUserWelcomeEmail } = require('../services/emailService');

/**
 * Ensures a live, confirmed connection to the active MongoDB database.
 * Never allows silent fallback to volatile in-memory storage for User operations.
 */
const ensureDatabaseConnection = async () => {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return true;
  }
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (uri) {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      return mongoose.connection && mongoose.connection.readyState === 1;
    }
  } catch (err) {
    console.warn('[User Controller] MongoDB connection attempt failed:', err.message);
  }
  return false;
};

/**
 * Resiliently resolves a Plant document from MongoDB.
 * Accepts:
 *  - MongoDB ObjectId (string or ObjectId)
 *  - Plant code: 'OFFSITE', 'OFFSET', 'ACL', 'SA', 'CO2'
 *  - Plant name: 'OFFSITE Plant', 'OFFSET Plant', etc.
 *  - Frontend mock ID: 'plant_offsite', 'plant_acl', 'plant_sa', 'plant_co2'
 */
const resolvePlantDoc = async (plantId) => {
  if (!plantId) return null;

  // 1. Direct MongoDB ObjectId match
  if (mongoose.Types.ObjectId.isValid(plantId)) {
    const p = await MongoosePlant.findById(plantId);
    if (p) return p;
  }

  // 2. Normalized code/name match
  let clean = String(plantId).trim();
  if (/^plant_offsite$/i.test(clean)) clean = 'OFFSITE';
  if (/^plant_acl$/i.test(clean)) clean = 'ACL';
  if (/^plant_sa$/i.test(clean)) clean = 'SA';
  if (/^plant_co2$/i.test(clean)) clean = 'CO2';

  const baseCode = clean.replace(/\s*plant\s*$/i, '').trim();
  let targetCode = baseCode.toUpperCase();
  if (targetCode === 'OFFSET') targetCode = 'OFFSITE';

  return await MongoosePlant.findOne({
    $or: [
      { code: targetCode },
      { code: new RegExp(`^${targetCode}$`, 'i') },
      { name: new RegExp(`^${baseCode}(\\s+Plant)?$`, 'i') },
    ],
  });
};

/**
 * Resiliently resolves a Company document from MongoDB.
 */
const resolveCompanyDoc = async (companyId, fallbackPlantDoc) => {
  if (companyId) {
    if (mongoose.Types.ObjectId.isValid(companyId)) {
      const c = await MongooseCompany.findById(companyId);
      if (c) return c;
    }
    let clean = String(companyId).trim();
    if (/^company_tfl$/i.test(clean)) clean = 'TFL';
    if (/^company_spic$/i.test(clean)) clean = 'SPIC';
    if (/^company_gsfl$/i.test(clean)) clean = 'GSFL';

    const c = await MongooseCompany.findOne({
      $or: [
        { code: new RegExp(`^${clean}$`, 'i') },
        { name: new RegExp(`^${clean}$`, 'i') },
      ],
    });
    if (c) return c;
  }

  if (fallbackPlantDoc && fallbackPlantDoc.company) {
    const compRef = fallbackPlantDoc.company;
    if (compRef && compRef.name) return compRef;
    if (mongoose.Types.ObjectId.isValid(compRef)) {
      const c = await MongooseCompany.findById(compRef);
      if (c) return c;
    }
  }

  return null;
};

// @desc    Get users (scoped to company for Company Admin, universal for Super Admin)
// @route   GET /api/users
// @access  Private (Super Admin, Company Admin)
const getUsers = async (req, res) => {
  try {
    const isConnected = await ensureDatabaseConnection();
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected. Unable to retrieve users.',
      });
    }

    const filter = {};

    // Enforce company scoping
    if (req.user.role === 'company_admin') {
      filter.company = req.user.company?._id || req.user.company;
      filter.role = { $ne: 'super_admin' }; // cannot see super admin
    } else if (req.user.role === 'super_admin') {
      if (req.query.companyId) {
        const comp = await resolveCompanyDoc(req.query.companyId);
        filter.company = comp ? comp._id : req.query.companyId;
      }
    }

    if (req.query.plantId) {
      const plant = await resolvePlantDoc(req.query.plantId);
      filter.plant = plant ? plant._id : req.query.plantId;
    }

    if (req.query.role) {
      filter.role = req.query.role;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { username: { $regex: s, $options: 'i' } },
      ];
    }

    const users = await MongooseUser.find(filter)
      .select('-password')
      .populate('company')
      .populate('plant')
      .sort({ createdAt: -1 });

    let maxUsers = null;
    let currentUserCount = users.length;
    if (req.user.role === 'company_admin') {
      const admin = await MongooseUser.findById(req.user._id);
      maxUsers = admin?.maxUsers !== undefined && admin?.maxUsers !== null ? admin.maxUsers : 10;
      currentUserCount = await MongooseUser.countDocuments({
        company: req.user.company?._id || req.user.company,
        role: 'user',
      });
    }

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
      maxUsers,
      currentUserCount,
      userLimitReached: maxUsers !== null && currentUserCount >= maxUsers,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new User
// @route   POST /api/users
// @access  Private (Super Admin, Company Admin)
const createUser = async (req, res) => {
  try {
    // 1. Strict MongoDB Connection Check — Never write to in-memory fallback
    const isConnected = await ensureDatabaseConnection();
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is unavailable. User cannot be saved to MongoDB.',
      });
    }

    const {
      name,
      email,
      username,
      password,
      confirmPassword,
      mobile,
      plantId,
      companyId,
      role = 'user',
      status = 'active',
    } = req.body;

    // 2. Validate required fields
    if (!name || !email || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, Email, Username, and Password are required.',
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

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    // 3. Check unique email and username directly in MongoDB
    const existingEmail = await MongooseUser.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email address is already in use.' });
    }

    const existingUsername = await MongooseUser.findOne({ username: cleanUsername });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    // 4. Resilient Plant Resolution
    let plantDoc = null;
    let verifiedPlantId = null;
    if (plantId) {
      plantDoc = await resolvePlantDoc(plantId);
      if (!plantDoc) {
        return res.status(400).json({
          success: false,
          message: 'Selected plant was not found in the database.',
        });
      }
      verifiedPlantId = plantDoc._id;
    }

    // 5. Company Assignment
    let targetCompanyId = null;
    let targetCompanyAdmin = null;

    if (req.user.role === 'company_admin') {
      targetCompanyId = req.user.company?._id || req.user.company;
      targetCompanyAdmin = req.user;
    } else if (req.user.role === 'super_admin') {
      // First try resolving from explicitly passed companyId
      const compDoc = await resolveCompanyDoc(companyId, plantDoc);
      if (compDoc) {
        targetCompanyId = compDoc._id || compDoc.id;
      }

      // If not passed or not resolved, derive directly from resolved plant
      if (!targetCompanyId && plantDoc && plantDoc.company) {
        targetCompanyId = plantDoc.company?._id || plantDoc.company;
      }

      // Fallback to super_admin's company if defined
      if (!targetCompanyId && (req.user.company?._id || req.user.company)) {
        targetCompanyId = req.user.company?._id || req.user.company;
      }

      if (!targetCompanyId) {
        return res.status(400).json({
          success: false,
          message: 'Please select a company or plant for this user.',
        });
      }

      targetCompanyAdmin = await MongooseUser.findOne({ company: targetCompanyId, role: 'company_admin' });
    }

    // Verify plant belongs to target company
    if (plantDoc && targetCompanyId) {
      const plantCompId = (plantDoc.company?._id || plantDoc.company).toString();
      if (plantCompId !== targetCompanyId.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Selected plant does not belong to the target company.',
        });
      }
    }

    // 6. User Limit Enforcement
    if (targetCompanyAdmin) {
      const adminDoc = await MongooseUser.findById(targetCompanyAdmin._id || targetCompanyAdmin.id);
      const effectiveMaxUsers =
        adminDoc?.maxUsers !== undefined && adminDoc?.maxUsers !== null
          ? adminDoc.maxUsers
          : targetCompanyAdmin.maxUsers;

      if (effectiveMaxUsers !== undefined && effectiveMaxUsers !== null && effectiveMaxUsers > 0) {
        const currentUserCount = await MongooseUser.countDocuments({
          company: targetCompanyId,
          role: 'user',
        });

        if (currentUserCount >= effectiveMaxUsers) {
          return res.status(403).json({
            success: false,
            message: `User limit reached. Your plan allows a maximum of ${effectiveMaxUsers} users.`,
            userLimitReached: true,
            currentUserCount,
            maxUsers: effectiveMaxUsers,
          });
        }
      }
    }

    // 7. Persist User Document directly to MongoDB
    const newUser = await MongooseUser.create({
      name: name.trim(),
      email: cleanEmail,
      username: cleanUsername,
      password, // Password hashed automatically by Mongoose pre('save') hook
      mobile: mobile ? String(mobile).trim() : '',
      role: role || 'user',
      company: targetCompanyId,
      companyAdmin: targetCompanyAdmin ? (targetCompanyAdmin._id || targetCompanyAdmin.id) : null,
      plant: verifiedPlantId,
      status: status || 'active',
    });

    // 8. Explicitly verify document write confirmation in MongoDB
    const confirmedUser = await MongooseUser.findById(newUser._id)
      .select('-password')
      .populate('company')
      .populate('plant');

    if (!confirmedUser) {
      return res.status(500).json({
        success: false,
        message: 'Database persistence error: User document write could not be confirmed in MongoDB.',
      });
    }

    // 9. Activity Log in MongoDB
    try {
      await MongooseActivityLog.create({
        user: req.user._id || req.user.id,
        userName: req.user.name || req.user.username || 'Admin',
        userEmail: req.user.email || 'admin@spicglobal.com',
        role: req.user.role || 'company_admin',
        company: targetCompanyId,
        companyName: confirmedUser.company?.name || 'Company',
        action: 'USER_CREATED',
        details: `Created new user "${confirmedUser.name}" (${confirmedUser.username}) assigned to ${confirmedUser.plant?.name || 'General User'}`,
        ipAddress: req.ip || '127.0.0.1',
      });
    } catch (e) {
      console.warn('[User Controller] Audit log error:', e.message);
    }

    // 10. Welcome Email with credentials (asynchronous, non-blocking)
    try {
      sendUserWelcomeEmail({
        to: confirmedUser.email,
        name: confirmedUser.name,
        username: confirmedUser.username,
        password: password,
        role: confirmedUser.role,
        companyName: confirmedUser.company?.name || 'SPIC Group',
      }).catch((emailErr) => {
        console.warn('[User Controller] Email delivery warning:', emailErr.message);
      });
    } catch (emailErr) {
      console.warn('[User Controller] Email dispatch warning:', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: confirmedUser,
    });
  } catch (error) {
    console.error('[User Controller] Create user error:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'Email or username';
      return res.status(400).json({
        success: false,
        message: `An account with this ${field} already exists in the database.`,
      });
    }
    if (error.name === 'ValidationError') {
      const msgs = Object.values(error.errors || {}).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: msgs.join(', ') || 'User validation failed.',
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update existing User
// @route   PUT /api/users/:id
// @access  Private (Super Admin, Company Admin)
const updateUser = async (req, res) => {
  try {
    const isConnected = await ensureDatabaseConnection();
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected. Unable to update user.',
      });
    }

    const userToUpdate = await MongooseUser.findById(req.params.id);
    if (!userToUpdate) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check company isolation
    if (req.user.role === 'company_admin') {
      const adminCompId = (req.user.company?._id || req.user.company).toString();
      const userCompId = (userToUpdate.company?._id || userToUpdate.company || '').toString();
      if (adminCompId !== userCompId) {
        return res.status(403).json({ success: false, message: 'Cannot edit user from another company.' });
      }
    }

    const { name, email, mobile, plantId, role, status } = req.body;

    const updates = {};
    if (name) updates.name = name.trim();
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const existingEmail = await MongooseUser.findOne({ email: cleanEmail, _id: { $ne: req.params.id } });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email address is already in use by another user.' });
      }
      updates.email = cleanEmail;
    }
    if (mobile !== undefined) updates.mobile = mobile ? String(mobile).trim() : '';

    if (plantId !== undefined) {
      if (plantId) {
        const plantDoc = await resolvePlantDoc(plantId);
        updates.plant = plantDoc ? plantDoc._id : null;
      } else {
        updates.plant = null;
      }
    }

    if (role) updates.role = role;
    if (status) updates.status = status;

    const updatedUser = await MongooseUser.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true })
      .select('-password')
      .populate('company')
      .populate('plant');

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('[User Controller] Update user error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email address or username is already in use by another user.',
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle User Active / Disabled status
// @route   PATCH /api/users/:id/toggle-status
// @access  Private (Super Admin, Company Admin)
const toggleUserStatus = async (req, res) => {
  try {
    const isConnected = await ensureDatabaseConnection();
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected. Unable to toggle user status.',
      });
    }

    const user = await MongooseUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (req.user.role === 'company_admin') {
      const adminCompId = (req.user.company?._id || req.user.company).toString();
      const userCompId = (user.company?._id || user.company || '').toString();
      if (adminCompId !== userCompId) {
        return res.status(403).json({ success: false, message: 'Permission denied.' });
      }
    }

    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    user.status = newStatus;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `User status updated to ${newStatus}.`,
      status: newStatus,
      user,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset User Password
// @route   POST /api/users/:id/reset-password
// @access  Private (Super Admin, Company Admin)
const resetPassword = async (req, res) => {
  try {
    const isConnected = await ensureDatabaseConnection();
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected. Unable to reset password.',
      });
    }

    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters.',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.',
      });
    }

    const user = await MongooseUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (req.user.role === 'company_admin') {
      const adminCompId = (req.user.company?._id || req.user.company).toString();
      const userCompId = (user.company?._id || user.company || '').toString();
      if (adminCompId !== userCompId) {
        return res.status(403).json({ success: false, message: 'Permission denied.' });
      }
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: `Password for ${user.username} has been successfully reset.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete User
// @route   DELETE /api/users/:id
// @access  Private (Super Admin, Company Admin)
const deleteUser = async (req, res) => {
  try {
    const isConnected = await ensureDatabaseConnection();
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected. Unable to delete user.',
      });
    }

    const user = await MongooseUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Protect Super Admin from deletion
    if (user.role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Super Admin account cannot be deleted.' });
    }

    if (req.user.role === 'company_admin') {
      const adminCompId = (req.user.company?._id || req.user.company).toString();
      const userCompId = (user.company?._id || user.company || '').toString();
      if (adminCompId !== userCompId) {
        return res.status(403).json({ success: false, message: 'Permission denied.' });
      }
    }

    await MongooseUser.findByIdAndDelete(req.params.id);

    try {
      await MongooseActivityLog.create({
        user: req.user?._id || req.user?.id,
        userName: req.user?.name || req.user?.username || 'Admin',
        userEmail: req.user?.email || 'admin@spicglobal.com',
        role: req.user?.role || 'company_admin',
        company: user.company?._id || user.company || null,
        companyName: user.company?.name || 'Company',
        action: 'USER_DELETED',
        details: `Deleted user "${user.name}" (${user.username})`,
        ipAddress: req.ip || '127.0.0.1',
      });
    } catch (e) {
      console.warn('[User Controller] Audit log error:', e.message);
    }

    return res.status(200).json({
      success: true,
      message: `User ${user.name} (${user.username}) deleted successfully.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (Super Admin, Company Admin)
const getUserById = async (req, res) => {
  try {
    const isConnected = await ensureDatabaseConnection();
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB database is not connected. Unable to retrieve user.',
      });
    }

    const user = await MongooseUser.findById(req.params.id)
      .select('-password')
      .populate('company')
      .populate('plant');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  resetPassword,
  deleteUser,
  resolvePlantDoc,
  resolveCompanyDoc,
};
