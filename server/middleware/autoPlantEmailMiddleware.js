const { executeSaveAndEmailWorkflow, resolvePlant } = require('../services/plantNotificationService');

// Map of route URL fragments to Plant Codes and Analysis Labels
const ROUTE_TO_PLANT = [
  // ACL Plant routes
  { pattern: /pure-salt-sieve/i, plant: 'ACL', label: 'Pure Salt Sieve Analysis' },
  { pattern: /pure-salt/i, plant: 'ACL', label: 'Pure Salt Analysis' },
  { pattern: /brine/i, plant: 'ACL', label: 'Brine Analysis' },
  { pattern: /tk-?203/i, plant: 'ACL', label: 'TK 203 Analysis' },
  { pattern: /tk-?204-?tk-?209/i, plant: 'ACL', label: 'TK 204 / TK 209 Analysis' },
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
  { pattern: /sa-?tk-?401/i, plant: 'SA', label: 'SA TK 401 Analysis' },
  { pattern: /sa-?tk-?405/i, plant: 'SA', label: 'SA TK 405 Analysis' },
  { pattern: /sa-?tk-?414/i, plant: 'SA', label: 'SA TK 414 TSC Analysis' },
  { pattern: /sa-?p-?413/i, plant: 'SA', label: 'SA P 413 WSC Analysis' },
  { pattern: /sa-?tk-?419/i, plant: 'SA', label: 'SA TK 419 SC Analysis' },
  { pattern: /sa-?p-?417-?1/i, plant: 'SA', label: 'SA P 417-1 Analysis' },
  { pattern: /sa-?p-?417-?2/i, plant: 'SA', label: 'SA P 417-2 Analysis' },
  { pattern: /sa-?p-?417-?3/i, plant: 'SA', label: 'SA P 417-3 Analysis' },
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
  { pattern: /absorber-?drain/i, plant: 'CO2', label: 'Absorber Drain Liq Analysis' },
  { pattern: /absorber-?inlet|absorber/i, plant: 'CO2', label: 'Absorber Inlet Analysis' },
  { pattern: /outlet/i, plant: 'CO2', label: 'Outlet Analysis' },
  { pattern: /lean-?weekly/i, plant: 'CO2', label: 'Lean Weekly Analysis' },
  { pattern: /lean/i, plant: 'CO2', label: 'Lean Analysis' },
  { pattern: /rich/i, plant: 'CO2', label: 'Rich Analysis' },
  { pattern: /wash-?water/i, plant: 'CO2', label: 'Washwater Analysis' },
  { pattern: /p-?1256/i, plant: 'CO2', label: 'P1256 Analysis' },
  { pattern: /reflux/i, plant: 'CO2', label: 'Reflux Analysis' },
  { pattern: /tk-?1251/i, plant: 'CO2', label: 'TK1251 Analysis' },
  { pattern: /tk-?1252/i, plant: 'CO2', label: 'TK1252 Analysis' },
  { pattern: /dcc-?drain/i, plant: 'CO2', label: 'DCC Drain Liq Analysis' },
  { pattern: /sox-?drain/i, plant: 'CO2', label: 'SOX Drain Liq Analysis' },
  { pattern: /co2/i, plant: 'CO2', label: 'CO2 Plant Analysis' },
];

/**
 * Middleware that monitors all plant data save/update requests.
 * When an edit/save succeeds (HTTP 200/201), it executes the centralized
 * Save -> Server Timestamp -> Assigned Plant User -> Excel -> Nodemailer workflow
 * and provides accurate email confirmation or failure response to the frontend.
 */
const autoPlantEmailMiddleware = (req, res, next) => {
  // Only intercept write methods (POST, PUT, PATCH)
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  const url = req.originalUrl || req.url || '';

  // Skip auth, login, reports listing, user management, and retry endpoints
  // Pure Salt Analysis has its dedicated endpoint that calls executeSaveAndEmailWorkflow directly
  if (
    url.includes('/auth') ||
    url.includes('/login') ||
    url.includes('/reports') ||
    url.includes('/users') ||
    url.includes('/admin/company-admins') ||
    url.includes('/pure-salt-analysis') ||
    url.includes('/notify-update') ||
    url.includes('/retry-email')
  ) {
    return next();
  }

  // Intercept the response JSON method to trigger workflow in the background
  const originalJson = res.json;
  res.json = function (data) {
    if (res.statusCode >= 200 && res.statusCode < 300 && data && data.success !== false) {
      // Fire and forget: execute email workflow in background
      dispatchAutoNotification(req, url, data).catch((err) => {
        console.warn('[AutoPlantEmail] Exception in background workflow:', err.message);
      });
      
      // Provide immediate feedback to the frontend
      data.emailSent = false;
      data.emailStatus = 'processing';
      if (data.message && typeof data.message === 'string' && !data.message.includes('Email')) {
        data.message += ' (Email notification is processing in background).';
      }
    }
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Identifies the plant and dispatches the centralized Save -> Email workflow
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
    return null;
  }

  // Resolve plantDoc to confirm plant exists
  const plantDoc = await resolvePlant(detectedPlant, { analysisType: updateLabel });
  if (!plantDoc) {
    return null;
  }

  const plantName = plantDoc.name;
  const adminName = req.user?.name || req.body?.submittedBy || 'Plant Operator';

  // Extract payload
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

  // Execute centralized Save -> Server Timestamp -> Assigned User -> Excel -> Nodemailer Workflow
  return await executeSaveAndEmailWorkflow({
    plantIdentifier: plantDoc._id,
    analysisType: updateLabel || `${plantName} Analysis`,
    unit: targetUnit,
    shift: targetShift,
    date: targetDate,
    data: payloadData,
    submittedBy: adminName,
    submittedById: req.user?._id || null,
    company: req.user?.company?._id || req.user?.company || plantDoc.company || null,
    explicitRecord: resBody?.data && resBody.data._id ? resBody.data : null,
    rawBody: req.body,
  });
};

module.exports = autoPlantEmailMiddleware;
