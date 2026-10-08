const { Plant } = require('../models');
const { sendPlantUpdateNotification } = require('../services/plantNotificationService');

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
    let plant;
    if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      plant = await Plant.findById(req.params.id).populate('company');
    } else {
      plant = await Plant.findOne({ code: new RegExp('^' + req.params.id + '$', 'i') }).populate('company');
    }

    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found.' });
    }

    if (req.user.role === 'company_admin' || req.user.role === 'user') {
      const userCompId = (req.user.company?._id || req.user.company).toString();
      const plantCompId = (plant.company?._id || plant.company).toString();
      if (userCompId !== plantCompId) {
        return res.status(403).json({ success: false, message: 'Access denied: Plant belongs to another company.' });
      }
    }

    const { PlantAnalysisRecord, PureSaltAnalysis } = require('../models');
    const plantCodeUpper = plant.code.toUpperCase();
    
    const allRecords = [];
    
    const parDocs = await PlantAnalysisRecord.find({ 
      $or: [
        { plantCode: plantCodeUpper },
        { plantName: { $regex: new RegExp(plantCodeUpper, 'i') } }
      ]
    }).sort({ date: 1, createdAt: 1 }).lean();
    
    parDocs.forEach(doc => {
      let mergedData = {};
      const extractNum = (obj, prefix = '') => {
        if (!obj || typeof obj !== 'object') return;
        Object.entries(obj).forEach(([key, val]) => {
          if (val === null || val === undefined || val === '') return;
          if (typeof val === 'object' && !Array.isArray(val)) {
            extractNum(val, prefix + key + '_');
          } else {
            const num = Number(val);
            if (!isNaN(num)) {
              mergedData[prefix + key.toLowerCase()] = num;
            }
          }
        });
      };
      extractNum(doc.data);
      if (Object.keys(mergedData).length > 0) {
        const dateStr = (doc.date || doc.createdAt).toString();
        const t = new Date(doc.createdAt);
        const timeStr = isNaN(t) ? '00:00' : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dayStr = isNaN(t) ? dateStr.substring(0,10) : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        allRecords.push({
          date: dateStr,
          time: dayStr + ' ' + timeStr,
          ...mergedData
        });
      }
    });

    if (plantCodeUpper === 'ACL') {
      const psaDocs = await PureSaltAnalysis.find().sort({ date: 1, createdAt: 1 }).lean();
      psaDocs.forEach(doc => {
        let mergedData = {};
        const extractNum = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          Object.entries(obj).forEach(([key, val]) => {
            const num = Number(val);
            if (!isNaN(num) && val !== '') {
              mergedData[key.toLowerCase()] = num;
            }
          });
        };
        extractNum(doc.rows);
        if (Object.keys(mergedData).length > 0) {
          const dateStr = (doc.date || doc.createdAt).toString();
          const t = new Date(doc.createdAt);
          const timeStr = isNaN(t) ? '00:00' : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dayStr = isNaN(t) ? dateStr.substring(0,10) : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
          allRecords.push({
            date: dateStr,
            time: dayStr + ' ' + timeStr,
            ...mergedData
          });
        }
      });
    }

    allRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.status(200).json({
      success: true,
      plant,
      telemetry: allRecords,
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

    // ── Automatic Plant-Wise Notification to Assigned Plant User ──
    const changedFields = [];
    if (status) changedFields.push(`Status: ${status}`);
    if (efficiency !== undefined) changedFields.push(`Efficiency: ${efficiency}%`);
    if (dailyProduction !== undefined) changedFields.push(`Daily Production: ${dailyProduction} TPD`);
    if (parameters) {
      changedFields.push(
        `Operating Parameters: ${Object.entries(parameters).map(([k, v]) => `${k}=${v}`).join(', ')}`
      );
    }

    let notifResult = null;
    try {
      notifResult = await sendPlantUpdateNotification({
        plant: updated,
        whatUpdated: 'Plant Operational Parameters & Telemetry',
        updatedBy: req.user?.name || 'Plant Administrator',
        dateTime: new Date(),
        details: changedFields.length > 0 ? changedFields.join('\n') : 'Parameters updated by admin.',
      });
    } catch (notifErr) {
      console.warn('[PlantController] Automatic notification failed:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Plant telemetry parameters updated.',
      plant: updated,
      notification: notifResult,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send plant update notification to assigned user
// @route   POST /api/plants/:id/notify-update
// @access  Private (Super Admin, Company Admin)
const notifyPlantUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { whatUpdated, details, dateTime } = req.body;

    const plant = await Plant.findById(id);
    if (!plant) {
      return res.status(404).json({ success: false, message: 'Plant not found.' });
    }

    const result = await sendPlantUpdateNotification({
      plant,
      whatUpdated: whatUpdated || 'Plant Data Updated',
      updatedBy: req.user?.name || 'Plant Administrator',
      dateTime: dateTime || new Date(),
      details: details || '',
    });

    return res.status(200).json({
      success: result.success,
      message: result.success
        ? `Notification emailed to ${result.recipient}`
        : result.error || 'Failed to send notification',
      data: result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Retry sending analysis email with Excel attachment for any plant analysis record
// @route   POST /api/plants/retry-email
// @access  Private
const retryPlantAnalysisEmail = async (req, res) => {
  try {
    const { recordId, plant, analysisType } = req.body;
    if (!recordId) {
      return res.status(400).json({ success: false, message: 'Record ID is required for retry.' });
    }

    const { PlantAnalysisRecord, PureSaltAnalysis } = require('../models');
    const { executeSaveAndEmailWorkflow } = require('../services/plantNotificationService');

    let savedRecord = null;
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.findById === 'function') {
      try {
        savedRecord = await PlantAnalysisRecord.findById(recordId);
      } catch (e) {}
    }

    if (!savedRecord && PureSaltAnalysis && typeof PureSaltAnalysis.findById === 'function') {
      try {
        savedRecord = await PureSaltAnalysis.findById(recordId);
      } catch (e) {}
    }

    if (!savedRecord) {
      return res.status(404).json({ success: false, message: 'Saved analysis record not found.' });
    }

    const targetPlant = plant || savedRecord.plant || savedRecord.plantName || savedRecord.plantCode;
    const targetType = analysisType || savedRecord.analysisType || 'Plant Analysis';

    const result = await executeSaveAndEmailWorkflow({
      plantIdentifier: targetPlant,
      analysisType: targetType,
      unit: savedRecord.unit || '',
      shift: savedRecord.shift || 'All Shifts',
      date: savedRecord.date,
      data: savedRecord.data || savedRecord.rows,
      submittedBy: savedRecord.submittedBy || req.user?.name || 'Plant Operator',
      submittedById: savedRecord.submittedById || req.user?._id,
      company: savedRecord.company || req.user?.company,
      explicitRecord: savedRecord,
    });

    return res.status(result.success && result.emailSent ? 200 : 400).json(result);
  } catch (error) {
    console.error('[Retry Plant Analysis Email] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPlants,
  getPlantById,
  updatePlantParameters,
  notifyPlantUpdate,
  retryPlantAnalysisEmail,
};
