const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

module.exports = createCO2ShiftAnalysisRouter({
  analysisType: 'TK1251 Analysis',
  unit: 'TK1251',
  tank: 'TK1251',
  parameters: ['ph', 'alk'],
});
