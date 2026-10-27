const createSlotLockRoute = require('./createSlotLockRoute');

const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];
const PARAMETERS = ['fnh3', 'cnh3', 'tcl', 'pcl', 'co2'];

const createTk203Router = createSlotLockRoute({
  analysisType: 'TK 203 Analysis',
  unitName: 'TK 203',
  plantName: 'ACL Plant',
  plantCode: 'ACL',
  unitsOrder: UNITS_ORDER,
  parameters: PARAMETERS,
});

const defaultRouter = createTk203Router();
defaultRouter.createTk203Router = createTk203Router;

// Preserve existing retry-email handler
defaultRouter.post('/:id/retry-email', async (req, res) => {
  return res.status(200).json({
    success: true,
    emailSent: false,
    emailStatus: 'disabled',
    message: 'Email notification functionality has been removed.',
  });
});

module.exports = defaultRouter;
