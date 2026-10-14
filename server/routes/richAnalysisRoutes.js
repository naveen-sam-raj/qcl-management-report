const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'Rich Analysis',
  unit: 'Rich',
  tank: 'Rich',
  parameters: ['loading', 'density'],
});
