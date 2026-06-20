const logger = require("../utils/pinoLogger");

/**
 * Parameterized Express middleware to enforce module enablement guards.
 * @param {string} moduleName - Name of the module to verify (e.g., "food", "hostel", "auditorium")
 */
const moduleGuard = (moduleName) => {
  return (req, res, next) => {
    const tenant = req.tenant;
    
    if (!tenant) {
      logger.error("moduleGuard: req.tenant context is missing");
      return res.status(500).json({
        success: false,
        message: "Internal server error: Tenant context missing during authorization check."
      });
    }

    const enabledModules = tenant.enabledModules || [];

    // Assert that the tenant has the module enabled
    if (!enabledModules.includes(moduleName.toLowerCase())) {
      logger.warn(
        { tenantSlug: tenant.slug, moduleName, enabledModules },
        "Module access denied: Module not enabled for tenant"
      );
      
      return res.status(403).json({
        success: false,
        message: `Access denied. The '${moduleName}' module is not enabled for this university (${tenant.name}).`
      });
    }

    next();
  };
};

module.exports = moduleGuard;
