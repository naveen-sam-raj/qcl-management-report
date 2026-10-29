const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'PCL/TCL Analysis',
  unit: 'PCL/TCL',
  tank: 'PCL/TCL',
  parameters: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  plantCode: 'ACL',
  plantCodes: ['ACL', 'ACL Plant', 'ACL PLANT'],
  plantName: 'ACL Plant',
  plantIdentifier: 'ACL',
  extraFields: { shiftRows: true },
});
