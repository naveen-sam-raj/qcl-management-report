const { Company, User, Plant } = require('../models');

// @desc    Get all companies with stats (user count, plant count, admin info)
// @route   GET /api/companies
// @access  Public / Private (Super Admin can see all, Company Admin sees own)
const getCompanies = async (req, res) => {
  try {
    const companies = await Company.find({}).sort({ createdAt: 1 });

    const enriched = await Promise.all(
      companies.map(async (company) => {
        const compId = company._id || company.id;
        
        // Count users
        const userCount = await User.countDocuments({ company: compId, role: 'user' });

        // Count plants
        const plantCount = await Plant.countDocuments({ company: compId });

        // Find primary admin
        const admin = await User.findOne({ company: compId, role: 'company_admin' }).select('name email username status mobile');

        return {
          ...company.toObject ? company.toObject() : company,
          userCount,
          plantCount,
          admin: admin || null,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: enriched.length,
      companies: enriched,
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get company by ID
// @route   GET /api/companies/:id
// @access  Private (Scoped)
const getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const compId = company._id || company.id;
    const userCount = await User.countDocuments({ company: compId, role: 'user' });
    const plantCount = await Plant.countDocuments({ company: compId });
    const admin = await User.findOne({ company: compId, role: 'company_admin' }).select('name email username status mobile');

    return res.status(200).json({
      success: true,
      company: {
        ...company.toObject ? company.toObject() : company,
        userCount,
        plantCount,
        admin: admin || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update company status
// @route   PATCH /api/companies/:id/status
// @access  Private (Super Admin)
const updateCompanyStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'maintenance'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Company status updated to ${status}.`,
      company,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCompanies,
  getCompanyById,
  updateCompanyStatus,
};
