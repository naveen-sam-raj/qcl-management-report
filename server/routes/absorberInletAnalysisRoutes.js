const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'Absorber Inlet Analysis',
  unit: 'Absorber inlet',
  tank: 'Absorber inlet',
  parameters: ['co2', 'o2', 'co', 'no', 'nox', 'no2'],
});
