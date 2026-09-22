const { ActivityLog } = require('../models');

// @desc    Get activity logs
// @route   GET /api/logs
// @access  Private (Super Admin, Company Admin)
const getLogs = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === 'company_admin') {
      filter.company = req.user.company?._id || req.user.company;
    } else if (req.user.role === 'super_admin' && req.query.companyId) {
      filter.company = req.query.companyId;
    }

    if (req.query.action) {
      filter.action = req.query.action;
    }

    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { userName: { $regex: s, $options: 'i' } },
        { details: { $regex: s, $options: 'i' } },
        { action: { $regex: s, $options: 'i' } },
      ];
    }

    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 100);

    return res.status(200).json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getLogs };
