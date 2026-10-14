const { createCO2WeeklyAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2WeeklyAnalysisRouter({
  analysisType: 'ABSORBER DRAIN LIQ Analysis',
  unit: 'ABSORBER DRAIN LIQ',
  tank: 'ABSORBER DRAIN LIQ',
  parameters: ['cl', 'so4', 'fe', 'tss'],
  frequency: 'Once in a Week',
});
