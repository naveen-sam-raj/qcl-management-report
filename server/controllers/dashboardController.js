const { PlantAnalysisRecord, PureSaltAnalysis } = require('../models');
const { getAnalysisConfig } = require('../config/analysisLabels');

// 30-second In-Memory Cache
const liveDashboardCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

const EPSILON = 0.000001;

const PLANT_ALIASES = {
  ACL: ['ACL', 'ACL Plant', 'ACL PLANT'],
  SA: ['SA', 'SA Plant', 'SA PLANT', 'SODA ASH'],
  OFFSITE: ['OFFSITE', 'OFFSET', 'OFFSITE Plant', 'OFFSET Plant', 'OFFSITE PLANT'],
  CO2: ['CO2', 'CO2 Plant', 'CO2 PLANT'],
};

const ALL_PLANTS = ['ACL', 'SA', 'OFFSITE', 'CO2'];

/**
 * Returns today's date in IST (YYYY-MM-DD)
 */
function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Parses min-max range string (e.g. "2.99-3.19") into { min, max }
 */
function parseRange(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  const match = rangeStr.match(/^\s*(-?\d+(?:\.\d+)?)\s*[\u2013\-–]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const min = parseFloat(match[1]);
  const max = parseFloat(match[2]);
  if (isNaN(min) || isNaN(max)) return null;
  return { min, max };
}

/**
 * Checks compliance status of a measured value against range limit
 */
function evaluateStatus(val, limit) {
  if (val === null || val === undefined || val === '' || val === '*' || val === '—') {
    return 'NO_DATA';
  }
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (isNaN(num)) return 'NO_DATA';
  if (!limit) return 'NO_RANGE';
  if (num < limit.min - EPSILON || num > limit.max + EPSILON) {
    return 'OUT_OF_LIMIT';
  }
  return 'IN_LIMIT';
}

/**
 * Normalizes plantCode to canonical plant (ACL, SA, OFFSITE, CO2)
 */
function getCanonicalPlant(code) {
  const upper = String(code || '').trim().toUpperCase();
  if (upper.includes('ACL')) return 'ACL';
  if (upper.includes('SA') || upper === 'SODA ASH') return 'SA';
  if (upper.includes('OFF')) return 'OFFSITE';
  if (upper.includes('CO2') || upper.includes('C02')) return 'CO2';
  return null;
}

/**
 * Extracts structured rows/slots from record data
 */
function extractRowsFromData(data) {
  if (!data || typeof data !== 'object') return [];
  const rows = [];

  // 1. Array readings (Bottom Ash, Fly Ash, Vacuum Seal Water, Sewer Water, Cooling Water)
  if (Array.isArray(data.readings)) {
    data.readings.forEach((r, idx) => {
      if (r && typeof r === 'object') {
        const timeLabel = r.time || (r.shift ? `${r.shift}` : `R${idx + 1}`);
        rows.push({
          slotKey: r.time || `r_${idx}`,
          label: timeLabel,
          shift: r.shift || '',
          time: r.time || '',
          values: r,
        });
      }
    });
    return rows;
  }

  // 2. Standard shifts (shift1, shift2, shift3)
  const shiftKeys = ['shift1', 'shift2', 'shift3'];
  const shiftLabels = { shift1: 'I Shift', shift2: 'II Shift', shift3: 'III Shift' };
  const container = data.shifts || data.shiftRows || data.rows || data;

  let hasShift = false;
  for (const sk of shiftKeys) {
    if (container[sk] && typeof container[sk] === 'object') {
      hasShift = true;
      rows.push({
        slotKey: sk,
        label: shiftLabels[sk],
        shift: sk,
        time: '',
        values: container[sk],
      });
    }
  }
  if (hasShift) return rows;

  // 3. Hourly time slots (t07, t09, ..., t05)
  const slotTimeKeys = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];
  let hasSlot = false;
  for (const tk of slotTimeKeys) {
    if (container[tk] && typeof container[tk] === 'object') {
      hasSlot = true;
      const hh = tk.slice(1);
      rows.push({
        slotKey: tk,
        label: `${hh}:00`,
        shift: '',
        time: `${hh}:00`,
        values: container[tk],
      });
    }
  }
  if (hasSlot) return rows;

  // 4. Sub-containers (Brine: tk109/tk110, ACL Product: chemical/bss, Raw Salt: rawSalt/composition)
  const ignoredSubKeys = new Set(['editedFields', 'editAuditHistory', 'parameters', 'units', 'towers']);
  for (const [k, v] of Object.entries(container)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !ignoredSubKeys.has(k)) {
      rows.push({
        slotKey: k,
        label: k.toUpperCase(),
        shift: '',
        time: '',
        values: v,
      });
    }
  }

  // 5. Fallback flat parameters
  if (rows.length === 0 && container.parameters && typeof container.parameters === 'object') {
    rows.push({
      slotKey: 'parameters',
      label: 'Shift I',
      shift: 'shift1',
      time: '',
      values: container.parameters,
    });
  }

  return rows;
}

/**
 * Deep merges two documents cell by cell (newest document overrides older document)
 */
function mergeTwoDocs(olderDoc, newerDoc) {
  if (!olderDoc) return newerDoc;
  if (!newerDoc) return olderDoc;

  const mergedData = { ...olderDoc.data, ...newerDoc.data };

  // Deep merge sub-containers if present
  const containers = ['rows', 'shifts', 'shiftRows', 'timeRows', 'chemical', 'bss', 'parameters'];
  for (const c of containers) {
    if (olderDoc.data?.[c] || newerDoc.data?.[c]) {
      mergedData[c] = {
        ...(olderDoc.data?.[c] || {}),
        ...(newerDoc.data?.[c] || {}),
      };
    }
  }

  if (Array.isArray(newerDoc.data?.readings)) {
    mergedData.readings = newerDoc.data.readings;
  }

  return {
    ...newerDoc,
    data: mergedData,
  };
}

/**
 * Controller: GET /api/dashboard/live
 */
async function getLiveDashboardData(req, res) {
  try {
    const today = getTodayIST();
    const fromDate = String(req.query.from || today).trim();
    const toDate = String(req.query.to || today).trim();
    const isBypassCache = req.query.refresh === 'true';

    // 1. Validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return res.status(400).json({ success: false, message: 'Invalid "from" date. Expected YYYY-MM-DD.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return res.status(400).json({ success: false, message: 'Invalid "to" date. Expected YYYY-MM-DD.' });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ success: false, message: '"from" date must be earlier than or equal to "to" date.' });
    }

    const diffDays = Math.ceil((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 31) {
      return res.status(400).json({ success: false, message: 'Date range cannot exceed 31 days.' });
    }

    // 2. Role Scoping & Company Filter
    const userRole = (req.user?.role || '').toLowerCase();
    const userCompanyId = req.user?.company?._id || req.user?.company || null;
    const userPlantCode = (req.user?.plant?.code || req.user?.plant?.name || '').toUpperCase();

    // Cache key
    const cacheKey = `${userCompanyId || 'ALL'}:${userRole}:${userPlantCode}:${fromDate}:${toDate}`;
    if (!isBypassCache && liveDashboardCache.has(cacheKey)) {
      const cached = liveDashboardCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return res.status(200).json(cached.data);
      }
    }

    // Determine plants accessible to this user
    let userAllowedPlants = ALL_PLANTS;
    if (userRole === 'user') {
      const canonicalUserPlant = getCanonicalPlant(userPlantCode);
      userAllowedPlants = canonicalUserPlant ? [canonicalUserPlant] : [];
    }

    // 3. Database Query
    const plantAliasesToQuery = [];
    for (const p of userAllowedPlants) {
      plantAliasesToQuery.push(...(PLANT_ALIASES[p] || [p]));
    }

    const query = {
      plantCode: { $in: plantAliasesToQuery },
      date: { $gte: fromDate, $lte: toDate },
      submittedBy: { $nin: ['Test Runner', 'Verification Test Runner', 'Test Operator'] },
    };

    if (userRole !== 'super_admin' && userCompanyId) {
      query.$or = [{ company: userCompanyId }, { company: null }];
    }

    const rawDocs = await PlantAnalysisRecord.find(query)
      .select('plantCode plantName analysisType unit date shift data submittedBy createdAt updatedAt')
      .sort({ date: 1, createdAt: 1 })
      .lean();

    // Filter out any other test submitters
    const nonTestDocs = rawDocs.filter((d) => !/test runner|test operator/i.test(d.submittedBy || ''));

    // Legacy fallback for ACL PureSaltAnalysis
    if (userAllowedPlants.includes('ACL') && PureSaltAnalysis && typeof PureSaltAnalysis.find === 'function') {
      try {
        const psaQuery = {
          date: { $gte: fromDate, $lte: toDate },
          submittedBy: { $nin: ['Test Runner', 'Verification Test Runner', 'Test Operator'] },
        };
        if (userRole !== 'super_admin' && userCompanyId) {
          psaQuery.$or = [{ company: userCompanyId }, { company: null }];
        }
        const psaDocs = await PureSaltAnalysis.find(psaQuery).lean();
        if (Array.isArray(psaDocs)) {
          psaDocs.forEach((psDoc) => {
            if (psDoc && !nonTestDocs.some((d) => String(d._id) === String(psDoc._id))) {
              nonTestDocs.push({
                _id: psDoc._id,
                plantCode: 'ACL',
                plantName: 'ACL Plant',
                analysisType: 'Pure Salt Analysis',
                unit: '',
                date: psDoc.date,
                data: psDoc,
                submittedBy: psDoc.submittedBy || 'Plant Operator',
                createdAt: psDoc.createdAt,
                updatedAt: psDoc.updatedAt,
              });
            }
          });
        }
      } catch (psaErr) {
        console.warn('[Dashboard] PureSaltAnalysis fallback error:', psaErr.message);
      }
    }

    // 4. Merge duplicate records (same date, canonical plant, analysisType, unit)
    const groupedRecords = new Map();
    for (const doc of nonTestDocs) {
      const canonicalPlant = getCanonicalPlant(doc.plantCode);
      if (!canonicalPlant) continue;

      const groupKey = `${doc.date}::${canonicalPlant}::${doc.analysisType}::${doc.unit || ''}`;
      if (!groupedRecords.has(groupKey)) {
        groupedRecords.set(groupKey, doc);
      } else {
        const existing = groupedRecords.get(groupKey);
        groupedRecords.set(groupKey, mergeTwoDocs(existing, doc));
      }
    }

    const mergedDocs = Array.from(groupedRecords.values());

    // 5. Build Plant Analytics Payload
    const plantsPayload = {};

    for (const p of ALL_PLANTS) {
      const isAccessible = userAllowedPlants.includes(p);
      if (!isAccessible) {
        plantsPayload[p] = {
          plantCode: p,
          accessible: false,
          hasData: false,
          statusSummary: { inLimit: 0, outOfLimit: 0, noRange: 0, noData: 0 },
          analyses: {},
          availableAnalyses: [],
          defaultSelection: null,
        };
        continue;
      }

      const plantDocs = mergedDocs.filter((d) => getCanonicalPlant(d.plantCode) === p);
      const analysesMap = {};
      const statusCounts = { inLimit: 0, outOfLimit: 0, noRange: 0, noData: 0 };
      let firstDataAnalysis = null;
      let firstDataParam = null;

      // Group docs by analysisType
      const docsByAnalysis = new Map();
      plantDocs.forEach((doc) => {
        const at = doc.analysisType;
        if (!docsByAnalysis.has(at)) docsByAnalysis.set(at, []);
        docsByAnalysis.get(at).push(doc);
      });

      // Process each analysis
      for (const [analysisType, atDocs] of docsByAnalysis.entries()) {
        const sampleDoc = atDocs[0];
        const config = getAnalysisConfig(analysisType, sampleDoc?.unit);

        // Parameters list from config or discovered from data
        const paramConfigs = [];
        if (config && Array.isArray(config.columns) && config.columns.length > 0) {
          config.columns.forEach((col) => {
            paramConfigs.push({
              key: col.key,
              label: col.label || col.key.toUpperCase(),
              unit: col.unit || '',
              range: col.range || null,
              limit: parseRange(col.range),
            });
          });
        }

        // If no config, discover from rows
        if (paramConfigs.length === 0) {
          const discoveredKeys = new Set();
          atDocs.forEach((doc) => {
            const rows = extractRowsFromData(doc.data);
            rows.forEach((r) => {
              Object.keys(r.values || {}).forEach((k) => {
                if (!k.startsWith('_') && k !== 'id' && k !== 'time' && k !== 'unit' && k !== 'shift') {
                  discoveredKeys.add(k);
                }
              });
            });
          });
          discoveredKeys.forEach((k) => {
            paramConfigs.push({
              key: k,
              label: k.toUpperCase(),
              unit: '',
              range: null,
              limit: null,
            });
          });
        }

        if (paramConfigs.length === 0) continue;

        const atParamsMap = {};

        // For each parameter, build time-series points
        for (const pCfg of paramConfigs) {
          const points = [];

          atDocs.forEach((doc) => {
            const rows = extractRowsFromData(doc.data);
            const dShort = `${doc.date.slice(8, 10)}/${doc.date.slice(5, 7)}`;

            rows.forEach((r) => {
              const rawVal = r.values?.[pCfg.key];
              const status = evaluateStatus(rawVal, pCfg.limit);

              // Update overall status counters
              if (status === 'IN_LIMIT') statusCounts.inLimit++;
              else if (status === 'OUT_OF_LIMIT') statusCounts.outOfLimit++;
              else if (status === 'NO_RANGE') statusCounts.noRange++;
              else if (status === 'NO_DATA') statusCounts.noData++;

              const numVal = (status !== 'NO_DATA' && !isNaN(parseFloat(rawVal))) ? parseFloat(rawVal) : null;

              // Format X-axis tick label
              let tickLabel = r.label;
              if (diffDays > 1) {
                const shiftShort = r.label.replace(' Shift', '').replace('Reading ', 'R');
                tickLabel = `${dShort} ${shiftShort}`;
              }

              points.push({
                id: `${doc.date}_${r.slotKey}_${pCfg.key}`,
                date: doc.date,
                slot: r.label,
                label: tickLabel,
                time: r.time || '',
                value: numVal,
                displayValue: numVal !== null ? String(numVal) : '—',
                status,
              });

              // Track first analysis and parameter with real data
              if (numVal !== null && !firstDataAnalysis) {
                firstDataAnalysis = analysisType;
                firstDataParam = pCfg.key;
              }
            });
          });

          atParamsMap[pCfg.key] = {
            key: pCfg.key,
            label: pCfg.label,
            unit: pCfg.unit,
            range: pCfg.range,
            limit: pCfg.limit,
            hasData: points.some((pt) => pt.value !== null),
            points,
          };
        }

        analysesMap[analysisType] = {
          analysisType,
          title: config?.title || analysisType,
          parameters: atParamsMap,
        };
      }

      // Build available analyses dropdown options
      const availableAnalyses = Object.keys(analysesMap).map((atName) => ({
        analysisType: atName,
        title: analysesMap[atName].title,
        parameters: Object.values(analysesMap[atName].parameters).map((p) => ({
          key: p.key,
          label: p.label,
          hasData: p.hasData,
        })),
        hasData: Object.values(analysesMap[atName].parameters).some((p) => p.hasData),
      }));

      // Sort so analyses with data appear first
      availableAnalyses.sort((a, b) => (b.hasData ? 1 : 0) - (a.hasData ? 1 : 0));

      const hasPlantData = plantDocs.length > 0 && availableAnalyses.some((a) => a.hasData);
      const defaultSelection = firstDataAnalysis && firstDataParam
        ? { analysis: firstDataAnalysis, parameter: firstDataParam }
        : availableAnalyses.length > 0 && availableAnalyses[0].parameters.length > 0
        ? { analysis: availableAnalyses[0].analysisType, parameter: availableAnalyses[0].parameters[0].key }
        : null;

      plantsPayload[p] = {
        plantCode: p,
        accessible: true,
        hasData: hasPlantData,
        statusSummary: statusCounts,
        analyses: analysesMap,
        availableAnalyses,
        defaultSelection,
      };
    }

    const responseData = {
      success: true,
      from: fromDate,
      to: toDate,
      diffDays,
      asOfIST: new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date()) + ' IST',
      plants: plantsPayload,
    };

    // Store in 30-second cache
    liveDashboardCache.set(cacheKey, { timestamp: Date.now(), data: responseData });

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('[Dashboard Live API Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch live dashboard data: ' + error.message,
    });
  }
}

module.exports = {
  getLiveDashboardData,
  parseRange,
  evaluateStatus,
};
