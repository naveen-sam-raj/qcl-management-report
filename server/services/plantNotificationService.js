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
  'lsa bagging sieve': 'SA',
  'lsa sieve': 'SA',
  'lsa shift': 'SA',
  'e 501': 'SA',
  't 501': 'SA',
  'gas conc': 'SA',

  // OFFSITE / OFFSET Plant
  'dm water': 'OFFSITE',
  'anion unit': 'OFFSITE',
  'boiler': 'OFFSITE',
  'boiler feed': 'OFFSITE',
  'bfw': 'OFFSITE',
  'super heated steam': 'OFFSITE',
  'shs': 'OFFSITE',
  'raw water': 'OFFSITE',
  'cbd': 'OFFSITE',
  'bottom ash': 'OFFSITE',
  'fly ash': 'OFFSITE',
  'distiller waste': 'OFFSITE',
  'distiller': 'OFFSITE',
  'vacuum seal water': 'OFFSITE',
  'vaccum seal water': 'OFFSITE',
  'vacuum seal': 'OFFSITE',
  'vaccum seal': 'OFFSITE',
  'sewer water': 'OFFSITE',
  'sewar water': 'OFFSITE',
  'cooling water': 'OFFSITE',
  'cooling water 200#': 'OFFSITE',
  'cooling water/200#': 'OFFSITE',
  'cooling water / 200#': 'OFFSITE',
  'c.w water': 'OFFSITE',
  'cw water': 'OFFSITE',

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
  saveEventId = '',
  changedSlotKeys = [],
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

  // Unique Subject per save: includes shift and event ID to prevent deduplication / threading suppression
  const shiftSuffix = shift ? ` (${shift})` : '';
  const refSuffix = saveEventId ? ` [Ref: ${saveEventId.slice(-8)}]` : '';
  const subject = `[${plantName}] ${analysisType || 'Analysis'}${shiftSuffix} Saved - ${dateFormatted}${refSuffix}`;

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

  const isTK205Analysis =
    analysisType === 'TK 205 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 205') ||
    String(analysisType || '').toLowerCase().includes('tk205');

  const isTK209Analysis =
    analysisType === 'TK 209 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 209') ||
    String(analysisType || '').toLowerCase().includes('tk209');

  const isCR203Analysis =
    analysisType === 'CR 203 Analysis' ||
    String(analysisType || '').toLowerCase().includes('cr 203') ||
    String(analysisType || '').toLowerCase().includes('cr203');

  const isCR202Analysis =
    analysisType === 'CR 202 Analysis' ||
    String(analysisType || '').toLowerCase().includes('cr 202') ||
    String(analysisType || '').toLowerCase().includes('cr202');

  const isTK207Analysis =
    analysisType === 'TK 207 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 207') ||
    String(analysisType || '').toLowerCase().includes('tk207');

  const isPclTclAnalysis =
    analysisType === 'PCL/TCL Analysis' ||
    String(analysisType || '').toLowerCase().includes('pcl/tcl') ||
    String(analysisType || '').toLowerCase().includes('pcl-tcl') ||
    String(analysisType || '').toLowerCase().includes('pcl_tcl');

  const isCaCl2Analysis =
    analysisType === 'CaCl2 Analysis' ||
    String(analysisType || '').toLowerCase().includes('cacl2');

  const isACLProductAnalysis =
    analysisType === 'ACL Product Analysis' ||
    String(analysisType || '').toLowerCase().includes('acl product') ||
    String(analysisType || '').toLowerCase().includes('acl-product');

  const isACL300Analysis =
    analysisType === 'ACL 300# Analysis' ||
    String(analysisType || '').toLowerCase().includes('acl 300') ||
    String(analysisType || '').toLowerCase().includes('acl-300');

  const isRawSaltAnalysis =
    analysisType === 'Raw Salt Analysis' ||
    String(analysisType || '').toLowerCase().includes('raw salt') ||
    String(analysisType || '').toLowerCase().includes('raw-salt') ||
    String(analysisType || '').toLowerCase().includes('raw_salt');

  const isBrineAnalysis =
    analysisType === 'Brine Analysis' ||
    String(analysisType || '').toLowerCase().includes('brine');

  const isSATK401Analysis =
    analysisType === 'TK 401 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 401') ||
    String(analysisType || '').toLowerCase().includes('tk401');

  const isSATK405Analysis =
    analysisType === 'TK 405 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 405') ||
    String(analysisType || '').toLowerCase().includes('tk405');

  const isSATK414Analysis =
    analysisType === 'TK 414 TSC TANK Analysis' ||
    analysisType === 'TK 414 TSC Tank Analysis' ||
    analysisType === 'TK 414 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 414') ||
    String(analysisType || '').toLowerCase().includes('tk414');

  const isSAP413Analysis =
    analysisType === 'P413 WSC TANK Analysis' ||
    analysisType === 'P413 WSC Tank Analysis' ||
    analysisType === 'P413 Analysis' ||
    String(analysisType || '').toLowerCase().includes('p413') ||
    String(analysisType || '').toLowerCase().includes('p 413');

  const isSATK419Analysis =
    analysisType === 'TK 419 SC TANK Analysis' ||
    analysisType === 'TK 419 SC Tank Analysis' ||
    analysisType === 'TK 419 Analysis' ||
    String(analysisType || '').toLowerCase().includes('tk 419') ||
    String(analysisType || '').toLowerCase().includes('tk419');

  const isSAT401Analysis =
    analysisType === 'T 401 Analysis' ||
    analysisType === 'T401 Analysis' ||
    (String(analysisType || '').toLowerCase().includes('t 401') && !String(analysisType || '').toLowerCase().includes('tk 401')) ||
    (String(analysisType || '').toLowerCase().includes('t401') && !String(analysisType || '').toLowerCase().includes('tk401'));

  const isSABicarbonateAnalysis =
    analysisType === 'Bi Carbonate NaCl/Na2CO3 Analysis' ||
    analysisType === 'Bi Carbonate NaCl/Na₂CO₃ Analysis' ||
    analysisType === 'Bi Carbonate Analysis' ||
    analysisType === 'Bicarbonate Analysis' ||
    (String(analysisType || '').toLowerCase().includes('bicarbonate') && !String(analysisType || '').toLowerCase().includes('moisture')) ||
    (String(analysisType || '').toLowerCase().includes('bi carbonate') && !String(analysisType || '').toLowerCase().includes('moisture'));

  const isSABicarbonateMoistureAnalysis =
    analysisType === 'Bicarbonate Moisture Analysis' ||
    analysisType === 'Bi Carbonate Moisture Analysis' ||
    analysisType === 'Bicarbonate Moisture' ||
    (String(analysisType || '').toLowerCase().includes('bicarbonate') && String(analysisType || '').toLowerCase().includes('moisture')) ||
    (String(analysisType || '').toLowerCase().includes('bi carbonate') && String(analysisType || '').toLowerCase().includes('moisture'));

  const isSALSA500Analysis =
    analysisType === 'LSA AT 500# Analysis' ||
    analysisType === 'LSA AT 500#' ||
    analysisType === 'LSA 500# Analysis' ||
    analysisType === 'LSA 500#' ||
    (String(analysisType || '').toLowerCase().includes('lsa') && String(analysisType || '').toLowerCase().includes('500'));

  const isSAE501T501Analysis =
    analysisType === 'E 501 / T 501 Analysis' ||
    analysisType === 'E 501 / T 501' ||
    analysisType === 'E501 / T501 Analysis' ||
    analysisType === 'E501 / T501' ||
    analysisType === 'E 501 Analysis' ||
    analysisType === 'T 501 Analysis' ||
    (String(analysisType || '').toLowerCase().includes('e501') || String(analysisType || '').toLowerCase().includes('e 501')) ||
    (String(analysisType || '').toLowerCase().includes('t501') || String(analysisType || '').toLowerCase().includes('t 501'));

  const isSALSAShiftAnalysis =
    analysisType === 'LSA Shift Analysis' ||
    analysisType === 'LSA Shift' ||
    (String(analysisType || '').toLowerCase().includes('lsa') && String(analysisType || '').toLowerCase().includes('shift') && !String(analysisType || '').toLowerCase().includes('bagging'));

  const isSALSABaggingAnalysis =
    analysisType === 'LSA Bagging Analysis' ||
    analysisType === 'LSA Bagging Shift Analysis' ||
    analysisType === 'LSA Bagging Hourly Monitoring' ||
    (String(analysisType || '').toLowerCase().includes('lsa') && String(analysisType || '').toLowerCase().includes('bagging') && !String(analysisType || '').toLowerCase().includes('sieve'));

  const isSALSABaggingSieveAnalysis =
    analysisType === 'LSA Bagging Sieve Analysis' ||
    analysisType === 'LSA Bagging Sieve' ||
    (String(analysisType || '').toLowerCase().includes('lsa') && String(analysisType || '').toLowerCase().includes('bagging') && String(analysisType || '').toLowerCase().includes('sieve')) ||
    String(analysisType || '').toLowerCase().includes('lsa_bagging_sieve');

  const isSAGasConcAnalysis =
    analysisType === 'Gas Conc. Analysis' ||
    analysisType === 'Gas Conc Analysis' ||
    (String(analysisType || '').toLowerCase().includes('gas') && String(analysisType || '').toLowerCase().includes('conc')) ||
    String(analysisType || '').toLowerCase().includes('gas_conc');

  const isOffsetDMWater =
    analysisType === 'DM Water Analysis' ||
    analysisType === 'Analysis For DM Water / Anion unit' ||
    String(analysisType || '').toLowerCase().includes('dm water') ||
    String(analysisType || '').toLowerCase().includes('anion unit');

  const isOffsetBFW =
    analysisType === 'Boiler Feed Water / Super Heated Steam Analysis' ||
    analysisType === 'Boiler Feed Water (BFW) Analysis' ||
    String(analysisType || '').toLowerCase().includes('boiler feed') ||
    String(analysisType || '').toLowerCase().includes('bfw') ||
    String(analysisType || '').toLowerCase().includes('super heated steam') ||
    String(analysisType || '').toLowerCase().includes('shs');

  const isOffsetRawWater =
    analysisType === 'Raw Water Analysis' ||
    String(analysisType || '').toLowerCase().includes('raw water');

  const isOffsetCBD =
    analysisType === 'CBD Analysis' ||
    String(analysisType || '').toLowerCase().includes('cbd');

  const isOffsetBottomAsh =
    analysisType === 'Bottom Ash Analysis' ||
    String(analysisType || '').toLowerCase().includes('bottom ash');

  const isOffsetFlyAsh =
    analysisType === 'Fly Ash Analysis' ||
    String(analysisType || '').toLowerCase().includes('fly ash');

  const isOffsetDistillerWaste =
    analysisType === 'Distiller Waste Analysis' ||
    String(analysisType || '').toLowerCase().includes('distiller');

  const isOffsetVacuumSealWater =
    analysisType === 'Vacuum Seal Water Analysis' ||
    String(analysisType || '').toLowerCase().includes('vacuum seal') ||
    String(analysisType || '').toLowerCase().includes('vaccum seal');

  const isOffsetSewerWater =
    analysisType === 'Sewer Water Analysis' ||
    String(analysisType || '').toLowerCase().includes('sewer water') ||
    String(analysisType || '').toLowerCase().includes('sewar water');

  const isOffsetCoolingWater =
    analysisType === 'Cooling Water Analysis' ||
    analysisType === 'Cooling Water (C.W Water) Analysis' ||
    String(analysisType || '').toLowerCase().includes('cooling water') ||
    String(analysisType || '').toLowerCase().includes('c.w water') ||
    String(analysisType || '').toLowerCase().includes('cw water');

  // Format sieve-specific values if applicable
  let sieveTextSummary = '';
  let shiftLabel = shift || savedRecord?.shift || '';
  if (isCR203Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const tRows = rawData.timeRows || {};
    const fRow = rawData.fnh3Row || {};
    const pRow = rawData.pclRow || {};
    const streams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const slots = [
      { key: 't07', time: '07:00', shift: 'I Shift' },
      { key: 't11', time: '11:00', shift: 'I Shift' },
      { key: 't15', time: '15:00', shift: 'II Shift' },
      { key: 't19', time: '19:00', shift: 'II Shift' },
      { key: 't23', time: '23:00', shift: 'III Shift' },
      { key: 't03', time: '03:00', shift: 'III Shift' },
    ];

    let activeSlots = slots;
    if (shiftLabel && /I SHIFT|Shift 1|shift1/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'I Shift');
    } else if (shiftLabel && /II SHIFT|Shift 2|shift2/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'II Shift');
    } else if (shiftLabel && /III SHIFT|Shift 3|shift3/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'III Shift');
    }

    sieveTextSummary = `Shift:
${shiftLabel || 'All Shifts'}

CR 203 Analysis Parameters (Unit: Kgm/m³):
` + activeSlots.map(s => {
      const r = tRows[s.key] || {};
      const streamsStr = streams.map(st => `${st.toUpperCase()}: ${formatVal(r[st])}`).join(', ');
      return `- ${s.time} (${s.shift}) CNH3: [${streamsStr}] | AVG TCL: ${formatVal(r.avgTcl)}`;
    }).join('\n') + `\n- FNH3: [${streams.map(st => `${st.toUpperCase()}: ${formatVal(fRow[st])}`).join(', ')}] | AVG TCL: ${formatVal(fRow.avgTcl)}\n- PCL: [${streams.map(st => `${st.toUpperCase()}: ${formatVal(pRow[st])}`).join(', ')}] | AVG TCL: ${formatVal(pRow.avgTcl)}\n\n`;
  } else if (isCR202Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const tRows = rawData.timeRows || {};
    const fRow = rawData.fnh3Row || {};
    const pRow = rawData.pclRow || {};
    const streams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const slots = [
      { key: 't07', time: '07:00', shift: 'I Shift' },
      { key: 't11', time: '11:00', shift: 'I Shift' },
      { key: 't15', time: '15:00', shift: 'II Shift' },
      { key: 't19', time: '19:00', shift: 'II Shift' },
      { key: 't23', time: '23:00', shift: 'III Shift' },
      { key: 't03', time: '03:00', shift: 'III Shift' },
    ];

    let activeSlots = slots;
    if (shiftLabel && /I SHIFT|Shift 1|shift1/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'I Shift');
    } else if (shiftLabel && /II SHIFT|Shift 2|shift2/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'II Shift');
    } else if (shiftLabel && /III SHIFT|Shift 3|shift3/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'III Shift');
    }

    sieveTextSummary = `Shift:
${shiftLabel || 'All Shifts'}

CR 202 Analysis Parameters (Unit: Kgm/m³):
` + activeSlots.map(s => {
      const r = tRows[s.key] || {};
      const streamsStr = streams.map(st => `${st.toUpperCase()}: ${formatVal(r[st])}`).join(', ');
      return `- ${s.time} (${s.shift}) CNH3: [${streamsStr}] | AVG TCL: ${formatVal(r.avgTcl)}, AVG A-H: ${formatVal(r.avgAH)}`;
    }).join('\n') + `\n- FNH3: [${streams.map(st => `${st.toUpperCase()}: ${formatVal(fRow[st])}`).join(', ')}] | AVG A-H: ${formatVal(fRow.avgAH)}\n- PCL: [${streams.map(st => `${st.toUpperCase()}: ${formatVal(pRow[st])}`).join(', ')}] | AVG A-H: ${formatVal(pRow.avgAH)}\n\n`;
  } else if (isTK207Analysis) {
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

TK 207 Analysis Parameters (Unit: Kgm/m³):
` + activeSlots.map(s => {
      const row = rawData[s.key] || {};
      return `- ${s.time} (${s.shift}): FNH3: ${formatVal(row.fnh3)}, CNH3: ${formatVal(row.cnh3)}, TCL: ${formatVal(row.tcl)}, PCL: ${formatVal(row.pcl)}`;
    }).join('\n') + '\n\n';
  } else if (isTK205Analysis) {
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

TK 205 Analysis Parameters (Unit: Kgm/m³):
` + activeSlots.map(s => {
      const row = rawData[s.key] || {};
      return `- ${s.time} (${s.shift}): FNH3: ${formatVal(row.fnh3)}, CNH3: ${formatVal(row.cnh3)}, TCL: ${formatVal(row.tcl)}, PCL: ${formatVal(row.pcl)}`;
    }).join('\n') + '\n\n';
  } else if (isTK209Analysis) {
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

TK 209 Shift Measurements (Unit: Kgm/m³):
- FNH3 (Free Ammonia): ${formatVal(sValues.fnh3)}
- CNH3 (Combined Ammonia): ${formatVal(sValues.cnh3)}
- TCL (Total Chlorine): ${formatVal(sValues.tcl)}
- PCL (Polymer Chloride): ${formatVal(sValues.pcl)}
`;
  } else if (isTK204Analysis) {
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

    const formatVal = (v) => {
      if (v === null || v === undefined || v === '') return '—';
      const num = Number(v);
      return !isNaN(num) ? num.toFixed(2) : String(v);
    };

    sieveTextSummary = `Current Saved Shift:
${shiftLabel || 'All Shifts'} (Persisted Snapshot)

TK 203 Analysis Parameters (Unit: Kgm/m³):
` + activeSlots.map(s => {
      const row = rawData[s.key] || {};
      const isCurSlot = changedSlotKeys && changedSlotKeys.length > 0 ? (changedSlotKeys.includes(s.key) ? ' [Saved Now]' : '') : '';
      return `- ${s.time} (${s.shift})${isCurSlot}: FNH3: ${formatVal(row.fnh3)}, CNH3: ${formatVal(row.cnh3)}, TCL: ${formatVal(row.tcl)}, PCL: ${formatVal(row.pcl)}, CO2: ${formatVal(row.co2)}`;
    }).join('\n') + '\n\n';
  } else if (isPclTclAnalysis) {
    const rawData = savedRecord?.data?.shiftRows || savedRecord?.data?.rows || savedRecord?.shiftRows || savedRecord?.data || {};
    let sKey = 'shift1';
    const cleanShift = String(shiftLabel || '').trim();
    if (cleanShift === 'shift3' || /III|\b3\b|shift\s*3/i.test(cleanShift)) {
      sKey = 'shift3';
    } else if (cleanShift === 'shift2' || /II|\b2\b|shift\s*2/i.test(cleanShift)) {
      sKey = 'shift2';
    } else {
      sKey = 'shift1';
    }
    const shiftDisplay = sKey === 'shift1' ? 'I SHIFT (06:00 – 14:00)' : sKey === 'shift2' ? 'II SHIFT (14:00 – 22:00)' : 'III SHIFT (22:00 – 06:00)';
    const sValues = rawData[sKey] || {};
    const streams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const formatVal = (v) => {
      if (v === null || v === undefined || v === '') return '—';
      const num = Number(v);
      return !isNaN(num) ? num.toFixed(2) : String(v);
    };

    sieveTextSummary = `Shift:
${shiftDisplay} (Persisted Snapshot)

PCL/TCL Analysis Measurements (Unit: Kgm/m³ | Tolerance: 0.05–0.10 +0.2/-0.02 | Range: 0.03–0.30):
` + streams.map(st => `- Stream ${st.toUpperCase()}: ${formatVal(sValues[st])}`).join('\n') + '\n\n';
  } else if (isCaCl2Analysis) {
    const rawData = savedRecord?.data?.readings || savedRecord?.readings || (Array.isArray(savedRecord?.data) ? savedRecord?.data : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Frequency: Day (Persisted Sampling Rows):
` + rawData.map((r, i) => `Row #${i + 1} (${r.sample || 'CaCl2 Solution'} @ ${r.time || '—'}): pH: ${formatVal(r.ph)} (Target: 7.7 ±1), Conc: ${formatVal(r.conc)}% (Target: 20% ±5), FNH3: ${formatVal(r.fnh3)} PPM, CNH3: ${formatVal(r.cnh3)} PPM, SS: ${formatVal(r.ss)} PPM`).join('\n') + '\n\n';
  } else if (isACLProductAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const chem = rawData.chemicalData || rawData.chemical || {};
    const bss = rawData.bssData || rawData.bss || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const bssMeshKeys = ['p6', 'p8', 'p12', 'p16', 'p18', 'p44', 'p60', 'p100', 'm100'];
    const bssLabels = {
      p6: '+6 %', p8: '+8 %', p12: '+12 %', p16: '+16 %', p18: '+18 %',
      p44: '+44 %', p60: '+60 %', p100: '+100 %', m100: '-100 %'
    };
    let bssSum = 0;
    let bssCount = 0;
    bssMeshKeys.forEach(k => {
      const v = bss[k];
      if (v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) {
        bssSum += Number(v);
        bssCount += 1;
      }
    });
    const totalRecoveryStr = bssCount > 0 ? `${bssSum.toFixed(1)} %` : '—';

    sieveTextSummary = `Chemical & Physical Characteristics (7 Parameters):
- NH4Cl %: ${formatVal(chem.nh4cl)}
- NaCl %: ${formatVal(chem.nacl)}
- Fe2O3 %: ${formatVal(chem.fe2o3)}
- H2O %: ${formatVal(chem.h2o)}
- IR %: ${formatVal(chem.ir)}
- Bulk Density (BD): ${formatVal(chem.bd)}
- +18 % (Spec): ${formatVal(chem.p18_spec)}

B S S (Sieve Analysis) — 9 Mesh Sizes:
` + bssMeshKeys.map(k => `- ${bssLabels[k]}: ${formatVal(bss[k])}`).join('\n') + `
- Total Sieve Recovery: ${totalRecoveryStr}\n\n`;
  } else if (isACL300Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.shiftRows || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftKeys = ['shift1', 'shift2', 'shift3'];
    const shiftNames = { shift1: 'I SHIFT (06:00–14:00)', shift2: 'II SHIFT (14:00–22:00)', shift3: 'III SHIFT (22:00–06:00)' };

    sieveTextSummary = `ACL 300# Shift Analysis (Particle Size & NaCl %):
` + shiftKeys.map((sk) => {
      const s = shiftsObj[sk] || {};
      return `${shiftNames[sk]}:
- +18 %: ${formatVal(s.p18)} (+18 Mesh Particle Spec)
- +44 %: ${formatVal(s.p44)} (+44 Mesh Particle Spec)
- NaCl %: ${formatVal(s.nacl)} (Sodium Chloride Content)`;
    }).join('\n\n') + '\n\n';
  } else if (isRawSaltAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const params = rawData.parameters || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    sieveTextSummary = `Raw Salt Chemical Analysis (6 Parameters):
- NaCl %: ${formatVal(params.nacl)} (Sodium Chloride Content)
- Ca %: ${formatVal(params.ca)} (Calcium Content)
- Mg %: ${formatVal(params.mg)} (Magnesium Content)
- SO4 %: ${formatVal(params.so4)} (Sulphate Content)
- IR %: ${formatVal(params.ir)} (Insoluble Residue)
- H2O %: ${formatVal(params.h2o)} (Moisture Content)\n\n`;
  } else if (isBrineAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const rows = rawData.rows || rawData || {};
    const tk109 = rows.tk109 || {};
    const tk110 = rows.tk110 || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    sieveTextSummary = `Brine Analysis (TK 109 & TK 110 Measurements in g/L):
TK 109 (Storage Tank):
- NaCl: ${formatVal(tk109.nacl)} g/L (Spec: 270–370)
- Ca: ${formatVal(tk109.ca)} g/L (Spec: 1–3)
- Mg: ${formatVal(tk109.mg)} g/L (Spec: 4–6)
- SO4: ${formatVal(tk109.so4)} g/L (Spec: 5–15)

TK 110 (Feed Tank):
- NaCl: ${formatVal(tk110.nacl)} g/L (Spec: 270–370)
- Ca: ${formatVal(tk110.ca)} g/L (Spec: 1–3)
- Mg: ${formatVal(tk110.mg)} g/L (Spec: 4–6)
- SO4: ${formatVal(tk110.so4)} g/L (Spec: 5–15)\n\n`;
  } else if (isSATK401Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftKeys = [
      { key: 's1', altKey: 'shift1', label: 'I SHIFT (07:00–15:00)' },
      { key: 's2', altKey: 'shift2', label: 'II SHIFT (15:00–23:00)' },
      { key: 's3', altKey: 'shift3', label: 'III SHIFT (23:00–07:00)' },
    ];

    sieveTextSummary = `SA Plant TK 401 Shift Analysis (Parameters in Kgm/m³):
` + shiftKeys.map((s) => {
      const row = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
      return `${s.label}:
- FNH3: ${formatVal(row.fnh3)} Kgm/m³ (Spec: 3.87–4.07)
- CNH3: ${formatVal(row.cnh3)} Kgm/m³ (Spec: 1.82–2.02)
- TCL: ${formatVal(row.tcl)} Kgm/m³ (Spec: 5.37–5.57)
- PCL: ${formatVal(row.pcl)} Kgm/m³ (Spec: 3.45–3.65)
- TCAO: ${formatVal(row.tcao)}`;
    }).join('\n\n') + '\n\n';
  } else if (isSATK405Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftKeys = [
      { key: 's1', altKey: 'shift1', label: 'I SHIFT (07:00–15:00)' },
      { key: 's2', altKey: 'shift2', label: 'II SHIFT (15:00–23:00)' },
      { key: 's3', altKey: 'shift3', label: 'III SHIFT (23:00–07:00)' },
    ];

    sieveTextSummary = `SA Plant TK 405 Shift Analysis (Parameters in Kgm/m³):
` + shiftKeys.map((s) => {
      const row = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
      return `${s.label}:
- FNH3: ${formatVal(row.fnh3)} Kgm/m³ (Spec: 3.76–3.96)
- CNH3: ${formatVal(row.cnh3)} Kgm/m³ (Spec: 1.79–1.99)
- TCL: ${formatVal(row.tcl)} Kgm/m³ (Spec: 5.29–5.49)
- PCL: ${formatVal(row.pcl)} Kgm/m³ (Spec: 3.40–3.60)
- TCAO: ${formatVal(row.tcao)}`;
    }).join('\n\n') + '\n\n';
  } else if (isSATK414Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftKeys = [
      { key: 's1', altKey: 'shift1', label: 'I SHIFT (07:00–15:00)' },
      { key: 's2', altKey: 'shift2', label: 'II SHIFT (15:00–23:00)' },
      { key: 's3', altKey: 'shift3', label: 'III SHIFT (23:00–07:00)' },
    ];

    sieveTextSummary = `SA Plant TK 414 TSC Tank Shift Analysis (Parameters in Kgm/m³):
` + shiftKeys.map((s) => {
      const row = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
      return `${s.label}:
- FNH3: ${formatVal(row.fnh3)} Kgm/m³ (Spec: 1.30–1.50)
- CNH3: ${formatVal(row.cnh3)} Kgm/m³ (Spec: 4.00–4.20)
- TCL: ${formatVal(row.tcl)} Kgm/m³ (Spec: 5.36–5.56)
- PCL: ${formatVal(row.pcl)} Kgm/m³ (Spec: 1.26–1.46)`;
    }).join('\n\n') + '\n\n';
  } else if (isSAP413Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftKeys = [
      { key: 's1', altKey: 'shift1', label: 'I SHIFT (07:00–15:00)' },
      { key: 's2', altKey: 'shift2', label: 'II SHIFT (15:00–23:00)' },
      { key: 's3', altKey: 'shift3', label: 'III SHIFT (23:00–07:00)' },
    ];

    sieveTextSummary = `SA Plant P413 WSC Tank Shift Analysis (Parameters in Kgm/m³):
` + shiftKeys.map((s) => {
      const row = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
      return `${s.label}:
- FNH3: ${formatVal(row.fnh3)} Kgm/m³ (Spec: 1.48–1.68)
- CNH3: ${formatVal(row.cnh3)} Kgm/m³ (Spec: 3.99–4.19)
- TCL: ${formatVal(row.tcl)} Kgm/m³ (Spec: 5.35–5.55)
- PCL: ${formatVal(row.pcl)} Kgm/m³ (Spec: 1.26–1.46)`;
    }).join('\n\n') + '\n\n';
  } else if (isSATK419Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftKeys = [
      { key: 's1', altKey: 'shift1', label: 'I SHIFT (07:00–15:00)' },
      { key: 's2', altKey: 'shift2', label: 'II SHIFT (15:00–23:00)' },
      { key: 's3', altKey: 'shift3', label: 'III SHIFT (23:00–07:00)' },
    ];

    sieveTextSummary = `SA Plant TK 419 SC Tank Shift Analysis (Parameters in Kgm/m³):
` + shiftKeys.map((s) => {
      const row = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
      return `${s.label}:
- FNH3: ${formatVal(row.fnh3)} Kgm/m³ (Spec: 1.98–2.18)
- CNH3: ${formatVal(row.cnh3)} Kgm/m³ (Spec: 3.96–4.16)`;
    }).join('\n\n') + '\n\n';
  } else if (isSAT401Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const unitsObj = rawData.units || rawData.towers || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const unitList = [
      { key: 'a', label: 'T 401 A' },
      { key: 'b', label: 'T 401 B' },
      { key: 'c', label: 'T 401 C' },
      { key: 'd', label: 'T 401 D' },
      { key: 'e', label: 'T 401 E' },
      { key: 'f', label: 'T 401 F' },
    ];
    const shiftKeys = [
      { key: 's1', altKey: 'shift1', label: 'I SHIFT' },
      { key: 's2', altKey: 'shift2', label: 'II SHIFT' },
      { key: 's3', altKey: 'shift3', label: 'III SHIFT' },
    ];

    sieveTextSummary = `SA Plant T 401 Analysis (Parameters in Kgm/m³):\n` +
      unitList.map(u => {
        const uData = unitsObj[u.key] || {};
        return `${u.label}:\n` + shiftKeys.map(s => {
          const row = uData[s.key] || uData[s.altKey] || {};
          return `  ${s.label}: FNH3: ${formatVal(row.fnh3)}, CNH3: ${formatVal(row.cnh3)}, TCl: ${formatVal(row.tcl)}, PCl: ${formatVal(row.pcl)}`;
        }).join('\n');
      }).join('\n\n') + '\n\n';
  } else if (isSABicarbonateAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const readings = Array.isArray(rawData.readings)
      ? rawData.readings
      : Array.isArray(rawData.data?.readings)
      ? rawData.data.readings
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    sieveTextSummary = `SA Plant Bi Carbonate NaCl/Na2CO3 Readings:\n` +
      readings.map((r, i) => `#${i + 1} | Time: ${r.time || '—'} | Filter: ${r.filter || '—'} | NaCl/Na2CO3: ${formatVal(r.naclNa2co3)}%`).join('\n') + '\n\n';
  } else if (isSABicarbonateMoistureAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const readings = Array.isArray(rawData.readings)
      ? rawData.readings
      : Array.isArray(rawData.data?.readings)
      ? rawData.data.readings
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const m404Vals = [];
    const sbTurbVals = [];
    readings.forEach((r) => {
      ['m404_a', 'm404_b', 'm404_c'].forEach((k) => {
        const val = parseFloat(r[k]);
        if (!isNaN(val)) m404Vals.push(val);
      });
      ['sb_turb1', 'sb_turb2'].forEach((k) => {
        const val = parseFloat(r[k]);
        if (!isNaN(val)) sbTurbVals.push(val);
      });
    });
    const m404Avg = m404Vals.length > 0 ? (m404Vals.reduce((a, b) => a + b, 0) / m404Vals.length).toFixed(2) : '—';
    const sbTurbAvg = sbTurbVals.length > 0 ? (sbTurbVals.reduce((a, b) => a + b, 0) / sbTurbVals.length).toFixed(1) : '—';

    sieveTextSummary = `SA Plant Bicarbonate Moisture Analysis Readings:\n` +
      readings.map((r, i) =>
        `#${i + 1} | Shift: ${r.shift || '—'} | Time: ${r.time || '—'} | M 404 (A: ${formatVal(r.m404_a)}%, B: ${formatVal(r.m404_b)}%, C: ${formatVal(r.m404_c)}%) | M 405 Outlet: ${formatVal(r.m405_outlet)} | SB Turbidity: (1: ${formatVal(r.sb_turb1)}, 2: ${formatVal(r.sb_turb2)})`
      ).join('\n') +
      `\nCalculated Averages:\nM 404 Avg Moisture: ${m404Avg !== '—' ? `${m404Avg}%` : '—'} | SB Avg Turbidity: ${sbTurbAvg}\n\n`;
  } else if (isSALSA500Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const rows = Array.isArray(rawData.rows)
      ? rawData.rows
      : Array.isArray(rawData.data?.rows)
      ? rawData.data.rows
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const naclVals = [];
    rows.forEach((r) => {
      const val = parseFloat(r.nacl);
      if (!isNaN(val)) naclVals.push(val);
    });
    const avgNaCl = naclVals.length > 0 ? (naclVals.reduce((a, b) => a + b, 0) / naclVals.length).toFixed(2) : '—';

    sieveTextSummary = `Soda Ash Plant LSA at 500# Analysis Readings:\n` +
      rows.map((r, i) =>
        `#${i + 1} | Time: ${r.time || '—'} | NaCl: ${formatVal(r.nacl)}% | BD: ${formatVal(r.bd)} g/L | Turbidity: ${formatVal(r.turbidity)} NTU`
      ).join('\n') +
      `\nAverage NaCl: ${avgNaCl !== '—' ? `${avgNaCl}%` : '—'} (${rows.length} Total Time Slots)\n\n`;
  } else if (isSAE501T501Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const readings = Array.isArray(rawData.readings)
      ? rawData.readings
      : Array.isArray(rawData.data?.readings)
      ? rawData.data.readings
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const calcAvg = (field) => {
      const vals = readings
        .map((r) => parseFloat(r[field]))
        .filter((n) => !isNaN(n));
      return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—';
    };

    const eFnh3Avg = calcAvg('e501_fnh3');
    const eNa2co3Avg = calcAvg('e501_na2co3');
    const tFnh3Avg = calcAvg('t501_fnh3');
    const tNa2co3Avg = calcAvg('t501_na2co3');

    sieveTextSummary = `SA Plant E 501 / T 501 Analysis Readings:\n` +
      readings.map((r, i) =>
        `#${i + 1} | Shift: ${r.shift || '—'} | E 501 (FNH3: ${formatVal(r.e501_fnh3)} g/L, Na2CO3: ${formatVal(r.e501_na2co3)} g/L) | T 501 (FNH3: ${formatVal(r.t501_fnh3)} g/L, Na2CO3: ${formatVal(r.t501_na2co3)} g/L)`
      ).join('\n') +
      `\nCalculated Averages:\nE 501 -> FNH3: ${eFnh3Avg} g/L, Na2CO3: ${eNa2co3Avg} g/L | T 501 -> FNH3: ${tFnh3Avg} g/L, Na2CO3: ${tNa2co3Avg} g/L\n\n`;
  } else if (isSALSAShiftAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.data?.shifts || rawData.rows || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const sList = [
      { key: 'iShift', label: 'I SHIFT (06:00–14:00)' },
      { key: 'iiShift', label: 'II SHIFT (14:00–22:00)' },
      { key: 'iiiShift', label: 'III SHIFT (22:00–06:00)' },
      { key: 'composite', label: 'COMPOSITE (24-Hour Composite)' },
    ];

    sieveTextSummary = `SA Plant LSA Shift Analysis Readings (8 Parameters):\n` +
      sList.map((s) => {
        const r = shiftsObj[s.key] || {};
        return `${s.label}:
- Na2CO3: ${formatVal(r.na2co3)}% (Spec: 98.5–99.5%)
- NaCl: ${formatVal(r.nacl)}% (Spec: 0.5–1.0%)
- Fe: ${formatVal(r.fe)}% (Spec: 0.006–0.008%)
- Na2SO4: ${formatVal(r.na2so4)}% (Spec: 0.079–0.081%)
- VM: ${formatVal(r.vm)}% (Spec: 0.5–2.1%)
- IR: ${formatVal(r.ir)}% (Spec: 0.14–0.16%)
- BD: ${formatVal(r.bd)} g/L (Spec: 500–750 g/L)
- Turbidity: ${formatVal(r.turbidity)} NTU (Spec: 75–85 NTU)`;
      }).join('\n\n') + '\n\n';
  } else if (isSALSABaggingAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftAnalysis = rawData.shiftAnalysis || rawData.shifts || {};
    const hourlyReadings = Array.isArray(rawData.hourlyReadings) ? rawData.hourlyReadings : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const saveType = rawData.saveType || (shift ? 'shift' : 'all');
    const targetShift = rawData.targetShift || (shift || 'all');

    let textBlocks = [];

    // Shift Analysis summary
    if (saveType !== 'hourly' || Object.keys(shiftAnalysis).length > 0) {
      const sList = [
        { key: 'shift1', label: 'SHIFT 1 (06:00–14:00)' },
        { key: 'shift2', label: 'SHIFT 2 (14:00–22:00)' },
        { key: 'shift3', label: 'SHIFT 3 (22:00–06:00)' },
      ];

      const activeShifts = targetShift !== 'all' && targetShift !== 'All Shifts'
        ? sList.filter((s) => s.key === targetShift || s.label.toLowerCase().includes(String(targetShift).toLowerCase()))
        : sList;

      const displayShifts = activeShifts.length > 0 ? activeShifts : sList;

      const shiftSummary = `SA Plant LSA Bagging Shift Analysis Readings (Once in a Shift):\n` +
        displayShifts.map((s) => {
          const r = shiftAnalysis[s.key] || {};
          return `${s.label}:
- Na2CO3: ${formatVal(r.na2co3)}% (Spec: 98.5–99.5%)
- NaCl: ${formatVal(r.nacl)}% (Spec: 0.5–1.0%)
- Fe2O3: ${formatVal(r.fe)}% (Spec: 0.006–0.008%)
- Na2SO4: ${formatVal(r.na2so4)}% (Spec: 0.079–0.081%)
- VM: ${formatVal(r.vm)}% (Spec: 0.5–2.1%)
- IR: ${formatVal(r.ir)}% (Spec: 0.14–0.16%)
- BD: ${formatVal(r.bd)} g/L (Spec: 500–750 g/L)
- Turbidity: ${formatVal(r.turbidity)} NTU (Spec: 75–85 NTU)`;
        }).join('\n\n');
      textBlocks.push(shiftSummary);
    }

    // Hourly Routine Monitoring summary
    if (saveType !== 'shift' && hourlyReadings.length > 0) {
      const recordedHours = hourlyReadings.filter((h) => (h.nacl !== '' && h.nacl !== null && h.nacl !== undefined) || (h.bd !== '' && h.bd !== null && h.bd !== undefined));
      const hoursText = `SA Plant LSA Bagging Hourly Routine Monitoring (${recordedHours.length} Readings Recorded):\n` +
        (recordedHours.length > 0
          ? recordedHours.map((h, i) => `#${i + 1} | Time: ${h.time} | Shift: ${h.shift} | NaCl: ${formatVal(h.nacl)}% (Spec: 0.5–1.0%) | BD: ${formatVal(h.bd)} g/L (Spec: 500–750 g/L)`).join('\n')
          : 'No hourly readings entered yet.');
      textBlocks.push(hoursText);
    }

    sieveTextSummary = textBlocks.join('\n\n') + '\n\n';
  } else if (isSALSABaggingSieveAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const rows = Array.isArray(rawData.rows)
      ? rawData.rows
      : Array.isArray(rawData.data?.rows)
      ? rawData.data.rows
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const recordedRows = rows.filter((r) =>
      ['bss10', 'bss30', 'm30', 'bss60', 'p10', 'p30', 'p60', 'm60'].some((k) => r[k] !== '' && r[k] !== null && r[k] !== undefined)
    );

    sieveTextSummary = `SA Plant LSA Bagging Sieve Analysis (${recordedRows.length} Sampling Intervals Recorded):\n` +
      (recordedRows.length > 0
        ? recordedRows.map((r, i) => {
            const bss10 = formatVal(r.bss10 !== undefined && r.bss10 !== '' ? r.bss10 : r.p10);
            const bss30 = formatVal(r.bss30 !== undefined && r.bss30 !== '' ? r.bss30 : r.p30);
            const m30 = formatVal(r.m30 !== undefined && r.m30 !== '' ? r.m30 : r.p60);
            const bss60 = formatVal(r.bss60 !== undefined && r.bss60 !== '' ? r.bss60 : r.m60);
            return `#${i + 1} | Time: ${r.time || '—'} | BSS 10: ${bss10}% | BSS 30: ${bss30}% (Spec: 1.5–2.0%) | -30: ${m30}% | BSS 60: ${bss60}% (Spec: 5.5–6.0%)`;
          }).join('\n')
        : 'No sieve readings entered yet.') + '\n\n';
  } else if (isSAGasConcAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const rows = Array.isArray(rawData.rows)
      ? rawData.rows
      : Array.isArray(rawData.data?.rows)
      ? rawData.data.rows
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    sieveTextSummary = `SA Plant Gas Conc. Analysis (${rows.length} Observations Recorded):\n` +
      (rows.length > 0
        ? rows.map((r, i) => {
            const d = r.displayDate || r.date || '—';
            const t = r.time || '—';
            const s = r.seal || 'NOT OK';
            const rec = formatVal(r.recoveryCo2Con);
            const cln = formatVal(r.cleaningGas);
            const bot = formatVal(r.bottomGas);
            return `#${i + 1} | Date: ${d} | Time: ${t} | Seal: ${s} | Recovery CO2: ${rec}% (Spec: 75%–85%) | Cleaning Gas: ${cln}% (Spec: 9%–11%) | Bottom Gas: ${bot}% (Spec: 80%–90%)`;
          }).join('\n')
        : 'No observations recorded yet.') + '\n\n';
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
  } else if (isOffsetCBD) {
    const rawData = savedRecord?.data?.shifts || savedRecord?.shifts || savedRecord?.data || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `CBD Analysis Parameters:
- I SHIFT: pH: ${formatVal(rawData.iShift?.ph)}, PO4: ${formatVal(rawData.iShift?.po4)}, Na2SO3: ${formatVal(rawData.iShift?.na2so3)}, T.Alk: ${formatVal(rawData.iShift?.talk)}, T.Fe: ${formatVal(rawData.iShift?.tfe)}, SiO2: ${formatVal(rawData.iShift?.sio2)}, SS: ${formatVal(rawData.iShift?.ss)}, TDS: ${formatVal(rawData.iShift?.tds)}
- II SHIFT: pH: ${formatVal(rawData.iiShift?.ph)}, PO4: ${formatVal(rawData.iiShift?.po4)}, Na2SO3: ${formatVal(rawData.iiShift?.na2so3)}, T.Alk: ${formatVal(rawData.iiShift?.talk)}, T.Fe: ${formatVal(rawData.iiShift?.tfe)}, SiO2: ${formatVal(rawData.iiShift?.sio2)}, SS: ${formatVal(rawData.iiShift?.ss)}, TDS: ${formatVal(rawData.iiShift?.tds)}
- III SHIFT: pH: ${formatVal(rawData.iiiShift?.ph)}, PO4: ${formatVal(rawData.iiiShift?.po4)}, Na2SO3: ${formatVal(rawData.iiiShift?.na2so3)}, T.Alk: ${formatVal(rawData.iiiShift?.talk)}, T.Fe: ${formatVal(rawData.iiiShift?.tfe)}, SiO2: ${formatVal(rawData.iiiShift?.sio2)}, SS: ${formatVal(rawData.iiiShift?.ss)}, TDS: ${formatVal(rawData.iiiShift?.tds)}
`;
  } else if (isOffsetBottomAsh) {
    const rawData = Array.isArray(savedRecord?.data?.readings) ? savedRecord.data.readings : (Array.isArray(savedRecord?.readings) ? savedRecord.readings : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Bottom Ash Analysis Readings:
` + rawData.map((r, i) => `- ${r.time || `Slot ${i+1}`}: Combustible %: ${formatVal(r.combustible)}, GCV: ${formatVal(r.gcv)}, Moisture %: ${formatVal(r.moisture)}`).join('\n') + '\n';
  } else if (isOffsetFlyAsh) {
    const rawData = Array.isArray(savedRecord?.data?.readings) ? savedRecord.data.readings : (Array.isArray(savedRecord?.readings) ? savedRecord.readings : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Fly Ash Analysis Readings:
` + rawData.map((r, i) => `- ${r.time || `Slot ${i+1}`}: Combustible %: ${formatVal(r.combustible)}, GCV: ${formatVal(r.gcv)}`).join('\n') + '\n';
  } else if (isOffsetDistillerWaste) {
    const rawData = Array.isArray(savedRecord?.data?.readings) ? savedRecord.data.readings : (Array.isArray(savedRecord?.readings) ? savedRecord.readings : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Distiller Waste Analysis Readings:
` + rawData.map((r, i) => `- ${r.time || `Slot ${i+1}`}: Ex.CaO: ${formatVal(r.exCao)}, FNH3: ${formatVal(r.fnh3)}, CNH3: ${formatVal(r.cnh3)}, TNH3: ${formatVal(r.tnh3)}, NaHCO3: ${formatVal(r.nahco3)}`).join('\n') + '\n';
  } else if (isOffsetVacuumSealWater) {
    const rawData = Array.isArray(savedRecord?.data?.readings) ? savedRecord.data.readings : (Array.isArray(savedRecord?.readings) ? savedRecord.readings : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Vacuum Seal Water Analysis Readings:
` + rawData.map((r, i) => `- ${r.time || `Slot ${i+1}`}: FNH3: ${formatVal(r.fnh3)}, CNH3: ${formatVal(r.cnh3)}, Ca: ${formatVal(r.ca)}`).join('\n') + '\n';
  } else if (isOffsetSewerWater) {
    const rawData = Array.isArray(savedRecord?.data?.readings) ? savedRecord.data.readings : (Array.isArray(savedRecord?.readings) ? savedRecord.readings : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Sewer Water Analysis Readings:
` + rawData.map((r, i) => `- ${r.time || `Slot ${i+1}`}: Sec 200 (FNH3: ${formatVal(r.sec200?.fnh3)}, CNH3: ${formatVal(r.sec200?.cnh3)}) | Sec 400 (FNH3: ${formatVal(r.sec400?.fnh3)}, CNH3: ${formatVal(r.sec400?.cnh3)}, HCO3: ${formatVal(r.sec400?.hco3)}) | Final Outlet (FNH3: ${formatVal(r.finalOutlet?.fnh3)}, CNH3: ${formatVal(r.finalOutlet?.cnh3)}, HCO3: ${formatVal(r.finalOutlet?.hco3)}, PCL: ${formatVal(r.finalOutlet?.pcl)})`).join('\n') + '\n';
  } else if (isOffsetCoolingWater) {
    const rawData = Array.isArray(savedRecord?.data?.readings) ? savedRecord.data.readings : (Array.isArray(savedRecord?.readings) ? savedRecord.readings : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Cooling Water Analysis Readings:
` + rawData.map((r, i) => `- ${r.time || `Slot ${i+1}`}: pH: ${formatVal(r.ph)}, FRC: ${formatVal(r.frc)}, O-PO4: ${formatVal(r.opo4)}, Cl: ${formatVal(r.cl)}${r.turbidity !== undefined ? `, Turbidity: ${formatVal(r.turbidity)}, TDS: ${formatVal(r.tds)}, Fe: ${formatVal(r.fe)}, SiO2: ${formatVal(r.sio2)}, ALK: ${formatVal(r.alk)}, SO4: ${formatVal(r.so4)}, TH: ${formatVal(r.th)}, CaH: ${formatVal(r.cah)}, MgH: ${formatVal(r.mgh)}, Amm.N: ${formatVal(r.ammn)}` : ''}`).join('\n') + '\n';
  } else if (isOffsetDMWater) {
    const rawData = Array.isArray(savedRecord?.data?.readings) ? savedRecord.data.readings : (Array.isArray(savedRecord?.readings) ? savedRecord.readings : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `DM Water Analysis Readings:
` + rawData.map((r, i) => `- ${r.unit || `Sample ${i+1}`} (${r.time || '—'}): pH: ${formatVal(r.ph)}, Cond: ${formatVal(r.cond)}, TH: ${formatVal(r.th)}, Alk: ${formatVal(r.alk)}, SiO2: ${formatVal(r.sio2)}`).join('\n') + '\n';
  } else if (isOffsetBFW) {
    const rawData = Array.isArray(savedRecord?.data?.readings) ? savedRecord.data.readings : (Array.isArray(savedRecord?.readings) ? savedRecord.readings : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Boiler Feed Water / SHS Analysis Readings:
` + rawData.map((r, i) => `- ${r.stream || `Stream ${i+1}`} (${r.time || '15:00'}): pH: ${formatVal(r.ph)}, Cond: ${formatVal(r.cond)}, TH: ${formatVal(r.th)}, Alk: ${formatVal(r.alk || r.tAlk)}, SiO2: ${formatVal(r.sio2)}`).join('\n') + '\n';
  } else if (isOffsetRawWater) {
    const rawData = savedRecord?.data?.parameters || savedRecord?.data || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    sieveTextSummary = `Raw Water Analysis Parameters (08:00 Sample):
- Physical/Solids: pH: ${formatVal(rawData.ph)}, Cond: ${formatVal(rawData.cond)}, Turbidity: ${formatVal(rawData.turbidity)}, TDS: ${formatVal(rawData.tds)}, Free Cl2: ${formatVal(rawData.freeCl2)}, Fe: ${formatVal(rawData.fe)}, SiO2: ${formatVal(rawData.sio2)}
- Hardness/Anions: M.Alk: ${formatVal(rawData.mAlk)}, TH: ${formatVal(rawData.th)}, Ca-H: ${formatVal(rawData.caH)}, Mg-H: ${formatVal(rawData.mgH)}, Cl: ${formatVal(rawData.cl)}, SO4: ${formatVal(rawData.so4)}, EMA: ${formatVal(rawData.ema)}
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
  if (isTK209Analysis) {
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
        <div class="field-label">TK 209 Shift Measurements (${shiftDisplay}) — Unit: Kgm/m³</div>
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
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">0.58 – 0.78</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">CNH₃ (Combined Ammonia)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(sValues.cnh3)}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">2.26 – 2.46</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">TCl (Total Chlorine)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(sValues.tcl)}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">2.94 – 3.14</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">PCl (Polymer Chloride)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a;">${formatVal(sValues.pcl)}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">0.58 – 0.78</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  } else if (isTK204Analysis) {
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

    const formatVal = (v) => {
      if (v === null || v === undefined || v === '') return '—';
      const num = Number(v);
      return !isNaN(num) ? num.toFixed(2) : String(v);
    };

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>TK 203 Analysis Results — Current Save: <strong style="color: #0f2e5a;">${shiftLabel || 'All Shifts'}</strong> (Unit: Kgm/m³)</span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
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
              const isCurSlot = changedSlotKeys && changedSlotKeys.length > 0 && changedSlotKeys.includes(s.key);
              const bg = isCurSlot ? 'background-color: #f0fdf4;' : (idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;');
              const slotBadge = isCurSlot ? '<span style="font-size: 9px; background: #16a34a; color: white; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">CURRENT SAVE</span>' : '';
              return `
                <tr style="${bg}">
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">${s.time} <span style="font-size: 10px; color: #64748b; font-weight: normal;">(${s.shift})</span>${slotBadge}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.fnh3)}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.cnh3)}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.tcl)}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.pcl)}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.co2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (isCR203Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const tRows = rawData.timeRows || {};
    const fRow = rawData.fnh3Row || {};
    const pRow = rawData.pclRow || {};
    const streams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const slots = [
      { key: 't07', time: '07:00', shift: 'I Shift' },
      { key: 't11', time: '11:00', shift: 'I Shift' },
      { key: 't15', time: '15:00', shift: 'II Shift' },
      { key: 't19', time: '19:00', shift: 'II Shift' },
      { key: 't23', time: '23:00', shift: 'III Shift' },
      { key: 't03', time: '03:00', shift: 'III Shift' },
    ];

    let activeSlots = slots;
    if (shiftLabel && /I SHIFT|Shift 1|shift1/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'I Shift');
    } else if (shiftLabel && /II SHIFT|Shift 2|shift2/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'II Shift');
    } else if (shiftLabel && /III SHIFT|Shift 3|shift3/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'III Shift');
    }

    dataHtml = `
      <div class="field-group">
        <div class="field-label">CR 203 Analysis Results (${shiftLabel || 'All Shifts'}) — Unit: Kgm/m³</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 6px 5px; text-align: left; border: 1px solid #cbd5e1;">Slot / Row</th>
              ${streams.map(st => `<th style="padding: 6px 4px; text-align: center; border: 1px solid #cbd5e1;">${st.toUpperCase()}</th>`).join('')}
              <th style="padding: 6px 4px; text-align: center; border: 1px solid #cbd5e1;">AVG TCl (5.54–5.74)</th>
            </tr>
          </thead>
          <tbody>
            ${activeSlots.map((s, idx) => {
              const r = tRows[s.key] || {};
              const bg = idx % 2 === 1 ? 'background-color: #f8fafc;' : '';
              return `
                <tr style="${bg}">
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">${s.time} <span style="font-size: 9.5px; color: #64748b;">(${s.shift})</span></td>
                  ${streams.map(st => `<td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(r[st])}</td>`).join('')}
                  <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #4338ca;">${formatVal(r.avgTcl)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #ecfdf5; border-top: 2px solid #a7f3d0;">
              <td style="padding: 5px 6px; border: 1px solid #e2e8f0; font-weight: 800; color: #065f46;">FNH₃ (3.07–3.27)</td>
              ${streams.map(st => `<td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(fRow[st])}</td>`).join('')}
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #4338ca;">${formatVal(fRow.avgTcl)}</td>
            </tr>
            <tr style="background-color: #f0f9ff; border-top: 1px solid #bae6fd;">
              <td style="padding: 5px 6px; border: 1px solid #e2e8f0; font-weight: 800; color: #0369a1;">PCl (3.56–3.76)</td>
              ${streams.map(st => `<td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(pRow[st])}</td>`).join('')}
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0369a1;">${formatVal(pRow.avgTcl)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  } else if (isCR202Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const tRows = rawData.timeRows || {};
    const fRow = rawData.fnh3Row || {};
    const pRow = rawData.pclRow || {};
    const streams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const slots = [
      { key: 't07', time: '07:00', shift: 'I Shift' },
      { key: 't11', time: '11:00', shift: 'I Shift' },
      { key: 't15', time: '15:00', shift: 'II Shift' },
      { key: 't19', time: '19:00', shift: 'II Shift' },
      { key: 't23', time: '23:00', shift: 'III Shift' },
      { key: 't03', time: '03:00', shift: 'III Shift' },
    ];

    let activeSlots = slots;
    if (shiftLabel && /I SHIFT|Shift 1|shift1/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'I Shift');
    } else if (shiftLabel && /II SHIFT|Shift 2|shift2/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'II Shift');
    } else if (shiftLabel && /III SHIFT|Shift 3|shift3/i.test(shiftLabel)) {
      activeSlots = slots.filter(s => s.shift === 'III Shift');
    }

    dataHtml = `
      <div class="field-group">
        <div class="field-label">CR 202 Analysis Results (${shiftLabel || 'All Shifts'}) — Unit: Kgm/m³</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 6px 5px; text-align: left; border: 1px solid #cbd5e1;">Slot / Row</th>
              ${streams.map(st => `<th style="padding: 6px 4px; text-align: center; border: 1px solid #cbd5e1;">${st.toUpperCase()}</th>`).join('')}
              <th style="padding: 6px 4px; text-align: center; border: 1px solid #cbd5e1;">AVG TCl</th>
              <th style="padding: 6px 4px; text-align: center; border: 1px solid #cbd5e1;">AVG A-H</th>
            </tr>
          </thead>
          <tbody>
            ${activeSlots.map((s, idx) => {
              const r = tRows[s.key] || {};
              const bg = idx % 2 === 1 ? 'background-color: #f8fafc;' : '';
              return `
                <tr style="${bg}">
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">${s.time} <span style="font-size: 9.5px; color: #64748b;">(${s.shift})</span></td>
                  ${streams.map(st => `<td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(r[st])}</td>`).join('')}
                  <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #4338ca;">${formatVal(r.avgTcl)}</td>
                  <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #047857;">${formatVal(r.avgAH)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #ecfdf5; border-top: 2px solid #a7f3d0;">
              <td style="padding: 5px 6px; border: 1px solid #e2e8f0; font-weight: 800; color: #065f46;">FNH₃ (3.00–3.20)</td>
              ${streams.map(st => `<td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(fRow[st])}</td>`).join('')}
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center;">—</td>
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #065f46;">${formatVal(fRow.avgAH)}</td>
            </tr>
            <tr style="background-color: #fdf2f8; border-top: 1px solid #fbcfe8;">
              <td style="padding: 5px 6px; border: 1px solid #e2e8f0; font-weight: 800; color: #9d174d;">PCl (1.80–2.00)</td>
              ${streams.map(st => `<td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${formatVal(pRow[st])}</td>`).join('')}
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center;">—</td>
              <td style="padding: 5px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #9d174d;">${formatVal(pRow.avgAH)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  } else if (isTK207Analysis) {
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
        <div class="field-label">TK 207 Analysis Results (${shiftLabel || 'All Shifts'}) — Unit: Kgm/m³</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 8px; text-align: left; border: 1px solid #cbd5e1;">Time Slot</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ (3.92–4.12)</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">CNH₃ (1.82–2.02)</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">TCl (5.37–5.57)</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">PCl (3.45–3.65)</th>
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
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (isTK205Analysis) {
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
        <div class="field-label">TK 205 Analysis Results (${shiftLabel || 'All Shifts'}) — Unit: Kgm/m³</div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 8px; text-align: left; border: 1px solid #cbd5e1;">Time Slot</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">FNH₃</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">CNH₃</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">TCl</th>
              <th style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">PCl</th>
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
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (isPclTclAnalysis) {
    const rawData = savedRecord?.data?.shiftRows || savedRecord?.data?.rows || savedRecord?.shiftRows || savedRecord?.data || {};
    let sKey = 'shift1';
    const cleanShift = String(shiftLabel || '').trim();
    if (cleanShift === 'shift3' || /III|\b3\b|shift\s*3/i.test(cleanShift)) {
      sKey = 'shift3';
    } else if (cleanShift === 'shift2' || /II|\b2\b|shift\s*2/i.test(cleanShift)) {
      sKey = 'shift2';
    } else {
      sKey = 'shift1';
    }
    const shiftDisplay = sKey === 'shift1' ? 'I SHIFT (06:00 – 14:00)' : sKey === 'shift2' ? 'II SHIFT (14:00 – 22:00)' : 'III SHIFT (22:00 – 06:00)';
    const sValues = rawData[sKey] || {};
    const streams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const formatVal = (v) => {
      if (v === null || v === undefined || v === '') return '—';
      const num = Number(v);
      return !isNaN(num) ? num.toFixed(2) : String(v);
    };

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>PCL/TCL Analysis Results — Current Save: <strong style="color: #0f2e5a;">${shiftDisplay}</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 6px; text-align: left; border: 1px solid #cbd5e1;">Shift</th>
              ${streams.map(st => `<th style="padding: 7px 4px; text-align: center; border: 1px solid #cbd5e1;">Stream ${st.toUpperCase()}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b; background-color: #f8fafc;">
                ${sKey === 'shift1' ? 'I SHIFT' : sKey === 'shift2' ? 'II SHIFT' : 'III SHIFT'}
                <div style="font-size: 9px; color: #16a34a; font-weight: bold;">CURRENT SAVE</div>
              </td>
              ${streams.map(st => {
                const val = formatVal(sValues[st]);
                return `<td style="padding: 6px 4px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0f172a; background-color: #f0fdf4;">${val}</td>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Unit: <strong>Kgm/m³</strong> | Allowed Range: <strong>0.03–0.30 Kgm/m³</strong> (0.05–0.10 Kgm/m³ +0.2 / -0.02)
        </div>
      </div>`;
  } else if (isCaCl2Analysis) {
    const rawData = savedRecord?.data?.readings || savedRecord?.readings || (Array.isArray(savedRecord?.data) ? savedRecord?.data : []);
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>CaCl2 Analysis Results — Frequency: <strong style="color: #0f2e5a;">Day</strong> (${rawData.length} Sampling ${rawData.length === 1 ? 'Row' : 'Rows'})</span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 6px; text-align: center; border: 1px solid #cbd5e1;">#</th>
              <th style="padding: 7px 8px; text-align: left; border: 1px solid #cbd5e1;">Sample / Stream</th>
              <th style="padding: 7px 6px; text-align: center; border: 1px solid #cbd5e1;">Time</th>
              <th style="padding: 7px 6px; text-align: center; border: 1px solid #cbd5e1;">pH (7.7 ±1)</th>
              <th style="padding: 7px 6px; text-align: center; border: 1px solid #cbd5e1;">CONC % (20 ±5)</th>
              <th style="padding: 7px 6px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ PPM (±50)</th>
              <th style="padding: 7px 6px; text-align: center; border: 1px solid #cbd5e1;">CNH₃ PPM (±100)</th>
              <th style="padding: 7px 6px; text-align: center; border: 1px solid #cbd5e1;">SS PPM (±10)</th>
            </tr>
          </thead>
          <tbody>
            ${rawData.map((r, idx) => {
              const bg = idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
              return `
                <tr style="${bg}">
                  <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #64748b;">${idx + 1}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">${r.sample || 'CaCl2 Solution'}</td>
                  <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace;">${r.time || '—'}</td>
                  <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.ph)}</td>
                  <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.conc)}</td>
                  <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.fnh3)}</td>
                  <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.cnh3)}</td>
                  <td style="padding: 6px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #0f172a;">${formatVal(r.ss)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Parameters & Tolerances: <strong>pH: 6.7–8.7</strong> | <strong>CONC: 15%–25%</strong> | <strong>FNH₃: 950–1050 PPM</strong> | <strong>CNH₃: 400–600 PPM</strong> | <strong>SS: 50–70 PPM</strong>
        </div>
      </div>`;
  } else if (isACLProductAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const chem = rawData.chemicalData || rawData.chemical || {};
    const bss = rawData.bssData || rawData.bss || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const bssMeshKeys = ['p6', 'p8', 'p12', 'p16', 'p18', 'p44', 'p60', 'p100', 'm100'];
    const bssLabels = {
      p6: '+6 % (+6 Mesh)', p8: '+8 % (+8 Mesh)', p12: '+12 % (+12 Mesh)', p16: '+16 % (+16 Mesh)', p18: '+18 % (+18 Mesh)',
      p44: '+44 % (+44 Mesh)', p60: '+60 % (+60 Mesh)', p100: '+100 % (+100 Mesh)', m100: '-100 % (-100 Mesh)'
    };
    let bssSum = 0;
    let bssCount = 0;
    bssMeshKeys.forEach(k => {
      const v = bss[k];
      if (v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) {
        bssSum += Number(v);
        bssCount += 1;
      }
    });
    const totalRecoveryStr = bssCount > 0 ? `${bssSum.toFixed(1)} %` : '—';

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>ACL Product Analysis — <strong>Chemical & Physical Characteristics</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Parameter</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Value</th>
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Parameter</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">NH₄Cl % (Ammonium Chloride)</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7;">${formatVal(chem.nh4cl)}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">NaCl % (Sodium Chloride)</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7;">${formatVal(chem.nacl)}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">Fe₂O₃ % (Ferric Oxide)</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7;">${formatVal(chem.fe2o3)}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">H₂O % (Moisture)</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7;">${formatVal(chem.h2o)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">IR % (Insoluble Residue)</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7;">${formatVal(chem.ir)}</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">BD (Bulk Density - g/L)</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7;">${formatVal(chem.bd)}</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e293b;">+18 % (Oversize Particle Spec)</td>
              <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7;" colspan="3">${formatVal(chem.p18_spec)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="field-group" style="margin-top: 14px;">
        <div class="field-label">
          <span>B S S (Sieve Analysis) — <strong>Particle Distribution (9 Mesh Sizes)</strong></span>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #1e1b4b; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Mesh Fraction</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Retained %</th>
            </tr>
          </thead>
          <tbody>
            ${bssMeshKeys.map((k, idx) => {
              const bg = idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
              return `
                <tr style="${bg}">
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">${bssLabels[k]}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #4338ca;">${formatVal(bss[k])}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f0fdf4; border-top: 2px solid #86efac;">
              <td style="padding: 7px 8px; border: 1px solid #e2e8f0; font-weight: 800; color: #166534;">TOTAL SIEVE RECOVERY</td>
              <td style="padding: 7px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 800; color: #166534; font-size: 13px;">${totalRecoveryStr}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  } else if (isACL300Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.shiftRows || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftList = [
      { key: 'shift1', name: 'SHIFT 1', time: '06:00 – 14:00 (I Shift)', color: '#1e40af', bg: '#eff6ff' },
      { key: 'shift2', name: 'SHIFT 2', time: '14:00 – 22:00 (II Shift)', color: '#4338ca', bg: '#eef2ff' },
      { key: 'shift3', name: 'SHIFT 3', time: '22:00 – 06:00 (III Shift)', color: '#0f766e', bg: '#f0fdfa' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>ACL 300# Analysis — <strong>Shift Measurements Table</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Shift / Schedule</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">+18 %<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(+18 Mesh Spec)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">+44 %<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(+44 Mesh Spec)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">NaCl %<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(Sodium Chloride)</span></th>
            </tr>
          </thead>
          <tbody>
            ${shiftList.map((s) => {
              const row = shiftsObj[s.key] || {};
              const isCurrentShift = shift && (shift.toLowerCase().includes(s.key) || shift.toLowerCase().includes(s.name.toLowerCase()));
              const rowBg = isCurrentShift ? 'background-color: #fef9c3; border-left: 3px solid #eab308;' : '';
              return `
                <tr style="${rowBg}">
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: ${s.color};">
                    <div>${s.name}</div>
                    <div style="font-size: 10px; color: #64748b; font-weight: normal;">${s.time}</div>
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">
                    ${formatVal(row.p18)}
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">
                    ${formatVal(row.p44)}
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">
                    ${formatVal(row.nacl)}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Operational Quality Standard: <strong>+18 Mesh Particle Distribution</strong>, <strong>+44 Mesh Particle Distribution</strong>, and <strong>Sodium Chloride (NaCl %)</strong>.
        </div>
      </div>`;
  } else if (isRawSaltAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const params = rawData.parameters || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const rawSaltParamsList = [
      { key: 'nacl', label: 'NaCl %', subLabel: 'Sodium Chloride Content', spec: 'Standard Specs' },
      { key: 'ca',   label: 'Ca %',   subLabel: 'Calcium Content',         spec: 'Standard Specs' },
      { key: 'mg',   label: 'Mg %',   subLabel: 'Magnesium Content',       spec: 'Standard Specs' },
      { key: 'so4',  label: 'SO₄ %',  subLabel: 'Sulphate Content',        spec: 'Standard Specs' },
      { key: 'ir',   label: 'IR %',   subLabel: 'Insoluble Residue',       spec: 'Standard Specs' },
      { key: 'h2o',  label: 'H₂O %',  subLabel: 'Moisture Content',        spec: 'Standard Specs' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Raw Salt Chemical Analysis — <strong>Recorded Specifications (6 Parameters)</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Parameter</th>
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Description</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">Standard Spec</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">Persisted Value</th>
            </tr>
          </thead>
          <tbody>
            ${rawSaltParamsList.map((p, idx) => {
              const bg = idx % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
              return `
                <tr style="${bg}">
                  <td style="padding: 7px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-family: monospace;">${p.label}</td>
                  <td style="padding: 7px 10px; border: 1px solid #e2e8f0; color: #475569;">${p.subLabel}</td>
                  <td style="padding: 7px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px;">${p.spec}</td>
                  <td style="padding: 7px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(params[p.key])}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Raw Salt Input: Dissolution Stream & Brine Preparation Base
        </div>
      </div>`;
  } else if (isBrineAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const rows = rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const tankList = [
      { key: 'tk109', name: 'TK 109', type: 'Storage Tank', color: '#0369a1', bg: '#f0f9ff' },
      { key: 'tk110', name: 'TK 110', type: 'Feed Tank',    color: '#047857', bg: '#f0fdf4' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Brine Analysis — <strong>TK 109 & TK 110 Measurements (g/L)</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Tank / Unit</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">NaCl (g/L)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(270–370)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">Ca (g/L)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(1–3)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">Mg (g/L)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(4–6)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">SO₄ (g/L)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(5–15)</span></th>
            </tr>
          </thead>
          <tbody>
            ${tankList.map((t) => {
              const r = rows[t.key] || {};
              return `
                <tr style="background-color: ${t.bg};">
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: ${t.color};">
                    <div>${t.name}</div>
                    <div style="font-size: 10px; color: #64748b; font-weight: normal;">${t.type}</div>
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.nacl)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.ca)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.mg)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.so4)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; border-top: 2px solid #cbd5e1;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 800; color: #334155; font-size: 11px;">SPECIFICATION</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">270 – 370 g/L</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">1 – 3 g/L</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">4 – 6 g/L</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">5 – 15 g/L</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Frequency: <strong>WEEK</strong> | Parameter Unit: <strong>g/L</strong> | Plant: <strong>ACL Plant</strong>
        </div>
      </div>`;
  } else if (isSATK401Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftList = [
      { key: 's1', altKey: 'shift1', name: 'I SHIFT',   time: '07:00 – 15:00', color: '#0369a1', bg: '#f0f9ff' },
      { key: 's2', altKey: 'shift2', name: 'II SHIFT',  time: '15:00 – 23:00', color: '#4338ca', bg: '#eef2ff' },
      { key: 's3', altKey: 'shift3', name: 'III SHIFT', time: '23:00 – 07:00', color: '#7e22ce', bg: '#faf5ff' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant TK 401 Analysis — <strong>Shift Measurements Table (Kgm/m³)</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Shift / Schedule</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(3.87–4.07)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">CNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(1.82–2.02)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">TCl (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(5.37–5.57)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">PCl (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(3.45–3.65)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">TCaO<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(No Limit)</span></th>
            </tr>
          </thead>
          <tbody>
            ${shiftList.map((s) => {
              const r = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
              const isCurrentShift = shift && (shift.toLowerCase().includes(s.key) || shift.toLowerCase().includes(s.name.toLowerCase()));
              const rowBg = isCurrentShift ? 'background-color: #fef9c3; border-left: 3px solid #eab308;' : `background-color: ${s.bg};`;
              return `
                <tr style="${rowBg}">
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: ${s.color};">
                    <div>${s.name}</div>
                    <div style="font-size: 10px; color: #64748b; font-weight: normal;">${s.time}</div>
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.fnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.cnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.tcl)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.pcl)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.tcao)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; border-top: 2px solid #cbd5e1;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 800; color: #334155; font-size: 11px;">SPECIFICATION</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">3.87 – 4.07</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">1.82 – 2.02</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">5.37 – 5.57</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">3.45 – 3.65</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #64748b; font-size: 11px;">—</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Tank: <strong>TK 401</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>`;
  } else if (isSATK405Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftList = [
      { key: 's1', altKey: 'shift1', name: 'I SHIFT',   time: '07:00 – 15:00', color: '#0369a1', bg: '#f0f9ff' },
      { key: 's2', altKey: 'shift2', name: 'II SHIFT',  time: '15:00 – 23:00', color: '#4338ca', bg: '#eef2ff' },
      { key: 's3', altKey: 'shift3', name: 'III SHIFT', time: '23:00 – 07:00', color: '#7e22ce', bg: '#faf5ff' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant TK 405 Analysis — <strong>Shift Measurements Table (Kgm/m³)</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Shift / Schedule</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(3.76–3.96)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">CNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(1.79–1.99)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">TCl (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(5.29–5.49)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">PCl (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(3.40–3.60)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">TCaO<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(No Limit)</span></th>
            </tr>
          </thead>
          <tbody>
            ${shiftList.map((s) => {
              const r = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
              const isCurrentShift = shift && (shift.toLowerCase().includes(s.key) || shift.toLowerCase().includes(s.name.toLowerCase()));
              const rowBg = isCurrentShift ? 'background-color: #fef9c3; border-left: 3px solid #eab308;' : `background-color: ${s.bg};`;
              return `
                <tr style="${rowBg}">
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: ${s.color};">
                    <div>${s.name}</div>
                    <div style="font-size: 10px; color: #64748b; font-weight: normal;">${s.time}</div>
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.fnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.cnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.tcl)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.pcl)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.tcao)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; border-top: 2px solid #cbd5e1;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 800; color: #334155; font-size: 11px;">SPECIFICATION</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">3.76 – 3.96</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">1.79 – 1.99</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">5.29 – 5.49</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">3.40 – 3.60</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #64748b; font-size: 11px;">—</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Tank: <strong>TK 405</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>`;
  } else if (isSATK414Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftList = [
      { key: 's1', altKey: 'shift1', name: 'I SHIFT',   time: '07:00 – 15:00', color: '#0369a1', bg: '#f0f9ff' },
      { key: 's2', altKey: 'shift2', name: 'II SHIFT',  time: '15:00 – 23:00', color: '#4338ca', bg: '#eef2ff' },
      { key: 's3', altKey: 'shift3', name: 'III SHIFT', time: '23:00 – 07:00', color: '#7e22ce', bg: '#faf5ff' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant TK 414 TSC Tank Analysis — <strong>Shift Measurements Table (Kgm/m³)</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Shift / Schedule</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(1.30–1.50)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">CNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(4.00–4.20)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">TCl (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(5.36–5.56)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">PCl (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(1.26–1.46)</span></th>
            </tr>
          </thead>
          <tbody>
            ${shiftList.map((s) => {
              const r = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
              const isCurrentShift = shift && (shift.toLowerCase().includes(s.key) || shift.toLowerCase().includes(s.name.toLowerCase()));
              const rowBg = isCurrentShift ? 'background-color: #fef9c3; border-left: 3px solid #eab308;' : `background-color: ${s.bg};`;
              return `
                <tr style="${rowBg}">
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: ${s.color};">
                    <div>${s.name}</div>
                    <div style="font-size: 10px; color: #64748b; font-weight: normal;">${s.time}</div>
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.fnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.cnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.tcl)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.pcl)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; border-top: 2px solid #cbd5e1;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 800; color: #334155; font-size: 11px;">SPECIFICATION</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">1.30 – 1.50</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">4.00 – 4.20</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">5.36 – 5.56</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">1.26 – 1.46</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Tank: <strong>TK 414 TSC TANK</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>`;
  } else if (isSAP413Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftList = [
      { key: 's1', altKey: 'shift1', name: 'I SHIFT',   time: '07:00 – 15:00', color: '#0369a1', bg: '#f0f9ff' },
      { key: 's2', altKey: 'shift2', name: 'II SHIFT',  time: '15:00 – 23:00', color: '#4338ca', bg: '#eef2ff' },
      { key: 's3', altKey: 'shift3', name: 'III SHIFT', time: '23:00 – 07:00', color: '#7e22ce', bg: '#faf5ff' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant P413 WSC Tank Analysis — <strong>Shift Measurements Table (Kgm/m³)</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Shift / Schedule</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(1.48–1.68)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">CNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(3.99–4.19)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">TCl (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(5.35–5.55)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">PCl (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(1.26–1.46)</span></th>
            </tr>
          </thead>
          <tbody>
            ${shiftList.map((s) => {
              const r = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
              const isCurrentShift = shift && (shift.toLowerCase().includes(s.key) || shift.toLowerCase().includes(s.name.toLowerCase()));
              const rowBg = isCurrentShift ? 'background-color: #fef9c3; border-left: 3px solid #eab308;' : `background-color: ${s.bg};`;
              return `
                <tr style="${rowBg}">
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: ${s.color};">
                    <div>${s.name}</div>
                    <div style="font-size: 10px; color: #64748b; font-weight: normal;">${s.time}</div>
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.fnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.cnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.tcl)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.pcl)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; border-top: 2px solid #cbd5e1;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 800; color: #334155; font-size: 11px;">SPECIFICATION</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">1.48 – 1.68</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">3.99 – 4.19</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">5.35 – 5.55</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">1.26 – 1.46</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Tank: <strong>P413 WSC TANK</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>`;
  } else if (isSATK419Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.rows || rawData || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const shiftList = [
      { key: 's1', altKey: 'shift1', name: 'I SHIFT',   time: '07:00 – 15:00', color: '#0369a1', bg: '#f0f9ff' },
      { key: 's2', altKey: 'shift2', name: 'II SHIFT',  time: '15:00 – 23:00', color: '#4338ca', bg: '#eef2ff' },
      { key: 's3', altKey: 'shift3', name: 'III SHIFT', time: '23:00 – 07:00', color: '#7e22ce', bg: '#faf5ff' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant TK 419 SC Tank Analysis — <strong>Shift Measurements Table (Kgm/m³)</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 7px 10px; text-align: left; border: 1px solid #cbd5e1;">Shift / Schedule</th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(1.98–2.18)</span></th>
              <th style="padding: 7px 10px; text-align: center; border: 1px solid #cbd5e1;">CNH₃ (Kgm/m³)<br><span style="font-size: 10px; font-weight: normal; opacity: 0.85;">(3.96–4.16)</span></th>
            </tr>
          </thead>
          <tbody>
            ${shiftList.map((s) => {
              const r = shiftsObj[s.key] || shiftsObj[s.altKey] || {};
              const isCurrentShift = shift && (shift.toLowerCase().includes(s.key) || shift.toLowerCase().includes(s.name.toLowerCase()));
              const rowBg = isCurrentShift ? 'background-color: #fef9c3; border-left: 3px solid #eab308;' : `background-color: ${s.bg};`;
              return `
                <tr style="${rowBg}">
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; font-weight: 700; color: ${s.color};">
                    <div>${s.name}</div>
                    <div style="font-size: 10px; color: #64748b; font-weight: normal;">${s.time}</div>
                  </td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.fnh3)}</td>
                  <td style="padding: 8px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace; font-size: 13px;">${formatVal(r.cnh3)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; border-top: 2px solid #cbd5e1;">
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-weight: 800; color: #334155; font-size: 11px;">SPECIFICATION</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">1.98 – 2.18</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #2563eb; font-size: 11px;">3.96 – 4.16</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Tank: <strong>TK 419 SC TANK</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>`;
  } else if (isSAT401Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const unitsObj = rawData.units || rawData.towers || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const unitList = [
      { key: 'a', label: 'T 401 A', sub: 'Option A' },
      { key: 'b', label: 'T 401 B', sub: 'Option B' },
      { key: 'c', label: 'T 401 C', sub: 'Option C' },
      { key: 'd', label: 'T 401 D', sub: 'Option D' },
      { key: 'e', label: 'T 401 E', sub: 'Option E' },
      { key: 'f', label: 'T 401 F', sub: 'Option F' },
    ];
    const shiftList = [
      { key: 's1', altKey: 'shift1', name: 'I SHIFT', time: '07:00 – 15:00', color: '#0369a1', bg: '#f0f9ff' },
      { key: 's2', altKey: 'shift2', name: 'II SHIFT', time: '15:00 – 23:00', color: '#4338ca', bg: '#eef2ff' },
      { key: 's3', altKey: 'shift3', name: 'III SHIFT', time: '23:00 – 07:00', color: '#7e22ce', bg: '#faf5ff' },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant T 401 Analysis — <strong>Tower Options A–F Shift Measurements (Kgm/m³)</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Tower Unit</th>
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Shift</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ (0.88–1.08)</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">CNH₃ (4.40–4.60)</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">TCl (5.70–5.90)</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">PCl (1.02–1.22)</th>
            </tr>
          </thead>
          <tbody>
            ${unitList.map(u => {
              const uData = unitsObj[u.key] || {};
              return shiftList.map((s, sIdx) => {
                const r = uData[s.key] || uData[s.altKey] || {};
                const isCur = shift && (shift.toLowerCase().includes(s.key) || shift.toLowerCase().includes(s.name.toLowerCase()));
                const rowBg = isCur ? 'background-color: #fef9c3;' : (sIdx % 2 === 1 ? `background-color: ${s.bg};` : 'background-color: #ffffff;');
                return `
                  <tr style="${rowBg}">
                    ${sIdx === 0 ? `<td rowspan="3" style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: 800; color: #0f172a; vertical-align: middle; background-color: #f8fafc;">${u.label}<br><span style="font-size: 10px; color: #2563eb; font-weight: bold;">${u.sub}</span></td>` : ''}
                    <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: ${s.color};">${s.name}</td>
                    <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace;">${formatVal(r.fnh3)}</td>
                    <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace;">${formatVal(r.cnh3)}</td>
                    <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace;">${formatVal(r.tcl)}</td>
                    <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0284c7; font-family: monospace;">${formatVal(r.pcl)}</td>
                  </tr>
                `;
              }).join('');
            }).join('')}
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Tower: <strong>T 401 (Options A–F)</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>`;
  } else if (isSABicarbonateAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const readings = Array.isArray(rawData.readings)
      ? rawData.readings
      : Array.isArray(rawData.data?.readings)
      ? rawData.data.readings
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant Soda Ash Production — <strong>Bi Carbonate NaCl/Na₂CO₃ Readings</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">#</th>
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Time</th>
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Filter Selection</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">NaCl / Na₂CO₃ (%)</th>
            </tr>
          </thead>
          <tbody>
            ${readings.map((r, i) => {
              const rowBg = i % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
              return `
                <tr style="${rowBg}">
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #64748b;">${i + 1}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-family: monospace;">${r.time || '—'}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: 600; color: #334155;">${r.filter || '—'}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #0d9488; font-family: monospace;">${formatVal(r.naclNa2co3)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Section: <strong>Soda Ash Production</strong> | Analysis: <strong>Bi Carbonate NaCl/Na₂CO₃</strong>
        </div>
      </div>`;
  } else if (isSABicarbonateMoistureAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const readings = Array.isArray(rawData.readings)
      ? rawData.readings
      : Array.isArray(rawData.data?.readings)
      ? rawData.data.readings
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const m404Vals = [];
    const sbTurbVals = [];
    readings.forEach((r) => {
      ['m404_a', 'm404_b', 'm404_c'].forEach((k) => {
        const val = parseFloat(r[k]);
        if (!isNaN(val)) m404Vals.push(val);
      });
      ['sb_turb1', 'sb_turb2'].forEach((k) => {
        const val = parseFloat(r[k]);
        if (!isNaN(val)) sbTurbVals.push(val);
      });
    });
    const m404Avg = m404Vals.length > 0 ? (m404Vals.reduce((a, b) => a + b, 0) / m404Vals.length).toFixed(2) : '—';
    const sbTurbAvg = sbTurbVals.length > 0 ? (sbTurbVals.reduce((a, b) => a + b, 0) / sbTurbVals.length).toFixed(1) : '—';

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant Soda Ash Production — <strong>Bicarbonate Moisture Analysis Readings</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th rowspan="2" style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 35px;">#</th>
              <th rowspan="2" style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1; width: 110px;">Shift / Sample</th>
              <th rowspan="2" style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 65px;">Time</th>
              <th colspan="3" style="padding: 4px 8px; text-align: center; border: 1px solid #cbd5e1; background-color: #1e293b;">M 404 Moisture (%) [18%–22%]</th>
              <th rowspan="2" style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 85px;">M 405 Outlet</th>
              <th colspan="2" style="padding: 4px 8px; text-align: center; border: 1px solid #cbd5e1; background-color: #1e293b;">SB Turbidity</th>
            </tr>
            <tr style="background-color: #1e293b; color: #ffffff; font-size: 10.5px;">
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; width: 60px;">A</th>
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; width: 60px;">B</th>
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; width: 60px;">C</th>
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; width: 65px;">Turb 1</th>
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; width: 65px;">Turb 2</th>
            </tr>
          </thead>
          <tbody>
            ${readings.map((r, i) => {
              const rowBg = i % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
              const isOutOfLimit = (val) => {
                const num = parseFloat(val);
                return !isNaN(num) && (num < 18 || num > 22);
              };
              return `
                <tr style="${rowBg}">
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #64748b;">${i + 1}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${r.shift || '—'}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 600; color: #0284c7;">${r.time || '—'}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isOutOfLimit(r.m404_a) ? '#e11d48' : '#0284c7'};">${formatVal(r.m404_a)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isOutOfLimit(r.m404_b) ? '#e11d48' : '#0284c7'};">${formatVal(r.m404_b)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isOutOfLimit(r.m404_c) ? '#e11d48' : '#0284c7'};">${formatVal(r.m404_c)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 600; color: #334155;">${formatVal(r.m405_outlet)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 600; color: #0d9488;">${formatVal(r.sb_turb1)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 600; color: #0d9488;">${formatVal(r.sb_turb2)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; font-weight: 700;">
              <td colspan="3" style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #0f172a;">AVERAGE CALCULATIONS</td>
              <td colspan="3" style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #0284c7; font-family: monospace;">M 404 Avg: ${m404Avg !== '—' ? `${m404Avg}%` : '—'}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #64748b;">—</td>
              <td colspan="2" style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #0d9488; font-family: monospace;">SB Avg: ${sbTurbAvg}</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Section: <strong>Soda Ash Production</strong> | Analysis: <strong>Bicarbonate Moisture Analysis</strong> | Frequency: <strong>Once in 4 Hours</strong>
        </div>
      </div>`;
  } else if (isSALSA500Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const rows = Array.isArray(rawData.rows)
      ? rawData.rows
      : Array.isArray(rawData.data?.rows)
      ? rawData.data.rows
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const naclVals = [];
    rows.forEach((r) => {
      const val = parseFloat(r.nacl);
      if (!isNaN(val)) naclVals.push(val);
    });
    const avgNaCl = naclVals.length > 0 ? (naclVals.reduce((a, b) => a + b, 0) / naclVals.length).toFixed(2) : '—';

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Soda Ash Plant — <strong>LSA at 500# Analysis Readings</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">#</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 90px;">Time</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">NaCl % [0.5–2.0%]</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">BD [500–750 g/L]</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Turbidity [75–85 NTU]</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
              const rowBg = i % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
              const isNaclOut = (val) => {
                const num = parseFloat(val);
                return !isNaN(num) && (num < 0.5 || num > 2.0);
              };
              const isBdOut = (val) => {
                const num = parseFloat(val);
                return !isNaN(num) && (num < 500 || num > 750);
              };
              const isTurbOut = (val) => {
                const num = parseFloat(val);
                return !isNaN(num) && (num < 75 || num > 85);
              };

              return `
                <tr style="${rowBg}">
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #64748b;">${i + 1}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a;">${r.time || '—'}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isNaclOut(r.nacl) ? '#e11d48' : '#059669'};">${formatVal(r.nacl)}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 600; color: ${isBdOut(r.bd) ? '#e11d48' : '#334155'};">${formatVal(r.bd)}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 600; color: ${isTurbOut(r.turbidity) ? '#e11d48' : '#334155'};">${formatVal(r.turbidity)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; font-weight: 700;">
              <td colspan="2" style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; color: #0f172a;">AVERAGE NaCl %:</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #059669; font-family: monospace; font-size: 12px;">${avgNaCl !== '—' ? `${avgNaCl}%` : '—'}</td>
              <td colspan="2" style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #64748b; font-style: italic;">(${rows.length} Total Time Slots)</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>Soda Ash Plant</strong> | Section: <strong>LSA at 500#</strong> | Frequency: <strong>Once in 2 Hrs</strong>
        </div>
      </div>`;
  } else if (isSAE501T501Analysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const readings = Array.isArray(rawData.readings)
      ? rawData.readings
      : Array.isArray(rawData.data?.readings)
      ? rawData.data.readings
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const calcAvg = (field) => {
      const vals = readings
        .map((r) => parseFloat(r[field]))
        .filter((n) => !isNaN(n));
      return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—';
    };

    const eFnh3Avg = calcAvg('e501_fnh3');
    const eNa2co3Avg = calcAvg('e501_na2co3');
    const tFnh3Avg = calcAvg('t501_fnh3');
    const tNa2co3Avg = calcAvg('t501_na2co3');

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant Soda Ash Production — <strong>E 501 / T 501 Analysis Readings</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th rowspan="2" style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">#</th>
              <th rowspan="2" style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 90px;">Shift</th>
              <th colspan="2" style="padding: 4px 8px; text-align: center; border: 1px solid #cbd5e1; background-color: #312e81;">E 501 (g/L)</th>
              <th colspan="2" style="padding: 4px 8px; text-align: center; border: 1px solid #cbd5e1; background-color: #312e81;">T 501 (g/L)</th>
            </tr>
            <tr style="background-color: #1e1b4b; color: #ffffff; font-size: 10.5px;">
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ [10–40]</th>
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1;">Na₂CO₃ [2–10]</th>
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1;">FNH₃ [1–5]</th>
              <th style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1;">Na₂CO₃ [20–60]</th>
            </tr>
          </thead>
          <tbody>
            ${readings.map((r, i) => {
              const rowBg = i % 2 === 1 ? 'background-color: #f8fafc;' : 'background-color: #ffffff;';
              const isEFnh3Out = (val) => { const n = parseFloat(val); return !isNaN(n) && (n < 10 || n > 40); };
              const isENa2co3Out = (val) => { const n = parseFloat(val); return !isNaN(n) && (n < 2 || n > 10); };
              const isTFnh3Out = (val) => { const n = parseFloat(val); return !isNaN(n) && (n < 1 || n > 5); };
              const isTNa2co3Out = (val) => { const n = parseFloat(val); return !isNaN(n) && (n < 20 || n > 60); };

              return `
                <tr style="${rowBg}">
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #64748b;">${i + 1}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a;">${r.shift ? `Shift ${r.shift}` : `Row #${i + 1}`}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isEFnh3Out(r.e501_fnh3) ? '#e11d48' : '#4f46e5'};">${formatVal(r.e501_fnh3)}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isENa2co3Out(r.e501_na2co3) ? '#e11d48' : '#4f46e5'};">${formatVal(r.e501_na2co3)}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isTFnh3Out(r.t501_fnh3) ? '#e11d48' : '#4f46e5'};">${formatVal(r.t501_fnh3)}</td>
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isTNa2co3Out(r.t501_na2co3) ? '#e11d48' : '#4f46e5'};">${formatVal(r.t501_na2co3)}</td>
                </tr>
              `;
            }).join('')}
            <tr style="background-color: #f1f5f9; font-weight: 700;">
              <td colspan="2" style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; color: #0f172a;">AVERAGE (g/L):</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #4f46e5; font-family: monospace;">${eFnh3Avg !== '—' ? `${eFnh3Avg}` : '—'}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #4f46e5; font-family: monospace;">${eNa2co3Avg !== '—' ? `${eNa2co3Avg}` : '—'}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #4f46e5; font-family: monospace;">${tFnh3Avg !== '—' ? `${tFnh3Avg}` : '—'}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center; color: #4f46e5; font-family: monospace;">${tNa2co3Avg !== '—' ? `${tNa2co3Avg}` : '—'}</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Section: <strong>Soda Ash Production</strong> | Tanks: <strong>E 501 &amp; T 501</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>`;
  } else if (isSALSAShiftAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftsObj = rawData.shifts || rawData.data?.shifts || rawData.rows || {};
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');

    const sList = [
      { key: 'iShift', label: 'I SHIFT', desc: '06:00–14:00', isComp: false },
      { key: 'iiShift', label: 'II SHIFT', desc: '14:00–22:00', isComp: false },
      { key: 'iiiShift', label: 'III SHIFT', desc: '22:00–06:00', isComp: false },
      { key: 'composite', label: 'COMPOSITE', desc: '24-Hour Composite', isComp: true },
    ];

    dataHtml = `
      <div class="field-group">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>SA Plant — <strong>LSA Shift Analysis Readings</strong></span>
          ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px;">
          <thead>
            <tr style="background-color: #0f2e5a; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Shift</th>
              <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">Na₂CO₃ %<br/><span style="font-size: 9.5px; opacity: 0.85;">[98.5–99.5]</span></th>
              <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">NaCl %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.5–1.0]</span></th>
              <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">Fe %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.006–0.008]</span></th>
              <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">Na₂SO₄ %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.079–0.081]</span></th>
              <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">VM %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.5–2.1]</span></th>
              <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">IR %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.14–0.16]</span></th>
              <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">BD (g/L)<br/><span style="font-size: 9.5px; opacity: 0.85;">[500–750]</span></th>
              <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">Turbidity<br/><span style="font-size: 9.5px; opacity: 0.85;">[75–85 NTU]</span></th>
            </tr>
          </thead>
          <tbody>
            ${sList.map((s) => {
              const r = shiftsObj[s.key] || {};
              const isComp = s.isComp;
              const rowBg = isComp ? 'background-color: #fef3c7;' : 'background-color: #ffffff;';

              const checkOut = (val, min, max) => {
                const n = parseFloat(val);
                return !isNaN(n) && (n < min || n > max);
              };

              return `
                <tr style="${rowBg}">
                  <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: ${isComp ? '#78350f' : '#0f172a'}; font-family: monospace;">
                    ${s.label} <span style="font-size: 9.5px; font-weight: normal; color: #64748b;">(${s.desc})</span>
                  </td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.na2co3, 98.5, 99.5) ? '#e11d48' : '#0f172a'};">${formatVal(r.na2co3)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.nacl, 0.5, 1.0) ? '#e11d48' : '#0f172a'};">${formatVal(r.nacl)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.fe, 0.006, 0.008) ? '#e11d48' : '#0f172a'};">${formatVal(r.fe)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.na2so4, 0.079, 0.081) ? '#e11d48' : '#0f172a'};">${formatVal(r.na2so4)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.vm, 0.5, 2.1) ? '#e11d48' : '#0f172a'};">${formatVal(r.vm)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.ir, 0.14, 0.16) ? '#e11d48' : '#0f172a'};">${formatVal(r.ir)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.bd, 500, 750) ? '#e11d48' : '#0f172a'};">${formatVal(r.bd)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.turbidity, 75, 85) ? '#e11d48' : '#0f172a'};">${formatVal(r.turbidity)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Section: <strong>LSA</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>`;
  } else if (isSALSABaggingAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const shiftAnalysis = rawData.shiftAnalysis || rawData.shifts || {};
    const hourlyReadings = Array.isArray(rawData.hourlyReadings) ? rawData.hourlyReadings : [];
    const saveType = rawData.saveType || (shift ? 'shift' : 'all');
    const targetShift = rawData.targetShift || (shift || 'all');

    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const checkOut = (val, min, max) => {
      const n = parseFloat(val);
      return !isNaN(n) && (n < min || n > max);
    };

    let sectionsHtml = [];

    // Section 1: Shift Analysis
    if (saveType !== 'hourly' || Object.keys(shiftAnalysis).length > 0) {
      const sList = [
        { key: 'shift1', label: 'SHIFT 1', desc: '06:00–14:00' },
        { key: 'shift2', label: 'SHIFT 2', desc: '14:00–22:00' },
        { key: 'shift3', label: 'SHIFT 3', desc: '22:00–06:00' },
      ];

      const activeShifts = targetShift !== 'all' && targetShift !== 'All Shifts'
        ? sList.filter((s) => s.key === targetShift || s.label.toLowerCase().includes(String(targetShift).toLowerCase()))
        : sList;

      const displayShifts = activeShifts.length > 0 ? activeShifts : sList;

      sectionsHtml.push(`
        <div class="field-group" style="margin-bottom: 16px;">
          <div class="field-label" style="display: flex; justify-content: space-between; align-items: center; background: #0f2e5a; color: #ffffff; padding: 7px 12px; border-radius: 6px 6px 0 0;">
            <span style="font-weight: 700; font-size: 12px; letter-spacing: 0.5px;">SA Plant — LSA BAGGING SHIFT ANALYSIS (ONCE IN A SHIFT)</span>
            ${saveEventId ? `<span style="font-family: monospace; font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px;">ID: ${saveEventId.slice(-8)}</span>` : ''}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background-color: #1e3a8a; color: #ffffff;">
                <th style="padding: 6px 8px; text-align: left; border: 1px solid #cbd5e1;">Shift</th>
                <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">Na₂CO₃ %<br/><span style="font-size: 9.5px; opacity: 0.85;">[98.5–99.5]</span></th>
                <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">NaCl %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.5–1.0]</span></th>
                <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">Fe₂O₃ %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.006–0.008]</span></th>
                <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">Na₂SO₄ %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.079–0.081]</span></th>
                <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">VM %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.5–2.1]</span></th>
                <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">IR %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.14–0.16]</span></th>
                <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">BD (g/L)<br/><span style="font-size: 9.5px; opacity: 0.85;">[500–750]</span></th>
                <th style="padding: 6px 6px; text-align: center; border: 1px solid #cbd5e1;">Turbidity<br/><span style="font-size: 9.5px; opacity: 0.85;">[75–85 NTU]</span></th>
              </tr>
            </thead>
            <tbody>
              ${displayShifts.map((s) => {
                const r = shiftAnalysis[s.key] || {};
                return `
                  <tr>
                    <td style="padding: 5px 8px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-family: monospace;">
                      ${s.label} <span style="font-size: 9.5px; font-weight: normal; color: #64748b;">(${s.desc})</span>
                    </td>
                    <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.na2co3, 98.5, 99.5) ? '#e11d48' : '#0f172a'};">${formatVal(r.na2co3)}</td>
                    <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.nacl, 0.5, 1.0) ? '#e11d48' : '#0f172a'};">${formatVal(r.nacl)}</td>
                    <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.fe, 0.006, 0.008) ? '#e11d48' : '#0f172a'};">${formatVal(r.fe)}</td>
                    <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.na2so4, 0.079, 0.081) ? '#e11d48' : '#0f172a'};">${formatVal(r.na2so4)}</td>
                    <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.vm, 0.5, 2.1) ? '#e11d48' : '#0f172a'};">${formatVal(r.vm)}</td>
                    <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.ir, 0.14, 0.16) ? '#e11d48' : '#0f172a'};">${formatVal(r.ir)}</td>
                    <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.bd, 500, 750) ? '#e11d48' : '#0f172a'};">${formatVal(r.bd)}</td>
                    <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${checkOut(r.turbidity, 75, 85) ? '#e11d48' : '#0f172a'};">${formatVal(r.turbidity)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
            Plant: <strong>SA Plant</strong> | Section: <strong>LSA Bagging</strong> | Frequency: <strong>Once in a Shift</strong>
          </div>
        </div>
      `);
    }

    // Section 2: Hourly Routine Monitoring
    if (saveType !== 'shift' && hourlyReadings.length > 0) {
      const recordedHours = hourlyReadings.filter((h) => (h.nacl !== '' && h.nacl !== null && h.nacl !== undefined) || (h.bd !== '' && h.bd !== null && h.bd !== undefined));

      sectionsHtml.push(`
        <div class="field-group" style="margin-bottom: 16px;">
          <div class="field-label" style="display: flex; justify-content: space-between; align-items: center; background: #064e3b; color: #ffffff; padding: 7px 12px; border-radius: 6px 6px 0 0;">
            <span style="font-weight: 700; font-size: 12px; letter-spacing: 0.5px;">SA Plant — LSA BAGGING HOURLY ROUTINE MONITORING (1 HR ONCE)</span>
            <span style="font-size: 11px; opacity: 0.9;">${recordedHours.length} Readings Recorded</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background-color: #047857; color: #ffffff;">
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">#</th>
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Sampling Time</th>
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Shift</th>
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">NaCl %<br/><span style="font-size: 9.5px; opacity: 0.85;">[0.5–1.0]</span></th>
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">BD (g/L)<br/><span style="font-size: 9.5px; opacity: 0.85;">[500–750]</span></th>
                <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${(recordedHours.length > 0 ? recordedHours : hourlyReadings.slice(0, 10)).map((h, idx) => {
                const isNaclOut = checkOut(h.nacl, 0.5, 1.0);
                const isBdOut = checkOut(h.bd, 500, 750);
                const isAnyOut = isNaclOut || isBdOut;
                const hasVal = (h.nacl !== '' && h.nacl !== null && h.nacl !== undefined) || (h.bd !== '' && h.bd !== null && h.bd !== undefined);

                return `
                  <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; color: #64748b;">${idx + 1}</td>
                    <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a;">${h.time}</td>
                    <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; font-weight: 600; color: #334155;">${h.shift}</td>
                    <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isNaclOut ? '#e11d48' : '#0f172a'};">${formatVal(h.nacl)}</td>
                    <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isBdOut ? '#e11d48' : '#0f172a'};">${formatVal(h.bd)}</td>
                    <td style="padding: 4px 6px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; font-weight: 700; color: ${!hasVal ? '#94a3b8' : (isAnyOut ? '#e11d48' : '#059669')};">
                      ${!hasVal ? 'Pending' : (isAnyOut ? 'Out of Limit' : 'Normal')}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
            Plant: <strong>SA Plant</strong> | Section: <strong>LSA Bagging</strong> | Frequency: <strong>1 Hr Once</strong>
          </div>
        </div>
      `);
    }

    dataHtml = sectionsHtml.join('');
  } else if (isSALSABaggingSieveAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const rows = Array.isArray(rawData.rows)
      ? rawData.rows
      : Array.isArray(rawData.data?.rows)
      ? rawData.data.rows
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const checkOut = (val, min, max) => {
      const n = parseFloat(val);
      return !isNaN(n) && (n < min || n > max);
    };

    const recordedRows = rows.filter((r) =>
      ['bss10', 'bss30', 'm30', 'bss60', 'p10', 'p30', 'p60', 'm60'].some((k) => r[k] !== '' && r[k] !== null && r[k] !== undefined)
    );

    dataHtml = `
      <div class="field-group" style="margin-bottom: 16px;">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center; background: #0f2e5a; color: #ffffff; padding: 7px 12px; border-radius: 6px 6px 0 0;">
          <span style="font-weight: 700; font-size: 12px; letter-spacing: 0.5px;">SA Plant — LSA BAGGING SIEVE ANALYSIS READINGS</span>
          <span style="font-size: 11px; opacity: 0.9;">${recordedRows.length} Readings Recorded</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #1e3a8a; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">#</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 85px;">Time</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">BSS 10 (%)</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">BSS 30 (%)<br/><span style="font-size: 9.5px; opacity: 0.85;">[1.5–2.0]</span></th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">-30 (%)</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">BSS 60 (%)<br/><span style="font-size: 9.5px; opacity: 0.85;">[5.5–6.0]</span></th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 90px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${(recordedRows.length > 0 ? recordedRows : rows.slice(0, 10)).map((r, idx) => {
              const bss10 = r.bss10 !== undefined && r.bss10 !== '' ? r.bss10 : r.p10;
              const bss30 = r.bss30 !== undefined && r.bss30 !== '' ? r.bss30 : r.p30;
              const m30 = r.m30 !== undefined && r.m30 !== '' ? r.m30 : r.p60;
              const bss60 = r.bss60 !== undefined && r.bss60 !== '' ? r.bss60 : r.m60;

              const isBss30Out = checkOut(bss30, 1.5, 2.0);
              const isBss60Out = checkOut(bss60, 5.5, 6.0);
              const isAnyOut = isBss30Out || isBss60Out;
              const hasVal = ['bss10', 'bss30', 'm30', 'bss60', 'p10', 'p30', 'p60', 'm60'].some((k) => r[k] !== '' && r[k] !== null && r[k] !== undefined);

              return `
                <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; color: #64748b;">${idx + 1}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a;">${r.time || '—'}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a;">${formatVal(bss10)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isBss30Out ? '#e11d48' : '#059669'};">${formatVal(bss30)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a;">${formatVal(m30)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isBss60Out ? '#e11d48' : '#059669'};">${formatVal(bss60)}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; font-weight: 700; color: ${!hasVal ? '#94a3b8' : (isAnyOut ? '#e11d48' : '#059669')};">
                    ${!hasVal ? 'Pending' : (isAnyOut ? 'Out of Limit' : 'Normal')}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Section: <strong>LSA Bagging Sieve Analysis</strong> | Frequency: <strong>1 Hour Once</strong>
        </div>
      </div>
    `;
  } else if (isSAGasConcAnalysis) {
    const rawData = savedRecord?.data || savedRecord || {};
    const rows = Array.isArray(rawData.rows)
      ? rawData.rows
      : Array.isArray(rawData.data?.rows)
      ? rawData.data.rows
      : [];
    const formatVal = (v) => (v !== null && v !== undefined && v !== '' ? String(v) : '—');
    const checkOut = (val, min, max) => {
      const n = parseFloat(val);
      return !isNaN(n) && (n < min || n > max);
    };

    dataHtml = `
      <div class="field-group" style="margin-bottom: 16px;">
        <div class="field-label" style="display: flex; justify-content: space-between; align-items: center; background: #0f2e5a; color: #ffffff; padding: 7px 12px; border-radius: 6px 6px 0 0;">
          <span style="font-weight: 700; font-size: 12px; letter-spacing: 0.5px;">SA Plant — GAS CONC. ANALYSIS OBSERVATIONS</span>
          <span style="font-size: 11px; opacity: 0.9;">${rows.length} Observations Recorded</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #1e3a8a; color: #ffffff;">
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 40px;">#</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 95px;">Date</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 75px;">Time</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 85px;">SEAL</th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Recovery CO₂ (%)<br/><span style="font-size: 9.5px; opacity: 0.85;">[75%–85%]</span></th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Cleaning Gas (%)<br/><span style="font-size: 9.5px; opacity: 0.85;">[9%–11%]</span></th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1;">Bottom Gas (%)<br/><span style="font-size: 9.5px; opacity: 0.85;">[80%–90%]</span></th>
              <th style="padding: 6px 8px; text-align: center; border: 1px solid #cbd5e1; width: 90px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, idx) => {
              const isRecOut = checkOut(r.recoveryCo2Con, 75, 85);
              const isCleanOut = checkOut(r.cleaningGas, 9, 11);
              const isBotOut = checkOut(r.bottomGas, 80, 90);
              const isAnyOut = isRecOut || isCleanOut || isBotOut;
              const hasVal = (r.recoveryCo2Con !== '' && r.recoveryCo2Con !== null && r.recoveryCo2Con !== undefined) ||
                             (r.cleaningGas !== '' && r.cleaningGas !== null && r.cleaningGas !== undefined) ||
                             (r.bottomGas !== '' && r.bottomGas !== null && r.bottomGas !== undefined);

              return `
                <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; color: #64748b;">${idx + 1}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; color: #334155;">${r.displayDate || r.date || '—'}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: #0f172a;">${r.time || '—'}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: ${r.seal === 'OK' ? '#059669' : '#e11d48'};">${r.seal || 'NOT OK'}</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isRecOut ? '#e11d48' : '#059669'};">${formatVal(r.recoveryCo2Con)}%</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isCleanOut ? '#e11d48' : '#059669'};">${formatVal(r.cleaningGas)}%</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace; font-weight: 700; color: ${isBotOut ? '#e11d48' : '#059669'};">${formatVal(r.bottomGas)}%</td>
                  <td style="padding: 5px 6px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px; font-weight: 700; color: ${!hasVal ? '#94a3b8' : (isAnyOut ? '#e11d48' : '#059669')};">
                    ${!hasVal ? 'Pending' : (isAnyOut ? 'Out of Limit' : 'Normal')}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
          Plant: <strong>SA Plant</strong> | Unit: <strong>Gas Conc.</strong> | Frequency: <strong>Once in a Shift</strong>
        </div>
      </div>
    `;
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
    const mailOptions = {
      from: fromAddress,
      to: assignedUser.email.trim(),
      subject,
      text: textBody,
      html: htmlBody,
      headers: {
        'X-Save-Event-ID': saveEventId || String(Date.now()),
        'X-Entity-Ref-ID': recordId,
      },
      attachments: [
        {
          filename: excelFileName,
          content: Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer, 'base64'),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);

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
  saveEventId = '',
  changedSlotKeys = [],
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
      const plantCodeVariations = [
        plantCode,
        plantCode + ' Plant',
        plantCode + ' PLANT',
        ...(plantCode === 'OFFSITE' || plantCode === 'OFFSET' ? ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant'] : [])
      ];
      const lookupQuery = {
        plantCode: { $in: plantCodeVariations },
        analysisType: resolvedAnalysisType,
        date: targetDate,
      };
      if (targetUnit) {
        lookupQuery.unit = targetUnit;
      }
      const existingRecord = await PlantAnalysisRecord.findOne(lookupQuery).sort({ createdAt: -1 });

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
  const cleanShift = (targetShift || '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
  const eventToken = saveEventId ? `_${saveEventId.slice(-6)}` : '';
  const excelFileName = cleanShift && cleanShift !== 'All_Shifts'
    ? `${cleanCode}_Plant_${cleanType}_${cleanShift}_${filenameDate}${eventToken}.xlsx`
    : `${cleanCode}_Plant_${cleanType}_${filenameDate}${eventToken}.xlsx`;

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
    } else if (
      analysisType === 'Raw Salt Analysis' ||
      cleanType.toLowerCase().includes('raw_salt') ||
      cleanType.toLowerCase().includes('rawsalt')
    ) {
      const { generateRawSaltAnalysisExcel } = require('./excelService');
      excelResult = await generateRawSaltAnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'Brine Analysis' ||
      cleanType.toLowerCase().includes('brine')
    ) {
      const { generateBrineAnalysisExcel } = require('./excelService');
      excelResult = await generateBrineAnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'TK 401 Analysis' ||
      cleanType.toLowerCase().includes('tk_401') ||
      cleanType.toLowerCase().includes('tk401')
    ) {
      const { generateSATK401AnalysisExcel } = require('./excelService');
      excelResult = await generateSATK401AnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'TK 405 Analysis' ||
      cleanType.toLowerCase().includes('tk_405') ||
      cleanType.toLowerCase().includes('tk405')
    ) {
      const { generateSATK405AnalysisExcel } = require('./excelService');
      excelResult = await generateSATK405AnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'TK 414 TSC TANK Analysis' ||
      analysisType === 'TK 414 TSC Tank Analysis' ||
      analysisType === 'TK 414 Analysis' ||
      cleanType.toLowerCase().includes('tk_414') ||
      cleanType.toLowerCase().includes('tk414')
    ) {
      const { generateSATK414AnalysisExcel } = require('./excelService');
      excelResult = await generateSATK414AnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'P413 WSC TANK Analysis' ||
      analysisType === 'P413 WSC Tank Analysis' ||
      analysisType === 'P413 Analysis' ||
      cleanType.toLowerCase().includes('p_413') ||
      cleanType.toLowerCase().includes('p413')
    ) {
      const { generateSAP413AnalysisExcel } = require('./excelService');
      excelResult = await generateSAP413AnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'TK 419 SC TANK Analysis' ||
      analysisType === 'TK 419 SC Tank Analysis' ||
      analysisType === 'TK 419 Analysis' ||
      cleanType.toLowerCase().includes('tk_419') ||
      cleanType.toLowerCase().includes('tk419')
    ) {
      const { generateSATK419AnalysisExcel } = require('./excelService');
      excelResult = await generateSATK419AnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'T 401 Analysis' ||
      analysisType === 'T401 Analysis' ||
      (cleanType.toLowerCase().includes('t_401') && !cleanType.toLowerCase().includes('tk_401')) ||
      (cleanType.toLowerCase().includes('t401') && !cleanType.toLowerCase().includes('tk401'))
    ) {
      const { generateSAT401AnalysisExcel } = require('./excelService');
      excelResult = await generateSAT401AnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'Bi Carbonate NaCl/Na2CO3 Analysis' ||
      analysisType === 'Bi Carbonate NaCl/Na₂CO₃ Analysis' ||
      analysisType === 'Bi Carbonate Analysis' ||
      analysisType === 'Bicarbonate Analysis' ||
      (cleanType.toLowerCase().includes('bicarbonate') && !cleanType.toLowerCase().includes('moisture')) ||
      (cleanType.toLowerCase().includes('bi_carbonate') && !cleanType.toLowerCase().includes('moisture'))
    ) {
      const { generateSABicarbonateAnalysisExcel } = require('./excelService');
      excelResult = await generateSABicarbonateAnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'Bicarbonate Moisture Analysis' ||
      analysisType === 'Bi Carbonate Moisture Analysis' ||
      analysisType === 'Bicarbonate Moisture' ||
      (cleanType.toLowerCase().includes('bicarbonate') && cleanType.toLowerCase().includes('moisture')) ||
      (cleanType.toLowerCase().includes('bi_carbonate') && cleanType.toLowerCase().includes('moisture'))
    ) {
      const { generateSABicarbonateMoistureExcel } = require('./excelService');
      excelResult = await generateSABicarbonateMoistureExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'LSA AT 500# Analysis' ||
      analysisType === 'LSA AT 500#' ||
      analysisType === 'LSA 500# Analysis' ||
      analysisType === 'LSA 500#' ||
      (cleanType.toLowerCase().includes('lsa') && cleanType.toLowerCase().includes('500'))
    ) {
      const { generateSALSA500AnalysisExcel } = require('./excelService');
      excelResult = await generateSALSA500AnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'E 501 / T 501 Analysis' ||
      analysisType === 'E 501 / T 501' ||
      analysisType === 'E501 / T501 Analysis' ||
      analysisType === 'E501 / T501' ||
      analysisType === 'E 501 Analysis' ||
      analysisType === 'T 501 Analysis' ||
      (cleanType.toLowerCase().includes('e501') || cleanType.toLowerCase().includes('e_501')) ||
      (cleanType.toLowerCase().includes('t501') || cleanType.toLowerCase().includes('t_501'))
    ) {
      const { generateSAE501T501AnalysisExcel } = require('./excelService');
      excelResult = await generateSAE501T501AnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'LSA Shift Analysis' ||
      analysisType === 'LSA Shift' ||
      (cleanType.toLowerCase().includes('lsa') && cleanType.toLowerCase().includes('shift') && !cleanType.toLowerCase().includes('bagging'))
    ) {
      const { generateSALSAAnalysisExcel } = require('./excelService');
      excelResult = await generateSALSAAnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'LSA Bagging Analysis' ||
      analysisType === 'LSA Bagging Shift Analysis' ||
      analysisType === 'LSA Bagging Hourly Monitoring' ||
      (cleanType.toLowerCase().includes('lsa') && cleanType.toLowerCase().includes('bagging') && !cleanType.toLowerCase().includes('sieve'))
    ) {
      const { generateSALSABaggingAnalysisExcel } = require('./excelService');
      excelResult = await generateSALSABaggingAnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'LSA Bagging Sieve Analysis' ||
      analysisType === 'LSA Bagging Sieve' ||
      (cleanType.toLowerCase().includes('lsa') && cleanType.toLowerCase().includes('bagging') && cleanType.toLowerCase().includes('sieve')) ||
      cleanType.toLowerCase().includes('lsa_bagging_sieve')
    ) {
      const { generateSALSABaggingSieveAnalysisExcel } = require('./excelService');
      excelResult = await generateSALSABaggingSieveAnalysisExcel({
        ...(savedRecord.toObject ? savedRecord.toObject() : savedRecord),
        plant: plantName,
        date: savedRecord.date,
        shift: targetShift,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
      });
    } else if (
      analysisType === 'Gas Conc. Analysis' ||
      analysisType === 'Gas Conc Analysis' ||
      cleanType.toLowerCase().includes('gas_conc') ||
      cleanType.toLowerCase().includes('gasconc')
    ) {
      const { generateGasConcExcel } = require('./excelService');
      const recordData = savedRecord.toObject ? savedRecord.toObject() : savedRecord;
      excelResult = await generateGasConcExcel({
        ...recordData,
        plant: plantName,
        date: savedRecord.date,
        submittedBy,
        savedDateFormatted: dateFormatted,
        savedTimeFormatted: timeFormatted,
        filename: excelFileName,
        rows: recordData.data?.rows || recordData.rows || [],
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
      saveEventId,
      changedSlotKeys,
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
      recipient: assignedUser.email,
      messageId: emailResult.messageId,
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
      recipient: assignedUser.email,
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
