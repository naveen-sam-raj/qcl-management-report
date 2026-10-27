const createSlotLockRoute = require('./createSlotLockRoute');

const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];
const PARAMETERS = ['fnh3', 'cnh3', 'tcl', 'pcl'];

const createTk205Router = createSlotLockRoute({
  analysisType: 'TK 205 Analysis',
  unitName: 'TK 205',
  plantName: 'ACL Plant',
  plantCode: 'ACL',
  unitsOrder: UNITS_ORDER,
  parameters: PARAMETERS,
});

const defaultRouter = createTk205Router();
defaultRouter.createTk205Router = createTk205Router;

module.exports = defaultRouter;

