const { createCO2WeeklyAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2WeeklyAnalysisRouter({
  analysisType: 'SOX DRAIN LIQ Analysis',
  unit: 'SOX DRAIN LIQ',
  tank: 'SOX DRAIN LIQ',
  parameters: ['cl', 'so4', 'fe', 'tss'],
  frequency: 'Once in a Week',
});
