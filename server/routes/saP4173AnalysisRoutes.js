const { createCO2ShiftAnalysisRouter } = require('./co2AnalysisRouteFactory');

const PARAMETERS = ['fnh3', 'cnh3', 'tcl', 'nacl'];
const SA_SHIFT_DISPLAY_NAMES = { s1: 'I SHIFT', s2: 'II SHIFT', s3: 'III SHIFT' };

function createRouter({ getNow } = {}) {
  return createCO2ShiftAnalysisRouter({
    analysisType: 'P417-3 Analysis',
    unit: 'P417-3',
    tank: 'P417-3',
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
