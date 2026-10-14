const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'Reflux Analysis',
  unit: 'Reflux',
  tank: 'Reflux',
  parameters: ['alk'],
});
