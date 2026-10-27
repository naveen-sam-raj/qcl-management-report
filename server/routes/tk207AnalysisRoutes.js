const createSlotLockRoute = require('./createSlotLockRoute');

const UNITS_ORDER = ['t07', 't09', 't11', 't13', 't15', 't17', 't19', 't21', 't23', 't01', 't03', 't05'];
const PARAMETERS = ['fnh3', 'cnh3', 'tcl', 'pcl'];

const createTk207Router = createSlotLockRoute({
  analysisType: 'TK 207 Analysis',
  unitName: 'TK 207',
  plantName: 'ACL Plant',
  plantCode: 'ACL',
  unitsOrder: UNITS_ORDER,
  parameters: PARAMETERS,
});

const defaultRouter = createTk207Router();
defaultRouter.createTk207Router = createTk207Router;

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
