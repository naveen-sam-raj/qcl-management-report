const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'TK 209 Analysis',
  unit: 'TK 209',
  tank: 'TK 209',
  parameters: ['fnh3', 'cnh3', 'tcl', 'pcl'],
  plantCode: 'ACL',
  plantCodes: ['ACL', 'ACL Plant', 'ACL PLANT'],
  plantName: 'ACL Plant',
  plantIdentifier: 'ACL',
});
