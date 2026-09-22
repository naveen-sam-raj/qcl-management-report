const { User, Plant, ActivityLog } = require('../models');

// @desc    Get users (scoped to company for Company Admin, universal for Super Admin)
// @route   GET /api/users
// @access  Private (Super Admin, Company Admin)
const getUsers = async (req, res) => {
  try {
    const filter = {};

    // Enforce company scoping
    if (req.user.role === 'company_admin') {
      filter.company = req.user.company?._id || req.user.company;
      filter.role = { $ne: 'super_admin' }; // cannot see super admin
    } else if (req.user.role === 'super_admin') {
      if (req.query.companyId) {
        filter.company = req.query.companyId;
      }
    }

    if (req.query.plantId) {
      filter.plant = req.query.plantId;
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

    const users = await User.find(filter)
      .select('-password')
      .populate('company')
      .populate('plant')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
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
    const {
      name,
      email,
      username,
      password,
      confirmPassword,
      mobile,
      plantId,
      role = 'user',
      status = 'active',
    } = req.body;

    // Company assignment
    let targetCompanyId = null;
    if (req.user.role === 'company_admin') {
      targetCompanyId = req.user.company?._id || req.user.company;
    } else if (req.user.role === 'super_admin') {
      targetCompanyId = req.body.companyId;
      if (!targetCompanyId) {
        return res.status(400).json({ success: false, message: 'Please select a company for this user.' });
      }
    }

    // Validation
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

    // Check unique email and username
    const existingEmail = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email address is already in use.' });
    }

    const existingUsername = await User.findOne({ username: username.trim().toLowerCase() });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    // Verify plant belongs to target company if plantId supplied
    let verifiedPlantId = null;
    if (plantId) {
      const plant = await Plant.findById(plantId);
      if (plant) {
        if ((plant.company?._id || plant.company).toString() !== targetCompanyId.toString()) {
          return res.status(400).json({
            success: false,
            message: 'Selected plant does not belong to the target company.',
          });
        }
        verifiedPlantId = plant._id;
      }
    }

    const newUser = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      username: username.trim().toLowerCase(),
      password,
      mobile: mobile || '',
      role: role || 'user',
      company: targetCompanyId,
      plant: verifiedPlantId,
      status: status || 'active',
    });

    // Activity Log
    try {
      await ActivityLog.create({
        user: req.user._id,
        userName: req.user.name,
        userEmail: req.user.email,
        role: req.user.role,
        company: targetCompanyId,
        companyName: req.user.company?.name || 'Enterprise',
        action: 'USER_CREATED',
        details: `Created new user "${name}" (${username}) assigned to ${role}`,
        ipAddress: req.ip || '127.0.0.1',
      });
    } catch (e) {
      console.warn('Audit log error:', e.message);
    }

    const safeUser = await User.findById(newUser._id).select('-password').populate('company').populate('plant');

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: safeUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update existing User
// @route   PUT /api/users/:id
// @access  Private (Super Admin, Company Admin)
const updateUser = async (req, res) => {
  try {
    const userToUpdate = await User.findById(req.params.id);
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
    if (email) updates.email = email.trim().toLowerCase();
    if (mobile !== undefined) updates.mobile = mobile;
    if (plantId !== undefined) updates.plant = plantId || null;
    if (role) updates.role = role;
    if (status) updates.status = status;

    const updatedUser = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true })
      .select('-password')
      .populate('company')
      .populate('plant');

    return res.status(200).json({
      success: true,
      message: 'User updated successfully.',
      user: updatedUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle User Active / Disabled status
// @route   PATCH /api/users/:id/toggle-status
// @access  Private (Super Admin, Company Admin)
const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
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

    const user = await User.findById(req.params.id);
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
    const user = await User.findById(req.params.id);
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

    await User.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: `User ${user.name} (${user.username}) deleted successfully.`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  resetPassword,
  deleteUser,
};
