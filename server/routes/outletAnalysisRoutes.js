const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'Outlet Analysis',
  unit: 'Outlet',
  tank: 'Outlet',
  parameters: ['co2', 'co'],
});
