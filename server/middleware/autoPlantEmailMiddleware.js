/**
 * Auto Plant Email Middleware
 * [EMAIL FUNCTIONALITY DECOMMISSIONED]
 * This middleware previously intercepted write methods to trigger background email dispatches.
 * All automatic email dispatches and response body modifications have been disabled.
 */

const autoPlantEmailMiddleware = (req, res, next) => {
  return next();
};

module.exports = autoPlantEmailMiddleware;
