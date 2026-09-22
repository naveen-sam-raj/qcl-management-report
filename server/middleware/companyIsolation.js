/**
 * Company Isolation Middleware
 * Guarantees that Company Admins and Users can NEVER access or mutate records from other companies.
 * Super Admin has cross-company scope.
 */
const enforceCompanyIsolation = (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required for company verification.',
    });
  }

  // Super Admin has universal access
  if (user.role === 'super_admin') {
    // If super admin requested specific company in query/body/param, pass it along
    req.targetCompanyId = req.params.companyId || req.query.companyId || req.body.companyId || null;
    return next();
  }

  // For Company Admin & User, enforce strict ownership
  const userCompanyId = user.company ? (user.company._id || user.company).toString() : null;

  if (!userCompanyId) {
    return res.status(403).json({
      success: false,
      message: 'Security Violation: User is not assigned to any valid company.',
    });
  }

  // Check if target company was specified in params, query, or body
  const targetCompanyId = req.params.companyId || req.query.companyId || req.body.companyId;

  if (targetCompanyId && targetCompanyId.toString() !== userCompanyId) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Company isolation violation. You cannot access data outside your assigned company.',
    });
  }

  // Lock targetCompanyId to the user's assigned company
  req.targetCompanyId = userCompanyId;
  next();
};

module.exports = { enforceCompanyIsolation };
