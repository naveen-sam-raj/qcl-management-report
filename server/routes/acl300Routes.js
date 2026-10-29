const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'ACL 300# Analysis',
  unit: 'ACL 300#',
  tank: 'ACL 300#',
  parameters: ['p18', 'p44', 'nacl'],
  plantCode: 'ACL',
  plantCodes: ['ACL', 'ACL Plant', 'ACL PLANT'],
  plantName: 'ACL Plant',
  plantIdentifier: 'ACL',
  shiftDisplayNames: { shift1: 'SHIFT 1', shift2: 'SHIFT 2', shift3: 'SHIFT 3' },
  dataKey: 'shifts',
});
