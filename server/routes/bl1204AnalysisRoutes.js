const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'BL1204/BL1203 Analysis',
  unit: 'BL1204/BL1203',
  tank: 'BL1204/BL1203',
  parameters: ['co2', 'o2', 'co'],
});
