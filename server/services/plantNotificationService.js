const mongoose = require('mongoose');
const { Plant, User, ActivityLog, PlantAnalysisRecord, Company } = require('../models');
const { createNodemailerTransporter } = require('./emailService');

// Map of analysis types / keywords to plant codes for intelligent inference
const ANALYSIS_PLANT_MAPPING = {
  // ACL Plant
  'pure salt': 'ACL',
  'pure salt analysis': 'ACL',
  'pure salt sieve': 'ACL',
  'brine': 'ACL',
  'tk 203': 'ACL',
  'tk 204': 'ACL',
  'tk 209': 'ACL',
  'tk 205': 'ACL',
  'tk 207': 'ACL',
  'tk203': 'ACL',
  'tk204': 'ACL',
  'tk209': 'ACL',
  'tk205': 'ACL',
  'tk207': 'ACL',
  'cr 202': 'ACL',
  'cr 203': 'ACL',
  'cr202': 'ACL',
  'cr203': 'ACL',
  'pcl': 'ACL',
  'tcl': 'ACL',
  'cacl2': 'ACL',
  'acl product': 'ACL',
  'acl 300': 'ACL',
  'raw salt': 'ACL',

  // SA Plant
  'tk 401': 'SA',
  'tk 405': 'SA',
  'tk 414': 'SA',
  'p 413': 'SA',
  'tk 419': 'SA',
  'p 417': 'SA',
  't 407': 'SA',
  't 401': 'SA',
  'bi carbonate': 'SA',
  'bicarbonate': 'SA',
  'lsa': 'SA',
  'lsa 500': 'SA',
  'lsa bagging': 'SA',
  'lsa shift': 'SA',
  'e 501': 'SA',
  't 501': 'SA',
  'gas conc': 'SA',

  // OFFSITE Plant
  'dm water': 'OFFSITE',
  'boiler': 'OFFSITE',
  'bfw': 'OFFSITE',
  'super heated steam': 'OFFSITE',
  'raw water': 'OFFSITE',
  'cbd': 'OFFSITE',
  'bottom ash': 'OFFSITE',
  'fly ash': 'OFFSITE',
  'distiller waste': 'OFFSITE',
  'vacuum seal water': 'OFFSITE',
  'vaccum seal water': 'OFFSITE',
  'sewer water': 'OFFSITE',
  'sewar water': 'OFFSITE',
  'cooling water': 'OFFSITE',

  // CO2 Plant
  'bl1204': 'CO2',
  'bl1203': 'CO2',
  'bl1204/bl1203': 'CO2',
  'bl1204-bl1203': 'CO2',
  'absorber': 'CO2',
  'absorber inlet': 'CO2',
  'absorber-inlet': 'CO2',
  'outlet': 'CO2',
  'lean': 'CO2',
  'rich': 'CO2',
  'washwater': 'CO2',
  'wash water': 'CO2',
  'washwater analysis': 'CO2',
  'p1256': 'CO2',
  'p-1256': 'CO2',
  'p 1256': 'CO2',
  'p1256 analysis': 'CO2',
  'co2': 'CO2',
  'reflux': 'CO2',
  'reflux analysis': 'CO2',
  'tk1251': 'CO2',
  'tk-1251': 'CO2',
  'tk 1251': 'CO2',
  'tk1251 analysis': 'CO2',
  'tk1252': 'CO2',
  'tk-1252': 'CO2',
  'tk 1252': 'CO2',
  'tk1252 analysis': 'CO2',
  'dcc drain liq': 'CO2',
  'dcc-drain-liq': 'CO2',
  'dcc drain liq analysis': 'CO2',
  'dcc': 'CO2',
  'sox drain liq': 'CO2',
  'sox-drain-liq': 'CO2',
  'sox drain liq analysis': 'CO2',
  'sox': 'CO2',
  'absorber drain liq': 'CO2',
  'absorber-drain-liq': 'CO2',
  'absorber drain liq analysis': 'CO2',
  'absorber drain': 'CO2',
  'lean weekly': 'CO2',
  'lean-weekly': 'CO2',
  'lean weekly analysis': 'CO2',
};

/**
 * Formats a Date/timestamp into Asia/Kolkata timezone representations:
 * - dateFormatted: '06 Oct 2026'
 * - timeFormatted: '05:24 PM'
 * - fullIST: '06 Oct 2026 05:24 PM IST'
 * - filenameDate: '06-10-2026'
 */
const formatISTDateTime = (dateObj) => {
  const d = dateObj ? new Date(dateObj) : new Date();

  // Validate date object
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const dateFormatted = validDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }); // e.g. "06 Oct 2026"

  const timeFormatted = validDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }); // e.g. "05:24 PM"

  const day = validDate.toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'Asia/Kolkata' });
  const month = validDate.toLocaleDateString('en-GB', { month: '2-digit', timeZone: 'Asia/Kolkata' });
  const year = validDate.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Asia/Kolkata' });
  const filenameDate = `${day}-${month}-${year}`; // e.g. "06-10-2026"

  return {
    dateFormatted,
    timeFormatted,
    fullIST: `${dateFormatted} ${timeFormatted} IST`,
    filenameDate,
    rawDate: validDate,
  };
};

/**
 * Resolves a Plant document from MongoDB using ID, code, name, or inferred analysis keyword.
 *
 * @param {string|Object} plantIdentifier
 * @param {Object} [options]
 * @returns {Promise<Object|null>} Plant document
 */
const resolvePlant = async (plantIdentifier, options = {}) => {
  if (!plantIdentifier && !options.analysisType) {
    return null;
  }

  // 1. Direct MongoDB ObjectId match
  if (
    plantIdentifier &&
    mongoose.Types.ObjectId.isValid(plantIdentifier) &&
    String(new mongoose.Types.ObjectId(plantIdentifier)) === String(plantIdentifier)
  ) {
    const foundById = await Plant.findById(plantIdentifier);
    if (foundById) return foundById;
  }

  // 2. Direct object passed
  if (plantIdentifier && typeof plantIdentifier === 'object' && plantIdentifier._id) {
    return plantIdentifier;
  }

  let codeOrName = typeof plantIdentifier === 'string' ? plantIdentifier.trim() : '';

  // 3. Fallback: Infer from analysisType or unit if plant string is empty or generic
  if (!codeOrName || codeOrName.toLowerCase() === 'all' || codeOrName.toLowerCase() === 'general') {
    const hint = (options.analysisType || options.unit || '').toLowerCase();
    for (const [key, plantCode] of Object.entries(ANALYSIS_PLANT_MAPPING)) {
      if (hint.includes(key)) {
        codeOrName = plantCode;
        break;
      }
    }
  }

  if (!codeOrName) {
    return null;
  }

  // Normalize plant code/names (e.g. 'offset' -> 'OFFSITE', 'ACL Plant' -> 'ACL')
  const clean = codeOrName.replace(/\s*plant\s*$/i, '').trim();
  let targetCode = clean.toUpperCase();
  if (targetCode === 'OFFSET') targetCode = 'OFFSITE';
  if (targetCode === 'C02') targetCode = 'CO2';

  // 4. Query MongoDB for exact code or name match
  const plant = await Plant.findOne({
    $or: [
      { code: targetCode },
      { code: new RegExp(`^${clean}$`, 'i') },
      { name: new RegExp(`^${clean}$`, 'i') },
      { name: new RegExp(`^${clean}\\s+Plant$`, 'i') },
    ],
  });

  return plant;
};

/**
 * Resolves the registered plant user assigned to a given plant in MongoDB.
 *
 * STRICT ROUTING RULE:
 * ACL Plant    → send ONLY to the user assigned to ACL Plant.
 * SA Plant     → send ONLY to the user assigned to SA Plant.
 * CO2 Plant    → send ONLY to the user assigned to CO2 Plant.
 * OFFSET Plant → send ONLY to the user assigned to OFFSET Plant.
 *
 * If no user is assigned to the plant in MongoDB:
 * Returns error: "No user is assigned to this plant."
 * NO fallback to MAIL_USER or any other email address.
 *
 * @param {string|Object} plantIdentifier
 * @param {Object} [options]
 * @returns {Promise<{ plant: Object|null, users: Array, primaryEmail: string|null, recipientEmails: Array<string>, assignedUser: Object|null, error?: string }>}
 */
const getPlantAssignedUser = async (plantIdentifier, options = {}) => {
  const plant = await resolvePlant(plantIdentifier, options);

  if (!plant) {
    return {
      plant: null,
      users: [],
      primaryEmail: null,
      recipientEmails: [],
      assignedUser: null,
      error: `Could not identify plant for: "${plantIdentifier}".`,
    };
  }

  // Find users assigned to this plant in MongoDB, enforcing company isolation if company is provided
  const query = {
    plant: plant._id,
    role: 'user',
    status: 'active',
  };

  const companyFilter = options.company || plant.company;
  if (companyFilter) {
    query.company = companyFilter;
  }

  const users = await User.find(query).sort({ createdAt: 1 });

  const recipientEmails = users.map((u) => u.email).filter(Boolean);

  if (recipientEmails.length === 0) {
    return {
      plant,
      users: [],
      primaryEmail: null,
      recipientEmails: [],
      assignedUser: null,
      error: `No active user assigned to ${plant.name || 'this plant'} for company isolation.`,
    };
  }

  return {
    plant,
    users,
    primaryEmail: recipientEmails[0],
    recipientEmails,
    assignedUser: users[0],
  };
};

/**
 * Sends plant analysis notification email with attached Excel file.
 * The email content strictly adheres to the required format:
 *
 * Subject: [PLANT NAME] Analysis Saved - [DATE]
 * Example: ACL Plant Analysis Saved - 06 Oct 2026
 *
 * Body:
 * Plant:
 * [PLANT NAME]
 *
 * Analysis:
 * [ANALYSIS NAME]
 *
 * Saved Date:
 * [DATE]
 *
 * Saved Time:
 * [TIME]
 *
 * Status:
 * Saved Successfully
 *
 * Record ID:
 * <actual MongoDB record ID>
 *
 * @param {Object} params
 * @param {Object} params.plantDoc - Plant document
 * @param {Object} params.assignedUser - Assigned User document
 * @param {string} params.analysisType - Name of analysis
 * @param {Object} params.savedRecord - The actual saved database record
 * @param {Buffer} params.excelBuffer - The generated Excel file buffer
 * @param {string} params.excelFileName - The Excel filename
 * @returns {Promise<{ success: boolean, emailStatus: string, messageId?: string, error?: string }>}
 */
const sendPlantAnalysisEmail = async ({
  plantDoc,
  assignedUser,
  analysisType,
  shift = '',
  savedRecord,
  excelBuffer,
  excelFileName,
}) => {
  if (!assignedUser || !assignedUser.email) {
    return {
      success: false,
      emailStatus: 'failed',
      error: 'No user is assigned to this plant.',
    };
  }

  // Extract exact server-generated timestamp from saved MongoDB record
  const serverTimestamp = savedRecord?.createdAt || savedRecord?.savedAt || new Date();
  const { dateFormatted, timeFormatted, fullIST } = formatISTDateTime(serverTimestamp);

  const plantName = plantDoc.name || 'Industrial Plant';
  const recordId = String(savedRecord?._id || savedRecord?.id || 'N/A');

  // Exact Subject: [PLANT NAME] Analysis Saved - [DATE]
  const subject = `[${plantName}] Analysis Saved - ${dateFormatted}`;

  const isSieveAnalysis =
    analysisType === 'Pure Salt Sieve Analysis' ||
    String(analysisType || '').toLowerCase().includes('sieve');

  const isTK203Analysis =
    analysisType === 'TK 203 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 203') ||
    String(analysisType || '').toLowerCase().includes('tk203');

  const isTK204Analysis =
    analysisType === 'TK 204 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 204') ||
    String(analysisType || '').toLowerCase().includes('tk204');

  // Format sieve-specific values if applicable
  let sieveTextSummary = '';
  let shiftLabel = shift || savedRecord?.shift || '';
  if (isTK204Analysis) {
    const rawData = savedRecord?.data?.rows || savedRecord?.data || savedRecord?.rows || {};
    let sKey = 'shift1';
    const cleanShift = String(shiftLabel).trim();
    if (cleanShift === 'shift3' || /III|\b3\b|shift\s*3/i.test(cleanShift)) {
      sKey = 'shift3';
    } else if (cleanShift === 'shift2' || /II|\b2\b|shift\s*2/i.test(cleanShift)) {
      sKey = 'shift2';
    } else {
      sKey = 'shift1';
    }
    const shiftDisplay = sKey === 'shift1' ? 'I SHIFT' : sKey === 'shift2' ? 'II SHIFT' : 'III SHIFT';
    const sValues = rawData[sKey] || rawData || {};

    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Shift:
${shiftDisplay}

TK 204 Shift Measurements (Unit: Kgm/m³):
- FNH3 (Free Ammonia): ${formatVal(sValues.fnh3)}
- CNH3 (Combined Ammonia): ${formatVal(sValues.cnh3)}
- TCL (Total Chlorine): ${formatVal(sValues.tcl)}
- PCL (Polymer Chloride): ${formatVal(sValues.pcl)}
`;
  } else if (isTK203Analysis) {
    const rawData = savedRecord?.data?.rows || savedRecord?.data || savedRecord?.rows || {};
    const slots = [
      { key: 't07', time: '07:00', shift: 'I Shift' },
      { key: 't09', time: '09:00', shift: 'I Shift' },
      { key: 't11', time: '11:00', shift: 'I Shift' },
      { key: 't13', time: '13:00', shift: 'I Shift' },
      { key: 't15', time: '15:00', shift: 'II Shift' },
      { key: 't17', time: '17:00', shift: 'II Shift' },
      { key: 't19', time: '19:00', shift: 'II Shift' },
      { key: 't21', time: '21:00', shift: 'II Shift' },
      { key: 't23', time: '23:00', shift: 'III Shift' },
      { key: 't01', time: '01:00', shift: 'III Shift' },
      { key: 't03', time: '03:00', shift: 'III Shift' },
      { key: 't05', time: '05:00', shift: 'III Shift' },
    ];
    let activeSlots = slots;
    if (shiftLabel && /I SHIFT|Shift 1|shift1/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'I Shift');
    } else if (shiftLabel && /II SHIFT|Shift 2|shift2/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'II Shift');
    } else if (shiftLabel && /III SHIFT|Shift 3|shift3/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'III Shift');
    }

    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Shift:
${shiftLabel || 'All Shifts'}

TK 203 Analysis Parameters (Unit: Kgm/m³):
` + activeSlots.map(s => {
      const row = rawData[s.key] || {};
      return `- ${s.time} (${s.shift}): FNH3: ${formatVal(row.fnh3)}, CNH3: ${formatVal(row.cnh3)}, TCL: ${formatVal(row.tcl)}, PCL: ${formatVal(row.pcl)}, CO2: ${formatVal(row.co2)}`;
    }).join('\n') + '\n\n';
  } else if (isSieveAnalysis) {
    // Reload freshly persisted record from database to guarantee exact persisted values
    let freshSieveDoc = null;
    if (savedRecord?._id) {
      try {
        const PureSaltSieveAnalysis = require('../models/PureSaltSieveAnalysis');
        freshSieveDoc = await PureSaltSieveAnalysis.findById(savedRecord._id).lean();
      } catch (e) {}
    }
    const sieveSource = freshSieveDoc || (savedRecord.toObject ? savedRecord.toObject() : savedRecord);
    const sieveRows = sieveSource?.rows || sieveSource?.data?.rows || sieveSource?.data || {};

    // Exact shift resolution: Check III before II, and I last
    let sKey = 'shift1';
    const cleanShift = String(shift || sieveSource?.shift || '').trim();
    if (cleanShift === 'shift3' || /III|\b3\b|shift\s*3/i.test(cleanShift)) {
      sKey = 'shift3';
    } else if (cleanShift === 'shift2' || /II|\b2\b|shift\s*2/i.test(cleanShift)) {
      sKey = 'shift2';
    } else if (cleanShift === 'shift1' || /I|\b1\b|shift\s*1/i.test(cleanShift)) {
      sKey = 'shift1';
    } else {
      if (sieveRows.shift3 && Object.values(sieveRows.shift3).some((v) => v !== null && v !== '')) sKey = 'shift3';
      else if (sieveRows.shift2 && Object.values(sieveRows.shift2).some((v) => v !== null && v !== '')) sKey = 'shift2';
      else sKey = 'shift1';
    }
    const shiftDisplay = sKey === 'shift1' ? 'I SHIFT' : sKey === 'shift2' ? 'II SHIFT' : 'III SHIFT';
    const sValues = sieveRows[sKey] || {};

    const formatVal = (v) => {
      if (v === null || v === undefined || v === '') return 'N/A';
      const num = Number(v);
      return isNaN(num) ? String(v) : `${num}%`;
    };

    const p18Val = formatVal(sValues.p18);
    const p44Val = formatVal(sValues.p44);
    const p60Val = formatVal(sValues.p60);
    const p100Val = formatVal(sValues.p100);
    const m100Val = formatVal(sValues.m100);

    sieveTextSummary = `Shift:
${shiftDisplay}

Pure Salt Sieve Analysis Fractions (${shiftDisplay}):
- BSS 18: ${p18Val}
- BSS 44: ${p44Val}
- BSS 60: ${p60Val}
- BSS 100: ${p100Val}
- -100: ${m100Val}
`;
  }

  // Resolve company name dynamically
  let companyName = 'TFL';
  try {
    const compId = plantDoc.company || assignedUser?.company || savedRecord?.company;
    if (compId) {
      const compDoc = await Company.findById(compId);
      if (compDoc && compDoc.name) {
        companyName = compDoc.name;
      }
    }
  } catch (cErr) {}

  // Exact Body format
  const textBody = `Company:
${companyName}

Plant:
${plantName}

Analysis:
${analysisType}

${shiftLabel ? `Shift:\n${shiftLabel}\n\n` : ''}Saved Date:
${dateFormatted}

Saved Time:
${timeFormatted}

${sieveTextSummary}Status:
Saved Successfully

Record ID:
${recordId}

Timezone: Asia/Kolkata (${fullIST})
Attachment: ${excelFileName}
`;

  let dataHtml = '';
  if (isTK204Analysis) {
    const rawData = savedRecord?.data?.rows || savedRecord?.data || savedRecord?.rows || {};
    let sKey = 'shift1';
    const cleanShift = String(shiftLabel).trim();
    if (cleanShift === 'shift3' || /III|\b3\b|shift\s*3/i.test(cleanShift)) {
      sKey = 'shift3';
    } else if (cleanShift === 'shift2' || /II|\b2\b|shift\s*2/i.test(cleanShift)) {
      sKey = 'shift2';
    } else {
      sKey = 'shift1';
    }
    const shiftDisplay = sKey === 'shift1' ? 'I SHIFT (06:00 – 14:00)' : sKey === 'shift2' ? 'II SHIFT (14:00 – 22:00)' : 'III SHIFT (22:00 – 06:00)';
    const sValues = rawData[sKey] || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    dataHtml = `
      <div class="field-group">
        <div class="field-label">TK 204 Shift Measurements (${shiftDisplay}) — Unit: Kgm/m³</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Parameter</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">Measured Value (Kgm/m³)</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">Tolerance Range</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">FNH₃ (Free Ammonia)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(sValues.fnh3)}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">2.99 – 3.19</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">CNH₃ (Combined Ammonia)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(sValues.cnh3)}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">3.60 – 3.80</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">TCl (Total Chlorine)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(sValues.tcl)}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">4.99 – 5.19</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">PCl (Polymer Chloride)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(sValues.pcl)}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">1.29 – 1.49</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  } else if (isTK203Analysis) {
    const rawData = savedRecord?.data?.rows || savedRecord?.data || savedRecord?.rows || {};
    const slots = [
      { key: 't07', time: '07:00', shift: 'I Shift' },
      { key: 't09', time: '09:00', shift: 'I Shift' },
      { key: 't11', time: '11:00', shift: 'I Shift' },
      { key: 't13', time: '13:00', shift: 'I Shift' },
      { key: 't15', time: '15:00', shift: 'II Shift' },
      { key: 't17', time: '17:00', shift: 'II Shift' },
      { key: 't19', time: '19:00', shift: 'II Shift' },
      { key: 't21', time: '21:00', shift: 'II Shift' },
      { key: 't23', time: '23:00', shift: 'III Shift' },
      { key: 't01', time: '01:00', shift: 'III Shift' },
      { key: 't03', time: '03:00', shift: 'III Shift' },
      { key: 't05', time: '05:00', shift: 'III Shift' },
    ];
    let activeSlots = slots;
    if (shiftLabel && /I SHIFT|Shift 1|shift1/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'I Shift');
    } else if (shiftLabel && /II SHIFT|Shift 2|shift2/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'II Shift');
    } else if (shiftLabel && /III SHIFT|Shift 3|shift3/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'III Shift');
    }

    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    dataHtml = `
      <div class="field-group">
        <div class="field-label">TK 203 Analysis Results (${shiftLabel || 'All Shifts'}) — Unit: Kgm/m³</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 8px; text-align: left; border: 1px solid #cbd5e1;">Time Slot</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">FNH₃</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">CNH₃</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">TCl</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">PCl</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">CO₂</th>
            </tr>
          </thead>
          <tbody>
            ${activeSlots.map((s, idx) => {
              const r = rawData[s.key] || {};
              const bg = idx % 2 === 1 ? 'background-color: #f8fafc;' : '';
              return `
                <tr style="${bg}">
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">${s.time} <span style="font-size: 10px; color: #64748b; font-weight: normal;">(${s.shift})</span></td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(r.fnh3)}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(r.cnh3)}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(r.tcl)}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(r.pcl)}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(r.co2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (isSieveAnalysis) {
    let freshSieveDoc = null;
    if (savedRecord?._id) {
      try {
        const PureSaltSieveAnalysis = require('../models/PureSaltSieveAnalysis');
        freshSieveDoc = await PureSaltSieveAnalysis.findById(savedRecord._id).lean();
      } catch (e) {}
    }
    const sieveSource = freshSieveDoc || (savedRecord.toObject ? savedRecord.toObject() : savedRecord);
    const sieveRows = sieveSource?.rows || sieveSource?.data?.rows || sieveSource?.data || {};

    let sKey = 'shift1';
    const cleanShift = String(shift || sieveSource?.shift || '').trim();
    if (cleanShift === 'shift3' || /III|\b3\b|shift\s*3/i.test(cleanShift)) {
      sKey = 'shift3';
    } else if (cleanShift === 'shift2' || /II|\b2\b|shift\s*2/i.test(cleanShift)) {
      sKey = 'shift2';
    } else if (cleanShift === 'shift1' || /I|\b1\b|shift\s*1/i.test(cleanShift)) {
      sKey = 'shift1';
    } else {
      if (sieveRows.shift3 && Object.values(sieveRows.shift3).some((v) => v !== null && v !== '')) sKey = 'shift3';
      else if (sieveRows.shift2 && Object.values(sieveRows.shift2).some((v) => v !== null && v !== '')) sKey = 'shift2';
      else sKey = 'shift1';
    }
    const shiftDisplay = sKey === 'shift1' ? 'I SHIFT' : sKey === 'shift2' ? 'II SHIFT' : 'III SHIFT';
    const sValues = sieveRows[sKey] || {};

    const formatVal = (v) => {
      if (v === null || v === undefined || v === '') return 'N/A';
      const num = Number(v);
      return isNaN(num) ? String(v) : `${num}%`;
    };

    const p18Val = formatVal(sValues.p18);
    const p44Val = formatVal(sValues.p44);
    const p60Val = formatVal(sValues.p60);
    const p100Val = formatVal(sValues.p100);
    const m100Val = formatVal(sValues.m100);

    dataHtml = `
      <div class="field-group">
        <div class="field-label">Sieve Analysis Results (${shiftDisplay})</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1; font-size: 12px;">Sieve Mesh Fraction</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1; font-size: 12px;">Persisted Value (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">BSS 18</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${p18Val}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">BSS 44</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${p44Val}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">BSS 60</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${p60Val}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">BSS 100</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${p100Val}</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">-100</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${m100Val}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  } else if (savedRecord?.data || savedRecord?.rows) {
    const rawDataToExtract = savedRecord?.data?.rows || savedRecord?.data || savedRecord?.rows;
    let dataEntries = [];
    const extractEntries = (obj, prefix = '') => {
      for (const [key, val] of Object.entries(obj)) {
        if (
          key === 'id' ||
          key === 'plant' ||
          key === 'date' ||
          key === 'analysisType' ||
          key === 'company' ||
          key === '_id' ||
          key === 'submittedBy' ||
          key === 'submittedById' ||
          key === 'lockedShifts' ||
          key === 'editedFields' ||
          key === 'editAuditHistory' ||
          key === 'createdAt' ||
          key === 'updatedAt'
        )
          continue;
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          extractEntries(val, prefix + key + '.');
        } else if (Array.isArray(val)) {
          dataEntries.push({ key: prefix + key, val: `[Array of ${val.length} items]` });
        } else if (val !== '' && val !== null && val !== undefined) {
          dataEntries.push({ key: prefix + key, val: String(val) });
        }
      }
    };
    extractEntries(rawDataToExtract);

    if (dataEntries.length > 0) {
      dataHtml = `
      <div class="field-group">
        <div class="field-label">Entered Values</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;">
          ${dataEntries.map(e => `
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 600; color: #475569; width: 50%;">${e.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; color: #0f172a;">${e.val}</td>
            </tr>
          `).join('')}
        </table>
      </div>`;
    }
  }

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; }
    .card { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: #0f2e5a; color: #ffffff; padding: 20px 24px; border-bottom: 3px solid #0284c7; }
    .header h2 { margin: 0 0 4px 0; font-size: 18px; font-weight: 700; letter-spacing: 0.3px; }
    .header p { margin: 0; font-size: 12px; opacity: 0.85; }
    .body-content { padding: 24px; }
    .field-group { margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; }
    .field-group:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .field-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px; }
    .field-value { font-size: 15px; font-weight: 600; color: #0f172a; }
    .status-badge { display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 6px; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .attachment-card { margin-top: 20px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; gap: 10px; }
    .attachment-name { font-size: 13px; font-weight: 600; color: #0369a1; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>${plantName} Analysis Saved</h2>
      <p>${companyName} Plant Management System</p>
    </div>
    <div class="body-content">
      <div class="field-group">
        <div class="field-label">Company</div>
        <div class="field-value">${companyName}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Plant</div>
        <div class="field-value">${plantName}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Analysis</div>
        <div class="field-value">${analysisType}</div>
      </div>
      ${shiftLabel ? `
      <div class="field-group">
        <div class="field-label">Shift</div>
        <div class="field-value">${shiftLabel}</div>
      </div>` : ''}
      <div class="field-group">
        <div class="field-label">Saved Date</div>
        <div class="field-value">${dateFormatted}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Saved Time</div>
        <div class="field-value">${timeFormatted} IST</div>
      </div>
      ${dataHtml}
      <div class="field-group">
        <div class="field-label">Status</div>
        <div class="field-value"><span class="status-badge">Saved Successfully</span></div>
      </div>
      <div class="field-group">
        <div class="field-label">Record ID</div>
        <div class="field-value" style="font-family: monospace; font-size: 13px; color: #334155;">${recordId}</div>
      </div>
      <div class="attachment-card">
        <span style="font-size: 18px;">📊</span>
        <div class="attachment-name">Attached Excel Report: <strong>${excelFileName}</strong></div>
      </div>
    </div>
    <div class="footer">
      Sent to assigned plant operator (${assignedUser.email}). Generated from saved database record.
    </div>
  </div>
</body>
</html>
`;

  // Transporter
  const transporter = createNodemailerTransporter();
  if (!transporter) {
    return {
      success: false,
      emailStatus: 'failed',
      error: 'SMTP credentials not configured in server/.env.',
      recipient: assignedUser.email,
    };
  }

  const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER || '"Plant Management" <no-reply@spic.co.in>';

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: assignedUser.email.trim(),
      subject,
      text: textBody,
      html: htmlBody,
      attachments: [
        {
          filename: excelFileName,
          content: Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer, 'base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });

    console.log(
      `[PlantNotification] ✅ Nodemailer confirmation: sent to ${assignedUser.email} (MessageId: ${info.messageId})`
    );
    return {
      success: true,
      emailStatus: 'sent',
      messageId: info.messageId,
      recipient: assignedUser.email,
    };
  } catch (mailErr) {
    const is550Rejected =
      mailErr.responseCode === 550 ||
      /550|5\.1\.1|5\.4\.1|Recipient address rejected|undeliverable address|Access denied/i.test(mailErr.message);
    if (is550Rejected) {
      console.error(
        `[PlantNotification] ❌ SMTP Recipient Rejection (550 / 5.1.1 / 5.4.1) for "${assignedUser.email}": Mailbox is undeliverable, does not exist, access is denied, or organization policy rejected the address. Microsoft 365 / mail server administrator verification of the recipient mailbox is required.`
      );
    } else {
      console.error(`[PlantNotification] ❌ Nodemailer delivery failed for "${assignedUser.email}": ${mailErr.message}`);
    }
    return {
      success: false,
      emailStatus: 'failed',
      error: is550Rejected
        ? `Recipient address rejected by mail server (550: undeliverable / access denied): The registered mailbox "${assignedUser.email}" requires Microsoft 365 administrator or mail server verification.`
        : mailErr.message,
      recipient: assignedUser.email,
    };
  }
};

/**
 * Centralized Save → Email workflow for ALL plant analysis pages.
 *
 * 1. Validate data (done prior or here)
 * 2. Save to MongoDB (creates or accepts saved database record)
 * 3. Record exact current date and time of the save operation (Asia/Kolkata)
 * 4. Generate Excel file from saved database record
 * 5. Resolve user assigned to that plant in MongoDB
 * 6. Send email via Nodemailer with attached Excel
 * 7. Mark emailStatus = 'sent' ONLY after Nodemailer confirms; otherwise 'failed'
 * 8. Return unified response to frontend
 */
const executeSaveAndEmailWorkflow = async ({
  plantIdentifier,
  analysisType,
  unit = '',
  shift = '',
  date = '',
  data = {},
  submittedBy = 'Plant Operator',
  submittedById = null,
  company = null,
  explicitRecord = null,
  rawBody = {},
}) => {
  // 1. Resolve Plant from MongoDB
  const plantDoc = await resolvePlant(plantIdentifier, { analysisType, unit, company });
  if (!plantDoc) {
    return {
      success: false,
      emailSent: false,
      emailStatus: 'failed',
      message: `Plant could not be identified for: "${plantIdentifier}".`,
    };
  }

  const plantName = plantDoc.name;
  const plantCode = plantDoc.code;

  // 2. Resolve Assigned User from MongoDB
  const { assignedUser, primaryEmail, error: userError } = await getPlantAssignedUser(plantDoc._id, { company });

  // 3. Save to MongoDB Atlas (if not already saved explicitly)
  let savedRecord = explicitRecord;
  const targetDate = date || rawBody.date || new Date().toISOString().split('T')[0];
  const targetShift = shift || rawBody.shift || 'All Shifts';
  const targetUnit = unit || rawBody.unit || '';
  const resolvedAnalysisType = analysisType || `${plantName} Analysis`;

  if (!savedRecord) {
    try {
      // First, try to find the record that was just saved by the route handler
      const existingRecord = await PlantAnalysisRecord.findOne({
        plantCode: { $in: [plantCode, plantCode + ' Plant', plantCode + ' PLANT'] },
        analysisType: resolvedAnalysisType,
        date: targetDate
      }).sort({ createdAt: -1 });

      if (existingRecord) {
        savedRecord = existingRecord;
        console.log(`[SaveAndEmail] 🔍 Found existing record in MongoDB (ID: ${savedRecord._id})`);
      } else {
        const payloadData =
          data ||
          rawBody.shifts ||
          rawBody.rows ||
          rawBody.readings ||
          rawBody.units ||
          rawBody.data ||
          rawBody;

        savedRecord = await PlantAnalysisRecord.create({
          plant: plantDoc._id,
          plantName,
          plantCode,
          analysisType: resolvedAnalysisType,
          unit: targetUnit,
          date: targetDate,
          shift: targetShift,
          data: payloadData,
          submittedBy,
          submittedById,
          company: company || plantDoc.company || null,
          emailRecipient: primaryEmail || '',
          emailStatus: 'pending',
          savedAt: new Date(),
        });
        console.log(`[SaveAndEmail] ✅ Saved to MongoDB Atlas (Collection: "plantanalysisrecords", ID: ${savedRecord._id})`);
      }
    } catch (saveErr) {
      console.error(`[SaveAndEmail] ❌ Database save/fetch failed: ${saveErr.message}`);
      return {
        success: false,
        emailSent: false,
        emailStatus: 'failed',
        message: 'Unable to save the data. Please try again.',
        error: saveErr.message,
      };
    }
  }

  // 4. Capture Server-Generated Timestamp
  const serverTimestamp = savedRecord.createdAt || savedRecord.savedAt || new Date();
  const { dateFormatted, timeFormatted, filenameDate } = formatISTDateTime(serverTimestamp);

  // 5. Generate Excel (.xlsx) using saved database record
  let excelResult = null;
  const cleanCode = plantCode.replace(/[^a-zA-Z0-9]/g, '');
  const cleanType = (analysisType || 'Analysis').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  const excelFileName = `${cleanCode}_Plant_${cleanType}_${filenameDate}.xlsx`;

  try {
    if (analysisType === 'Pure Salt Sieve Analysis' || cleanType.toLowerCase().includes('pure_salt_sieve')) {
      const { generatePureSaltSieveAnalysisExcel } = require('./excelService');
      let excelData = savedRecord.toObject ? savedRecord.toObject() : savedRecord;
      if (savedRecord?._id) {
        try {
          const PureSaltSieveAnalysis = require('../models/PureSaltSieveAnalysis');
          const freshDoc = await PureSaltSieveAnalysis.findById(savedRecord._id).lean();
          if (freshDoc) excelData = freshDoc;
        } catch (fErr) {}
      }
      excelResult = await generatePureSaltSieveAnalysisExcel({
        ...excelData,
        plant: plantName,
        date: savedRecord.date,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (analysisType === 'Pure Salt Analysis' || (cleanType.toLowerCase().includes('pure_salt') && !cleanType.toLowerCase().includes('sieve'))) {
      const { generatePureSaltAnalysisExcel } = require('./excelService');
      excelResult = await generatePureSaltAnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else {
      const { generatePlantReportExcel } = require('./excelService');
      excelResult = await generatePlantReportExcel({
        plantName,
        plantCode,
        analysisType: analysisType || `${plantName} Analysis`,
        unit: savedRecord.unit || unit,
        date: savedRecord.date || date,
        shift: savedRecord.shift || shift,
        submittedBy,
        data: savedRecord.data || data,
        rawBody,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    }
  } catch (excelErr) {
    console.warn(`[SaveAndEmail] ⚠️ Excel generation warning: ${excelErr.message}`);
  }

  // 6. Security Check: Assigned plant user
  if (!primaryEmail || !assignedUser) {
    console.warn(`[SaveAndEmail] No user assigned to plant "${plantName}". Skipping email dispatch.`);

    // Record emailStatus in MongoDB as failed
    const ModelToUpdate = explicitRecord?.constructor?.findByIdAndUpdate
      ? explicitRecord.constructor
      : PlantAnalysisRecord;

    try {
      if (savedRecord._id && ModelToUpdate.findByIdAndUpdate) {
        await ModelToUpdate.findByIdAndUpdate(savedRecord._id, {
          emailStatus: 'failed',
          reportFileName: excelResult?.filename || excelFileName,
        });
        savedRecord.emailStatus = 'failed';
      }
    } catch (uErr) {}

    return {
      success: true,
      emailSent: false,
      emailStatus: 'failed',
      message: 'No user is assigned to this plant.',
      data: savedRecord,
      excel: excelResult
        ? {
            fileName: excelResult.filename,
            base64: excelResult.base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: excelResult.buffer?.length,
          }
        : null,
    };
  }

  // 7. Dispatch Email with Excel Attachment via Nodemailer
  let emailResult = { success: false, emailStatus: 'failed', error: 'Excel generation failed' };
  if (excelResult?.buffer) {
    emailResult = await sendPlantAnalysisEmail({
      plantDoc,
      assignedUser,
      analysisType: analysisType || `${plantName} Analysis`,
      shift: targetShift,
      savedRecord,
      excelBuffer: excelResult.buffer,
      excelFileName: excelResult.filename || excelFileName,
    });
  }

  // 8. Update emailStatus in MongoDB (ONLY "sent" after Nodemailer confirms; otherwise "failed")
  const finalEmailStatus = emailResult.success ? 'sent' : 'failed';
  const ModelToUpdate = explicitRecord?.constructor?.findByIdAndUpdate
    ? explicitRecord.constructor
    : PlantAnalysisRecord;

  try {
    if (savedRecord._id && ModelToUpdate.findByIdAndUpdate) {
      await ModelToUpdate.findByIdAndUpdate(savedRecord._id, {
        emailStatus: finalEmailStatus,
        emailRecipient: assignedUser.email,
        emailMessageId: emailResult.messageId || '',
        reportFileName: excelResult?.filename || excelFileName,
      });
      savedRecord.emailStatus = finalEmailStatus;
    }
  } catch (upErr) {
    console.warn(`[SaveAndEmail] Could not update record status: ${upErr.message}`);
  }

  // 9. Activity Log Entry
  try {
    if (ActivityLog && typeof ActivityLog.create === 'function') {
      await ActivityLog.create({
        action: 'PLANT_ANALYSIS_SAVED',
        user: submittedById,
        userName: submittedBy,
        details: `${analysisType || 'Analysis'} saved for ${plantName}. Email ${
          emailResult.success ? 'sent to ' + assignedUser.email : 'failed: ' + (emailResult.error || 'N/A')
        }.`,
        timestamp: new Date(),
      });
    }
  } catch (logErr) {}

  // 10. Return Response
  if (emailResult.success) {
    return {
      success: true,
      emailSent: true,
      emailStatus: 'sent',
      message: 'Saved & Emailed Successfully ✓',
      data: savedRecord,
      excel: excelResult
        ? {
            fileName: excelResult.filename,
            base64: excelResult.base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: excelResult.buffer?.length,
          }
        : null,
    };
  } else {
    return {
      success: true,
      emailSent: false,
      emailStatus: 'failed',
      message: 'Data saved and Excel generated, but email sending failed.',
      emailError: emailResult.error,
      data: savedRecord,
      excel: excelResult
        ? {
            fileName: excelResult.filename,
            base64: excelResult.base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: excelResult.buffer?.length,
          }
        : null,
    };
  }
};

/**
 * Legacy wrapper for backwards compatibility
 */
const sendPlantUpdateNotification = async (params) => {
  const { plant, whatUpdated, updatedBy, dateTime, details, excelBuffer, excelFileName } = params;
  const plantDoc = await resolvePlant(plant, { analysisType: whatUpdated });
  if (!plantDoc) return { success: false, error: `Could not identify plant for "${plant}"` };

  const { assignedUser, primaryEmail } = await getPlantAssignedUser(plantDoc._id);
  if (!assignedUser || !primaryEmail) {
    return { success: false, error: 'No user is assigned to this plant.' };
  }

  return sendPlantAnalysisEmail({
    plantDoc,
    assignedUser,
    analysisType: whatUpdated || `${plantDoc.name} Update`,
    savedRecord: { createdAt: dateTime || new Date(), _id: 'rec_' + Date.now() },
    excelBuffer,
    excelFileName: excelFileName || `${plantDoc.code}_Report.xlsx`,
  });
};

module.exports = {
  ANALYSIS_PLANT_MAPPING,
  formatISTDateTime,
  resolvePlant,
  getPlantAssignedUser,
  sendPlantAnalysisEmail,
  executeSaveAndEmailWorkflow,
  sendPlantUpdateNotification,
};
