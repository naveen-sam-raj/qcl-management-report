const express = require("express");
const router = express.Router();
const { PlantAnalysisRecord, ActivityLog } = require('../models');
const { protect } = require("../middleware/auth");


// Removed cache
router.use(protect);

router.post("/", async (req, res) => {
  try {
    const payload = req.body;

    const { validateAnalysisPayload } = require('../services/analysisValidation');
    const { sendAnalysisNotification } = require('../services/emailService');
    payload.plant = 'SA';
    payload.analysisType = 'TK 405 Analysis';
    const validation = validateAnalysisPayload(payload);
    if (!validation.isValid || Object.keys(validation.outOfLimits || {}).length > 0) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0] || validation.warnings?.[0] || 'Validation failed.',
        errors: validation.errors,
      });
    }
  
    if (!payload || !payload.date) {
      return res.status(400).json({ success: false, message: "Analysis Date is required." });
    }
    const shifts = payload.shifts || payload.rows || {};
    const errors = [];
    Object.entries(shifts).forEach(([shiftKey, paramValues]) => {
      if (typeof paramValues !== "object" || paramValues === null) return;
      Object.entries(paramValues).forEach(([paramKey, val]) => {
        if (val === "" || val === null || val === undefined) return;
        if (isNaN(Number(val))) errors.push("Shift '" + shiftKey + "', parameter '" + paramKey.toUpperCase() + "' must be a valid number.");
      });
    });
    if (errors.length > 0) return res.status(400).json({ success: false, message: "Validation failed. Enter numeric values only.", errors });
    const record = {
      id: "sa_tk405_" + Date.now(),
      date: payload.date,
      plant: payload.plant || "SA",
      analysisType: payload.analysisType || "TK 405 Analysis",
      tank: "TK 405",
      shifts: shifts,
      rows: payload.rows || shifts,
      parameters: payload.parameters,
      submittedBy: req.user?.name || payload.submittedBy || "Plant Operator",
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };
    
    let savedRecord;
    try {
      if (PlantAnalysisRecord) {
        savedRecord = await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: 'SA',
            analysisType: 'TK 405 Analysis',
            date: payload.date,
            shift: payload.shift || ''
          },
          {
            $set: {
              plantName: 'SA Plant',
              plantCode: 'SA',
              analysisType: 'TK 405 Analysis',
              date: payload.date,
              shift: payload.shift || '',
              data: record,
              submittedBy: req.user?.name || payload.submittedBy || 'Plant Operator',
              submittedById: req.user?._id,
              company: req.user?.company?._id || req.user?.company,
              emailStatus: 'Pending'
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else { throw new Error("Model missing"); }
    } catch (dbErr) {
      console.error('DB Save Error:', dbErr);
      return res.status(500).json({ success: false, message: 'Database save failed' });
    }
    try {
      if (savedRecord) sendAnalysisNotification(savedRecord).catch(e => console.error(e));
    } catch(e) {}
  
    try {
      if (ActivityLog && typeof ActivityLog.create === "function") {
        await ActivityLog.create({ action: "SA_TK405_SAVED", user: req.user?._id, userName: req.user?.name, details: "TK 405 Analysis saved for date: " + payload.date + ".", timestamp: new Date() });
      }
    } catch (logErr) { console.warn("[ActivityLog] Could not log activity:", logErr.message); }
    return res.status(201).json({ success: true, message: "TK 405 Analysis data saved successfully.", data: record });
  } catch (error) {
    console.error("[TK 405 API] Error saving data:", error);
    return res.status(500).json({ success: false, message: "Server error while processing TK 405 analysis: " + error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    
    let dbRecords = [];
    if (PlantAnalysisRecord) {
      const query = { plantCode: 'SA', analysisType: 'TK 405 Analysis' };
      if (date) query.date = date;
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = startDate;
        if (endDate) query.date.$lte = endDate;
      }
      if (req.user && req.user.company) query.company = req.user.company;
      const docs = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      dbRecords = docs.map(d => d.data || d);
    }
    let results = dbRecords;
    
    if (date) results = results.filter((r) => r.date === date);
    else if (startDate && endDate) results = results.filter((r) => r.date >= startDate && r.date <= endDate);
    return res.status(200).json({ success: true, count: results.length, data: results });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error while retrieving TK 405 analysis records." });
  }
});

module.exports = router;
