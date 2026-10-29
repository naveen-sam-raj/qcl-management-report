const { PureSaltSieveAnalysis } = require('../models');
const { generatePureSaltSieveAnalysisExcel } = require('../services/excelService');
const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

const router = createCO2ShiftAnalysisRouter({
  analysisType: 'Pure Salt Sieve Analysis',
  unit: '',
  tank: '',
  unitValue: '',
  parameters: ['p18', 'p44', 'p60', 'p100', 'm100'],
  plantCode: 'ACL',
  plantCodes: ['ACL', 'ACL Plant', 'ACL PLANT'],
  plantName: 'ACL Plant',
  plantIdentifier: 'ACL',
  onAfterSave: async ({ payload, mergedRows, updatedRecordData }) => {
    if (!PureSaltSieveAnalysis || typeof PureSaltSieveAnalysis.findOneAndUpdate !== 'function') return;
    await PureSaltSieveAnalysis.findOneAndUpdate(
      { date: payload.date },
      {
        date: payload.date,
        plant: 'ACL Plant',
        analysisType: payload.analysisType || 'Pure Salt Sieve Analysis',
        shift: updatedRecordData.shift || 'All Shifts (I, II, III)',
        rows: mergedRows,
        lockedShifts: updatedRecordData.lockedShifts,
        editedFields: updatedRecordData.editedFields,
        editAuditHistory: updatedRecordData.editAuditHistory,
        submittedBy: updatedRecordData.submittedBy,
        submittedById: updatedRecordData.submittedById,
        company: updatedRecordData.company || null,
        savedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  },
});

router.get('/download-excel/:id', async (req, res) => {
  try {
    let record = null;
    if (PureSaltSieveAnalysis && typeof PureSaltSieveAnalysis.findById === 'function') {
      record = await PureSaltSieveAnalysis.findById(req.params.id);
    }
    if (!record) {
      return res.status(404).json({ success: false, message: 'Sieve analysis record not found.' });
    }
    const excelResult = await generatePureSaltSieveAnalysisExcel(record);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${excelResult.filename}"`);
    return res.send(excelResult.buffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
