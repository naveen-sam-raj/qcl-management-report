const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'TK1252 Analysis',
  unit: 'TK1252',
  tank: 'TK1252',
  parameters: ['ph', 'alk'],
});
