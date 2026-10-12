const { PlantAnalysisRecord, PureSaltAnalysis, Plant, Company } = require('../models');
const { ANALYSIS_LIMITS_REGISTRY } = require('../services/analysisValidation');

/**
 * Standardize any date string (YYYY-MM-DD, DD-MM-YYYY, ISO) to 'YYYY-MM-DD'
 */
const normalizeToYYYYMMDD = (dateInput) => {
  if (!dateInput) return '';
  if (dateInput instanceof Date) {
    return dateInput.toISOString().split('T')[0];
  }
  const str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  if (/^\d{2}-\d{2}-\d{4}/.test(str)) {
    const [d, m, y] = str.split('-');
    return `${y}-${m}-${d}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m}-${d}`;
  }
  return str.slice(0, 10);
};

/**
 * Normalizes plant codes to canonical TFL codes: ACL, SA, OFFSET, CO2
 */
const canonicalPlantCode = (code) => {
  const upper = String(code || '').trim().toUpperCase();
  if (upper.includes('ACL')) return 'ACL';
  if (upper.includes('SA') || upper === 'SODA ASH') return 'SA';
  if (upper.includes('OFF') || upper.includes('UTIL')) return 'OFFSET';
  if (upper.includes('CO2') || upper.includes('C02')) return 'CO2';
  return upper;
};

/**
 * Normalizes plant name
 */
const canonicalPlantName = (code) => {
  const c = canonicalPlantCode(code);
  switch (c) {
    case 'ACL': return 'ACL Plant';
    case 'SA': return 'SA Plant';
    case 'OFFSET': return 'OFFSET Plant';
    case 'CO2': return 'CO2 Plant';
    default: return `${code} Plant`;
  }
};

/**
 * Helper to determine parameter compliance status from recorded row values
 */
const evaluateRecordStatus = (analysisType, rowsData) => {
  if (!rowsData || typeof rowsData !== 'object') {
    return { status: 'NORMAL', outOfLimitParams: [], testsLogged: [] };
  }

  const outOfLimitParams = [];
  const testsLogged = [];

  const extractValues = (obj, prefix = '') => {
    if (!obj || typeof obj !== 'object') return;
    Object.entries(obj).forEach(([key, val]) => {
      if (val === null || val === undefined || val === '') return;
      if (typeof val === 'object' && !Array.isArray(val)) {
        extractValues(val, `${prefix}${key}.`);
      } else {
        const num = Number(val);
        const paramName = key.toUpperCase();
        if (!isNaN(num)) {
          testsLogged.push(paramName);
          // Check known limits if available
          if (paramName === 'NACL' && (num < 91.90 || num > 92.10)) {
            outOfLimitParams.push(paramName);
          } else if (paramName === 'FNH3' && (num < 2.90 || num > 4.20)) {
            outOfLimitParams.push(paramName);
          } else if (paramName === 'TCL' && (num < 4.80 || num > 5.50)) {
            outOfLimitParams.push(paramName);
          }
        }
      }
    });
  };

  extractValues(rowsData);

  return {
    status: outOfLimitParams.length > 0 ? 'OUT OF LIMIT' : 'NORMAL',
    outOfLimitParams,
    testsLogged,
  };
};

/**
 * Common query builder for TFL real database records
 */
const fetchRealTFLRecords = async ({ fromDate, toDate, selectedPlants, userCompanyId }) => {
  const normFrom = normalizeToYYYYMMDD(fromDate) || '1970-01-01';
  const normTo = normalizeToYYYYMMDD(toDate) || '2099-12-31';

  const plantCodesUpper = (selectedPlants || ['ACL', 'SA', 'OFFSET', 'CO2'])
    .map((p) => canonicalPlantCode(p));

  const allRecords = [];

  // 1. Fetch from PlantAnalysisRecord
  try {
    const query = {};
    if (userCompanyId) {
      query.$or = [{ company: userCompanyId }, { company: null }];
    }

    const docs = await PlantAnalysisRecord.find(query).lean();
    if (Array.isArray(docs)) {
      docs.forEach((doc) => {
        const pCode = canonicalPlantCode(doc.plantCode || doc.plantName);
        if (!plantCodesUpper.includes(pCode)) return;

        const recDate = normalizeToYYYYMMDD(doc.date || doc.createdAt);
        if (recDate >= normFrom && recDate <= normTo) {
          const evalResult = evaluateRecordStatus(doc.analysisType, doc.data);
          allRecords.push({
            id: String(doc._id),
            date: recDate,
            plantCode: pCode,
            plantName: canonicalPlantName(pCode),
            analysisType: doc.analysisType || 'Plant Analysis',
            unit: doc.unit || '',
            shift: doc.shift || '',
            status: evalResult.status,
            outOfLimitParams: evalResult.outOfLimitParams,
            testsLogged: evalResult.testsLogged,
            data: doc.data,
            submittedBy: doc.submittedBy || 'Plant Operator',
            consultant: doc.consultant || doc.data?.consultant || doc.submittedBy || 'Plant Operator',
            medicine: doc.medicine || doc.data?.medicine || doc.product || doc.data?.product || (doc.analysisType ? doc.analysisType.replace(/ Analysis$/i, '').trim() : 'Plant Product'),
            sourceCollection: 'plantanalysisrecords',
          });
        }
      });
    }
  } catch (err) {
    console.error('[fetchRealTFLRecords] PlantAnalysisRecord error:', err.message);
  }

  // 2. Fetch from PureSaltAnalysis (strictly for ACL Plant)
  if (plantCodesUpper.includes('ACL')) {
    try {
      const query = {};
      if (userCompanyId) {
        query.$or = [{ company: userCompanyId }, { company: null }];
      }

      const psaDocs = await PureSaltAnalysis.find(query).lean();
      if (Array.isArray(psaDocs)) {
        psaDocs.forEach((doc) => {
          const recDate = normalizeToYYYYMMDD(doc.date || doc.createdAt);
          if (recDate >= normFrom && recDate <= normTo) {
            // Check if already captured to avoid duplication
            const alreadyExists = allRecords.some(
              (r) => r.id === String(doc._id) || (r.date === recDate && r.analysisType === 'Pure Salt Analysis')
            );
            if (!alreadyExists) {
              const evalResult = evaluateRecordStatus('Pure Salt Analysis', doc.rows);
              allRecords.push({
                id: String(doc._id),
                date: recDate,
                plantCode: 'ACL',
                plantName: 'ACL Plant',
                analysisType: 'Pure Salt Analysis',
                unit: 'Pure Salt Unit',
                shift: doc.shift || 'All Shifts',
                status: evalResult.status,
                outOfLimitParams: evalResult.outOfLimitParams,
                testsLogged: evalResult.testsLogged,
                data: doc.rows,
                submittedBy: doc.submittedBy || 'Plant Operator',
                consultant: doc.consultant || doc.submittedBy || 'Plant Operator',
                medicine: doc.medicine || 'Pure Salt',
                sourceCollection: 'puresaltanalyses',
              });
            }
          }
        });
      }
    } catch (psaErr) {
      console.error('[fetchRealTFLRecords] PureSaltAnalysis error:', psaErr.message);
    }
  }

  // Sort descending by date
  allRecords.sort((a, b) => (b.date > a.date ? 1 : -1));
  return allRecords;
};

/**
 * @desc    Get strictly real consolidated overall analytics for TFL plants from MongoDB
 * @route   GET /api/tfl/overall-analytics
 * @access  Private (TFL Admin / Super Admin)
 */
const getTFLOverallAnalytics = async (req, res) => {
  try {
    // Role & Company Isolation Check
    let userCompanyId = null;
    if (req.user.role === 'company_admin') {
      const userCompCode = (req.user.company?.code || '').toUpperCase();
      if (userCompCode && userCompCode !== 'TFL') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: TFL Overall Analytics is restricted to TFL administrators.',
        });
      }
      userCompanyId = req.user.company?._id || req.user.company;
    }

    const { from, to, plants } = req.query;
    const selectedPlants = plants
      ? plants.split(',').map((p) => p.trim()).filter(Boolean)
      : ['ACL', 'SA', 'OFFSET', 'CO2'];

    // Query REAL database records strictly
    const records = await fetchRealTFLRecords({
      fromDate: from,
      toDate: to,
      selectedPlants,
      userCompanyId,
    });

    const totalRecords = records.length;

    // RULE 3: Empty Result Behavior
    if (totalRecords === 0) {
      return res.status(200).json({
        success: true,
        hasData: false,
        totalRecords: 0,
        message: 'No data available for the selected date range.',
        summary: {
          totalPlants: selectedPlants.length,
          totalRecords: 0,
          normalRecords: 0,
          outOfLimitRecords: 0,
          overallCompliance: null, // N/A when 0 records
        },
        top5Consultants: [],
        top5Tests: [],
        top5Medicines: [],
        plantWiseAnalysisCount: [],
        top5QualityTests: [],
        top5Products: [],
        plantComplianceList: [],
      });
    }

    // Compute metrics ONLY from real records
    let normalRecords = 0;
    let outOfLimitRecords = 0;
    const plantCounts = { ACL: 0, SA: 0, OFFSET: 0, CO2: 0 };
    const plantNormals = { ACL: 0, SA: 0, OFFSET: 0, CO2: 0 };
    const plantOutOfLimits = { ACL: 0, SA: 0, OFFSET: 0, CO2: 0 };
    const consultantsMap = {};
    const qualityTestsMap = {};
    const medicinesMap = {};

    records.forEach((rec) => {
      const code = rec.plantCode;
      plantCounts[code] = (plantCounts[code] || 0) + 1;

      if (rec.status === 'NORMAL') {
        normalRecords += 1;
        plantNormals[code] = (plantNormals[code] || 0) + 1;
      } else {
        outOfLimitRecords += 1;
        plantOutOfLimits[code] = (plantOutOfLimits[code] || 0) + 1;
      }

      // 1. Consultant: derived from actual record submittedBy or consultant field
      const consultantName = (rec.consultant || rec.data?.consultant || rec.submittedBy || 'Plant Operator').trim();
      if (consultantName) {
        consultantsMap[consultantName] = (consultantsMap[consultantName] || 0) + 1;
      }

      // 2. Tests: actual parameters tested in database
      (rec.testsLogged || []).forEach((testKey) => {
        if (testKey) {
          qualityTestsMap[testKey] = (qualityTestsMap[testKey] || 0) + 1;
        }
      });

      // 3. Medicines / Products: actual recorded product/medicine
      const medName = (rec.medicine || rec.data?.medicine || rec.product || rec.data?.product || rec.analysisType.replace(/ Analysis$/i, '')).trim();
      if (medName) {
        medicinesMap[medName] = (medicinesMap[medName] || 0) + 1;
      }
    });

    const overallCompliance = Number(((normalRecords / totalRecords) * 100).toFixed(1));

    // Top 5 Consultants (Highest -> Lowest)
    const top5Consultants = Object.entries(consultantsMap)
      .map(([name, count]) => ({
        name,
        value: count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top 5 Tests (Highest -> Lowest)
    const top5Tests = Object.entries(qualityTestsMap)
      .map(([name, count]) => ({
        name,
        value: count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Top 5 Medicines (Highest -> Lowest)
    const top5Medicines = Object.entries(medicinesMap)
      .map(([name, count]) => ({
        name,
        value: count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Chart A: Plant-wise Analysis Count (only for selected plants with real data)
    const plantWiseAnalysisCount = selectedPlants
      .map((code) => {
        const canCode = canonicalPlantCode(code);
        return {
          name: canonicalPlantName(canCode),
          code: canCode,
          value: plantCounts[canCode] || 0,
        };
      })
      .filter((p) => p.value > 0);

    // Chart D & Breakdown Table: Plant-wise Compliance
    const plantComplianceList = selectedPlants
      .map((code) => {
        const canCode = canonicalPlantCode(code);
        const total = plantCounts[canCode] || 0;
        if (total === 0) return null;
        const norm = plantNormals[canCode] || 0;
        const ool = plantOutOfLimits[canCode] || 0;
        const comp = Number(((norm / total) * 100).toFixed(1));

        return {
          code: canCode,
          name: canonicalPlantName(canCode),
          totalSamples: total,
          normal: norm,
          outOfLimit: ool,
          compliance: comp,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      hasData: true,
      totalRecords,
      summary: {
        totalPlants: selectedPlants.length,
        totalRecords,
        normalRecords,
        outOfLimitRecords,
        overallCompliance,
      },
      top5Consultants,
      top5Tests,
      top5Medicines,
      plantWiseAnalysisCount,
      top5QualityTests: top5Tests,
      top5Products: top5Medicines,
      plantComplianceList,
    });
  } catch (error) {
    console.error('[getTFLOverallAnalytics] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve overall analytics: ' + error.message,
    });
  }
};

/**
 * @desc    Get strictly real detailed report rows for Excel export from MongoDB
 * @route   GET /api/tfl/overall-report
 * @access  Private (TFL Admin / Super Admin)
 */
const getTFLOverallReportData = async (req, res) => {
  try {
    // Role & Company Isolation Check
    let userCompanyId = null;
    if (req.user.role === 'company_admin') {
      const userCompCode = (req.user.company?.code || '').toUpperCase();
      if (userCompCode && userCompCode !== 'TFL') {
        return res.status(403).json({
          success: false,
          message: 'Access denied: TFL Overall Report is restricted to TFL administrators.',
        });
      }
      userCompanyId = req.user.company?._id || req.user.company;
    }

    const { from, to, plants } = req.query;
    const selectedPlants = plants
      ? plants.split(',').map((p) => p.trim()).filter(Boolean)
      : ['ACL', 'SA', 'OFFSET', 'CO2'];

    // Fetch REAL database records only
    const records = await fetchRealTFLRecords({
      fromDate: from,
      toDate: to,
      selectedPlants,
      userCompanyId,
    });

    const totalRecords = records.length;
    let normalRecords = 0;
    let outOfLimitRecords = 0;

    const plantsData = {
      acl: { records: [] },
      sa: { records: [] },
      offset: { records: [] },
      co2: { records: [] },
    };

    records.forEach((rec) => {
      if (rec.status === 'NORMAL') {
        normalRecords += 1;
      } else {
        outOfLimitRecords += 1;
      }

      const pKey = rec.plantCode.toLowerCase();
      if (plantsData[pKey]) {
        plantsData[pKey].records.push({
          date: rec.date,
          option: rec.analysisType,
          parameter: rec.testsLogged.length > 0 ? rec.testsLogged.join(', ') : 'Quality Parameters',
          value: 'Validated',
          limit: 'In-Spec Limits',
          status: rec.status,
          submittedBy: rec.submittedBy,
        });
      }
    });

    const overallCompliance = totalRecords > 0
      ? Number(((normalRecords / totalRecords) * 100).toFixed(1))
      : null;

    return res.status(200).json({
      success: true,
      hasData: totalRecords > 0,
      reportDate: new Date().toISOString().split('T')[0],
      totalRecords,
      summary: {
        totalPlants: selectedPlants.length,
        totalRecords,
        normalRecords,
        outOfLimitRecords,
        overallCompliance,
      },
      plantsData,
    });
  } catch (error) {
    console.error('[getTFLOverallReportData] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve overall report data: ' + error.message,
    });
  }
};

/**
 * @desc    Get strictly real individual plant analytics from MongoDB
 * @route   GET /api/tfl/plant-analytics/:plantId
 * @access  Private
 */
const getTFLPlantAnalytics = async (req, res) => {
  try {
    const { plantId } = req.params;
    const { from, to } = req.query;

    const canonicalCode = canonicalPlantCode(plantId);
    let userCompanyId = null;
    if (req.user.role === 'company_admin') {
      userCompanyId = req.user.company?._id || req.user.company;
    }

    const records = await fetchRealTFLRecords({
      fromDate: from,
      toDate: to,
      selectedPlants: [canonicalCode],
      userCompanyId,
    });

    const totalRecords = records.length;
    if (totalRecords === 0) {
      return res.status(200).json({
        success: true,
        hasData: false,
        totalRecords: 0,
        plantCode: canonicalCode,
        plantName: canonicalPlantName(canonicalCode),
        message: 'No data available for the selected date range.',
        top5Consultants: [],
        top5Tests: [],
        top5Medicines: [],
        charts: {
          consultants: [],
          tests: [],
          medicines: [],
          top5Consultants: [],
          top5Tests: [],
          top5Medicines: [],
          options: [],
          products: [],
        },
      });
    }

    const consultantsMap = {};
    const testsMap = {};
    const medicinesMap = {};

    records.forEach((rec) => {
      // Consultant
      const consultantName = (rec.consultant || rec.data?.consultant || rec.submittedBy || 'Plant Operator').trim();
      if (consultantName) {
        consultantsMap[consultantName] = (consultantsMap[consultantName] || 0) + 1;
      }
      // Tests
      (rec.testsLogged || []).forEach((t) => {
        if (t) {
          testsMap[t] = (testsMap[t] || 0) + 1;
        }
      });
      // Medicines / Products
      const medName = (rec.medicine || rec.data?.medicine || rec.product || rec.data?.product || rec.analysisType.replace(/ Analysis$/i, '')).trim();
      if (medName) {
        medicinesMap[medName] = (medicinesMap[medName] || 0) + 1;
      }
    });

    const top5Consultants = Object.entries(consultantsMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const top5Tests = Object.entries(testsMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const top5Medicines = Object.entries(medicinesMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return res.status(200).json({
      success: true,
      hasData: true,
      totalRecords,
      plantCode: canonicalCode,
      plantName: canonicalPlantName(canonicalCode),
      top5Consultants,
      top5Tests,
      top5Medicines,
      charts: {
        consultants: top5Consultants,
        tests: top5Tests,
        medicines: top5Medicines,
        top5Consultants,
        top5Tests,
        top5Medicines,
        options: top5Consultants,
        products: top5Medicines,
      },
    });
  } catch (error) {
    console.error('[getTFLPlantAnalytics] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve plant analytics: ' + error.message,
    });
  }
};

module.exports = {
  getTFLOverallAnalytics,
  getTFLOverallReportData,
  getTFLPlantAnalytics,
};
