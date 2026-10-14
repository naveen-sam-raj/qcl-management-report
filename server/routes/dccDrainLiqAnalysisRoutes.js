const { createCO2WeeklyAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2WeeklyAnalysisRouter({
  analysisType: 'DCC DRAIN LIQ Analysis',
  unit: 'DCC DRAIN LIQ',
  tank: 'DCC DRAIN LIQ',
  parameters: ['cl', 'so4', 'fe', 'tss'],
  frequency: 'Once in a Week',
});
