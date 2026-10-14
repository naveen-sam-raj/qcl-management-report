const { createCO2WeeklyAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2WeeklyAnalysisRouter({
  analysisType: 'LEAN Weekly Analysis',
  unit: 'LEAN',
  tank: 'LEAN',
  parameters: ['cl', 'so4', 'fe', 'tss', 'na', 'k', 'no2', 'no3'],
  frequency: 'Once in a Week',
});
