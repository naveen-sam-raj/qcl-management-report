const { getPlantAssignedUser, sendPlantUpdateNotification } = require('../services/plantNotificationService');
const { PlantAnalysisRecord } = require('../models');
const { generatePlantReportExcel } = require('../services/excelService');

// Map of route URL fragments to Plant Codes
const ROUTE_TO_PLANT = [
  // ACL Plant routes
  { pattern: /pure-salt/i, plant: 'ACL', label: 'Pure Salt Analysis' },
  { pattern: /brine/i, plant: 'ACL', label: 'Brine Analysis' },
  { pattern: /tk-?203/i, plant: 'ACL', label: 'TK 203 Analysis' },
  { pattern: /tk-?204/i, plant: 'ACL', label: 'TK 204 Analysis' },
  { pattern: /tk-?209/i, plant: 'ACL', label: 'TK 209 Analysis' },
  { pattern: /tk-?205/i, plant: 'ACL', label: 'TK 205 Analysis' },
  { pattern: /tk-?207/i, plant: 'ACL', label: 'TK 207 Analysis' },
  { pattern: /cr-?202/i, plant: 'ACL', label: 'CR 202 Analysis' },
  { pattern: /cr-?203/i, plant: 'ACL', label: 'CR 203 Analysis' },
  { pattern: /pcl-?tcl/i, plant: 'ACL', label: 'PCL / TCL Analysis' },
  { pattern: /acl-?product/i, plant: 'ACL', label: 'ACL Product Analysis' },
  { pattern: /acl-?300/i, plant: 'ACL', label: 'ACL 300# Analysis' },
  { pattern: /raw-?salt/i, plant: 'ACL', label: 'Raw Salt Analysis' },
  { pattern: /cacl2/i, plant: 'ACL', label: 'CaCl2 Analysis' },

  // SA Plant routes
  { pattern: /t-?401/i, plant: 'SA', label: 'T 401 Analysis' },
  { pattern: /tk-?419/i, plant: 'SA', label: 'TK 419 Analysis' },
  { pattern: /lsa-?500/i, plant: 'SA', label: 'LSA 500# Analysis' },
  { pattern: /lsa-?bagging-?sieve/i, plant: 'SA', label: 'LSA Bagging Sieve Analysis' },
  { pattern: /lsa-?bagging/i, plant: 'SA', label: 'LSA Bagging Analysis' },
  { pattern: /lsa-?shift/i, plant: 'SA', label: 'LSA Shift Analysis' },
  { pattern: /lsa/i, plant: 'SA', label: 'LSA Analysis' },
  { pattern: /bi-?carbonate-?moisture/i, plant: 'SA', label: 'Bicarbonate Moisture Analysis' },
  { pattern: /bi-?carbonate/i, plant: 'SA', label: 'Bicarbonate Analysis' },
  { pattern: /e501|t501/i, plant: 'SA', label: 'E 501 / T 501 Analysis' },
  { pattern: /gas-?conc/i, plant: 'SA', label: 'Gas Conc. Analysis' },

  // OFFSITE Plant routes
  { pattern: /dm-?water/i, plant: 'OFFSITE', label: 'DM Water Analysis' },
  { pattern: /bfw/i, plant: 'OFFSITE', label: 'Boiler Feed Water (BFW) Analysis' },
  { pattern: /raw-?water/i, plant: 'OFFSITE', label: 'Raw Water Analysis' },
  { pattern: /cbd/i, plant: 'OFFSITE', label: 'CBD Analysis' },
  { pattern: /bottom-?ash/i, plant: 'OFFSITE', label: 'Bottom Ash Analysis' },
  { pattern: /fly-?ash/i, plant: 'OFFSITE', label: 'Fly Ash Analysis' },
  { pattern: /distiller/i, plant: 'OFFSITE', label: 'Distiller Waste Analysis' },
  { pattern: /vacu?um-?seal/i, plant: 'OFFSITE', label: 'Vacuum Seal Water Analysis' },
  { pattern: /sew[ea]r-?water/i, plant: 'OFFSITE', label: 'Sewer Water Analysis' },
  { pattern: /cooling-?water/i, plant: 'OFFSITE', label: 'Cooling Water Analysis' },

  // CO2 Plant routes
  { pattern: /bl-?1204|bl-?1203/i, plant: 'CO2', label: 'BL1204/BL1203 Analysis' },
  { pattern: /absorber-?drain/i, plant: 'CO2', label: 'ABSORBER DRAIN LIQ Analysis' },
  { pattern: /absorber-?inlet|absorber/i, plant: 'CO2', label: 'Absorber Inlet Analysis' },
  { pattern: /outlet/i, plant: 'CO2', label: 'Outlet Analysis' },
  { pattern: /lean/i, plant: 'CO2', label: 'Lean Analysis' },
  { pattern: /rich/i, plant: 'CO2', label: 'Rich Analysis' },
  { pattern: /wash-?water/i, plant: 'CO2', label: 'Washwater Analysis' },
  { pattern: /p-?1256/i, plant: 'CO2', label: 'P1256 Analysis' },
  { pattern: /reflux/i, plant: 'CO2', label: 'Reflux Analysis' },
  { pattern: /tk-?1251/i, plant: 'CO2', label: 'TK1251 Analysis' },
  { pattern: /tk-?1252/i, plant: 'CO2', label: 'TK1252 Analysis' },
  { pattern: /dcc-?drain/i, plant: 'CO2', label: 'DCC DRAIN LIQ Analysis' },
  { pattern: /sox-?drain/i, plant: 'CO2', label: 'SOX DRAIN LIQ Analysis' },
  { pattern: /co2/i, plant: 'CO2', label: 'CO2 Plant Analysis' },
];

/**
 * Extracts a human-readable summary of the payload submitted by Admin
 */
const summarizePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return '';

  const parts = [];
  if (payload.date) parts.push(`Date: ${payload.date}`);
  if (payload.shift) parts.push(`Shift: ${payload.shift}`);
  if (payload.unit) parts.push(`Unit: ${payload.unit}`);

  if (payload.rows && typeof payload.rows === 'object') {
    const rowKeys = Object.keys(payload.rows);
    parts.push(`Rows: ${rowKeys.join(', ')}`);
  } else if (payload.shifts && typeof payload.shifts === 'object') {
    const shiftKeys = Object.keys(payload.shifts);
    parts.push(`Shifts: ${shiftKeys.join(', ')}`);
  } else if (payload.readings && Array.isArray(payload.readings)) {
    parts.push(`Readings: ${payload.readings.length} row(s) entered`);
  }

  return parts.join(' | ');
};

/**
 * Middleware that monitors all plant data save/update requests.
 * When an edit/save succeeds (HTTP 200/201), it automatically dispatches
 * an email notification to the registered user assigned to that plant in MongoDB.
 */
const autoPlantEmailMiddleware = (req, res, next) => {
  // Only intercept write methods (POST, PUT, PATCH)
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  const url = req.originalUrl || req.url || '';

  // Skip auth, login, reports listing, user management, and pure-salt-analysis
  // (Pure Salt Analysis already has its dedicated Excel attachment workflow in its route)
  if (
    url.includes('/auth') ||
    url.includes('/login') ||
    url.includes('/reports') ||
    url.includes('/users') ||
    url.includes('/admin/company-admins') ||
    url.includes('/pure-salt-analysis') ||
    url.includes('/notify-update')
  ) {
    return next();
  }

  // Intercept the response JSON method to trigger notification after successful database save
  const originalJson = res.json;
  res.json = function (data) {
    // Check if the response was successful
    if (res.statusCode >= 200 && res.statusCode < 300 && data && data.success !== false) {
      setImmediate(async () => {
        try {
          await dispatchAutoNotification(req, url, data);
        } catch (err) {
          console.warn('[AutoPlantEmail] Exception sending notification:', err.message);
        }
      });
    }
    return originalJson.apply(this, arguments);
  };

  next();
};

/**
 * Identifies the plant and dispatches the notification to the assigned plant user
 */
const dispatchAutoNotification = async (req, url, resBody) => {
  let detectedPlant = req.body?.plant || null;
  let updateLabel = req.body?.analysisType || null;

  // 1. Check URL patterns if plant not in body
  for (const mapping of ROUTE_TO_PLANT) {
    if (mapping.pattern.test(url)) {
      if (!detectedPlant) detectedPlant = mapping.plant;
      if (!updateLabel) updateLabel = mapping.label;
      break;
    }
  }

  // 2. Handle /api/plants/:id/parameters
  if (url.includes('/api/plants/') && url.includes('/parameters')) {
    const plantId = req.params?.id;
    if (plantId) {
      detectedPlant = plantId;
      updateLabel = 'Plant Operational Parameters & Telemetry';
    }
  }

  if (!detectedPlant) {
    return;
  }

  // 3. Resolve Plant and its Assigned User from MongoDB
  const plantInfo = await getPlantAssignedUser(detectedPlant, { analysisType: updateLabel });
  if (!plantInfo.plant || (!plantInfo.primaryEmail && (!plantInfo.recipientEmails || plantInfo.recipientEmails.length === 0))) {
    console.log(
      `[AutoPlantEmail] No assigned user found for plant "${detectedPlant}". Skipping automatic notification.`
    );
    return;
  }

  const adminName = req.user?.name || req.body?.submittedBy || 'Plant Administrator';
  const summary = summarizePayload(req.body);

  // 4. MANDATORY REQUIREMENT: Save data successfully to MongoDB Atlas first
  let savedRecord = null;
  const targetDate = req.body?.date || new Date().toISOString().split('T')[0];
  const targetUnit = req.body?.unit || req.body?.tower || '';
  const targetShift = req.body?.shift || 'All Shifts';
  const payloadData =
    req.body?.shifts ||
    req.body?.readings ||
    req.body?.rows ||
    req.body?.units ||
    req.body?.parameters ||
    req.body?.data ||
    req.body ||
    {};

  try {
    if (PlantAnalysisRecord && typeof PlantAnalysisRecord.create === 'function') {
      savedRecord = await PlantAnalysisRecord.create({
        plant: plantInfo.plant._id,
        plantName: plantInfo.plant.name,
        plantCode: plantInfo.plant.code,
        analysisType: updateLabel || `${plantInfo.plant.name} Data`,
        unit: targetUnit,
        date: targetDate,
        shift: targetShift,
        data: payloadData,
        submittedBy: adminName,
        submittedById: req.user?._id || null,
        company: req.user?.company?._id || req.user?.company || plantInfo.plant.company || null,
        emailRecipient: plantInfo.recipientEmails?.join(', ') || plantInfo.primaryEmail,
        emailStatus: 'Pending',
      });

      console.log(
        `[AutoPlantEmail] ✅ MongoDB Atlas persistence succeeded (Collection: "plantanalysisrecords", Record ID: ${savedRecord._id})`
      );
    }
  } catch (dbErr) {
    console.error(
      `[AutoPlantEmail] ❌ MongoDB save failed for ${plantInfo.plant.name}:`,
      dbErr.message
    );
    // RULE: "If the save/update fails, do NOT send the email."
    return;
  }

  // 5. Generate authentic .xlsx Excel workbook using ExcelJS
  let excelResult = null;
  try {
    excelResult = await generatePlantReportExcel({
      plantName: plantInfo.plant.name,
      plantCode: plantInfo.plant.code,
      analysisType: updateLabel || `${plantInfo.plant.name} Data`,
      unit: targetUnit,
      date: targetDate,
      shift: targetShift,
      submittedBy: adminName,
      data: payloadData,
      rawBody: req.body,
    });

    console.log(
      `[AutoPlantEmail] 📊 Excel report generated: "${excelResult.filename}" (${excelResult.buffer ? excelResult.buffer.length : 0} bytes)`
    );
  } catch (excelErr) {
    console.warn('[AutoPlantEmail] ⚠️ Excel report generation warning:', excelErr.message);
  }

  // 6. Send Email ONLY after database save succeeds, with the .xlsx file attached
  const recipientTarget = plantInfo.recipientEmails?.join(', ') || plantInfo.primaryEmail;
  console.log(
    `[AutoPlantEmail] 🚀 Auto-triggering notification for plant "${plantInfo.plant.name}" (${plantInfo.plant.code}) to assigned user(s): ${recipientTarget} with attachment "${excelResult?.filename || 'None'}"`
  );

  const emailResult = await sendPlantUpdateNotification({
    plant: plantInfo.plant,
    whatUpdated: updateLabel || `${plantInfo.plant.name} Data Saved`,
    updatedBy: adminName,
    dateTime: new Date(),
    details: summary || 'Data successfully updated and recorded in plant database.',
    excelBuffer: excelResult?.buffer,
    excelFileName: excelResult?.filename,
  });

  // 7. Update record with email dispatch status and reportFileName in MongoDB
  if (savedRecord && savedRecord._id) {
    try {
      await PlantAnalysisRecord.findByIdAndUpdate(savedRecord._id, {
        emailStatus: emailResult.success ? 'Sent' : 'Failed',
        emailMessageId: emailResult.messageId || '',
        reportFileName: excelResult?.filename || '',
      });
    } catch (updateErr) {
      console.warn('[AutoPlantEmail] Could not update email status on record:', updateErr.message);
    }
  }
};

module.exports = autoPlantEmailMiddleware;
