const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

const PARAMETERS = ['fnh3', 'cnh3', 'tcl', 'pcl'];
const SA_SHIFT_DISPLAY_NAMES = { s1: 'I SHIFT', s2: 'II SHIFT', s3: 'III SHIFT' };

function createRouter({ getNow } = {}) {
  return createCO2ShiftAnalysisRouter({
    analysisType: 'TK 414 TSC TANK Analysis',
    analysisTypes: ['TK 414 TSC TANK Analysis', 'TK 414 TSC Tank Analysis', 'TK 414 Analysis'],
    unit: 'TK 414 TSC TANK',
    tank: 'TK 414 TSC TANK',
    parameters: PARAMETERS,
    getNow,
    plantCodes: ['SA', 'SA Plant', 'SA PLANT'],
    plantCode: 'SA',
    plantName: 'SA Plant',
    plantIdentifier: 'SA',
    unitKeys: ['s1', 's2', 's3'],
    shiftDisplayNames: SA_SHIFT_DISPLAY_NAMES,
    dataKey: 'shifts',
  });
}

const defaultRouter = createRouter();
defaultRouter.createRouter = createRouter;
module.exports = defaultRouter;
