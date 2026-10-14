const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'P1256 Analysis',
  unit: 'P1256',
  tank: 'P1256',
  parameters: ['alk'],
});
