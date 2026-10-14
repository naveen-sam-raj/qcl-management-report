const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'Washwater Analysis',
  unit: 'Washwater',
  tank: 'Washwater',
  parameters: ['alk'],
});
