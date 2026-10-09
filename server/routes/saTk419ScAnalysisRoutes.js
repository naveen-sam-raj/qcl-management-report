const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const { ActivityLog, PlantAnalysisRecord } = require("../models");

const records = [];
router.use(protect);

router.post("/", async (req, res) => {
  try {
    const payload = req.body;
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
      id: "sa_tk419_sc_" + Date.now(),
      date: payload.date,
      plant: payload.plant || "SA",
      analysisType: payload.analysisType || "TK 419 SC TANK Analysis",
      tank: "TK 419 SC TANK",
      shifts: shifts,
      rows: payload.rows || shifts,
      parameters: payload.parameters,
      submittedBy: req.user?.name || payload.submittedBy || "Plant Operator",
      submittedById: req.user?._id,
      submittedAt: new Date().toISOString(),
      company: req.user?.company?._id || req.user?.company,
    };
    try {
      if (PlantAnalysisRecord) {
        await PlantAnalysisRecord.findOneAndUpdate(
          {
            plantCode: record.plant || "SA",
            analysisType: record.analysisType,
            date: record.date,
            ...(req.user && req.user.company ? { company: req.user.company } : {}),
          },
          {
            plantName: record.plant === "SA" ? "SA Plant" : record.plant,
            plantCode: record.plant || "SA",
            analysisType: record.analysisType,
            date: record.date,
            data: record.shifts || record.rows || {},
            submittedBy: record.submittedBy,
            submittedById: record.submittedById,
            company: record.company,
            savedAt: new Date(),
          },
          { new: true, upsert: true }
        );
      }
    } catch (dbErr) {
      console.warn("MongoDB save failed:", dbErr.message);
    }

    const existingIndex = records.findIndex((r) => r.date === payload.date);
    if (existingIndex >= 0) {
      records[existingIndex] = { ...records[existingIndex], ...record };
    } else {
      records.unshift(record);
    }
    try {
      if (ActivityLog && typeof ActivityLog.create === "function") {
        await ActivityLog.create({ action: "SA_TK419_SC_SAVED", user: req.user?._id, userName: req.user?.name, details: "TK 419 SC TANK Analysis saved for date: " + payload.date + ".", timestamp: new Date() });
      }
    } catch (logErr) { console.warn("[ActivityLog] Could not log activity:", logErr.message); }
    return res.status(201).json({ success: true, message: "TK 419 SC TANK Analysis data saved successfully.", data: record });
  } catch (error) {
    console.error("[TK 419 SC TANK API] Error saving data:", error);
    return res.status(500).json({ success: false, message: "Server error while processing TK 419 SC TANK analysis: " + error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    let results = [];
    
    if (PlantAnalysisRecord) {
      const query = { analysisType: "TK 419 SC TANK Analysis" };
      if (date) query.date = date;
      else if (startDate && endDate) {
        query.date = { $gte: startDate, $lte: endDate };
      }
      if (req.user && req.user.company) {
        query.company = req.user.company;
      }
      
      const dbRecords = await PlantAnalysisRecord.find(query).sort({ date: -1 }).lean();
      if (dbRecords && dbRecords.length > 0) {
        results = dbRecords.map(dbRec => ({
          id: dbRec._id,
          date: dbRec.date,
          plant: dbRec.plantCode,
          analysisType: dbRec.analysisType,
          shifts: dbRec.data,
          rows: dbRec.data,
          submittedBy: dbRec.submittedBy,
          submittedById: dbRec.submittedById,
          company: dbRec.company,
          savedAt: dbRec.savedAt,
        }));
      }
    }
    
    if (results.length === 0) {
      results = [...records];
      if (date) results = results.filter((r) => r.date === date);
      else if (startDate && endDate) results = results.filter((r) => r.date >= startDate && r.date <= endDate);
    }
    return res.status(200).json({ success: true, count: results.length, data: results });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error while retrieving TK 419 SC TANK analysis records." });
  }
});

module.exports = router;
