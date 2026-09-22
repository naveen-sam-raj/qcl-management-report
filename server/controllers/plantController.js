const { Plant } = require('../models');

// Generate 24-hour realistic historical telemetry data for Recharts
const generateTelemetryHistory = (plant) => {
  const points = [];
  const baseTemp = plant.parameters?.temperature || 200;
  const basePress = plant.parameters?.pressure || 35;
  const baseFlow = plant.parameters?.flowRate || 800;
  const baseEff = plant.efficiency || 97;

  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hourLabel = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Realistic industrial sinusoidal variation with subtle noise
    const variance = Math.sin(i / 3) * 3 + (Math.random() * 2 - 1);
    const pressVariance = Math.cos(i / 2) * 1.5 + (Math.random() * 0.5 - 0.25);
    const effVariance = Math.sin(i / 4) * 0.8 + (Math.random() * 0.4 - 0.2);

    points.push({
      time: hourLabel,
      temperature: Number((baseTemp + variance).toFixed(1)),
      pressure: Number((basePress + pressVariance).toFixed(1)),
      flowRate: Math.round(baseFlow + variance * 15),
      efficiency: Number(Math.min(99.9, Math.max(92, baseEff + effVariance)).toFixed(1)),
      emissionsPPM: Number((12 + Math.sin(i) * 2).toFixed(1)),
      powerKW: Math.round(3800 + Math.cos(i / 2) * 150),
    });
  }
  return points;
};

// @desc    Get all plants for target company
// @route   GET /api/plants
// @access  Private
const getPlants = async (req, res) => {
  try {
    const filter = {};

    // Company isolation
    if (req.user.role === 'company_admin' || req.user.role === 'user') {
      filter.company = req.user.company?._id || req.user.company;
    } else if (req.user.role === 'super_admin' && req.query.companyId) {
      filter.company = req.query.companyId;
    }

    // Normal user restriction: if user has assigned plant, show their plant first or filter
    if (req.user.role === 'user' && req.user.plant) {
      // User can view their assigned plant or all plants of their company in view mode
    }

    const plants = await Plant.find(filter).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: plants.length,
      plants,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single plant by ID with telemetry data
// @route   GET /api/plants/:id
// @access  Private
const getPlantById = async (req, res) => {
  try {
    const plant = await Plant.findById(req.params.id).populate('company');
    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found.' });
    }

    // Company isolation check
    if (req.user.role === 'company_admin' || req.user.role === 'user') {
      const userCompId = (req.user.company?._id || req.user.company).toString();
      const plantCompId = (plant.company?._id || plant.company).toString();
      if (userCompId !== plantCompId) {
        return res.status(403).json({ success: false, message: 'Access denied: Plant belongs to another company.' });
      }
    }

    const telemetry = generateTelemetryHistory(plant);

    return res.status(200).json({
      success: true,
      plant,
      telemetry,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update plant parameters
// @route   PATCH /api/plants/:id/parameters
// @access  Private (Super Admin, Company Admin)
const updatePlantParameters = async (req, res) => {
  try {
    const plant = await Plant.findById(req.params.id);
    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found.' });
    }

    if (req.user.role === 'company_admin') {
      const userCompId = (req.user.company?._id || req.user.company).toString();
      const plantCompId = (plant.company?._id || plant.company).toString();
      if (userCompId !== plantCompId) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    const { status, efficiency, dailyProduction, parameters } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (efficiency !== undefined) updates.efficiency = efficiency;
    if (dailyProduction !== undefined) updates.dailyProduction = dailyProduction;
    if (parameters) {
      updates.parameters = { ...plant.parameters, ...parameters };
    }

    const updated = await Plant.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });

    return res.status(200).json({
      success: true,
      message: 'Plant telemetry parameters updated.',
      plant: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPlants,
  getPlantById,
  updatePlantParameters,
};
