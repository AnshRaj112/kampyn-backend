const logger = require("../../utils/pinoLogger");

/**
 * Helper to evaluate operators in condition blocks
 */
function evaluateConditionValue(op, actual, target) {
  switch (op) {
    case "$eq": return actual === target;
    case "$ne": return actual !== target;
    case "$gt": return actual > target;
    case "$gte": return actual >= target;
    case "$lt": return actual < target;
    case "$lte": return actual <= target;
    case "$in": return Array.isArray(target) && target.includes(actual);
    default: return false;
  }
}

/**
 * Checks if policy conditions match request execution context
 */
function evaluateConditions(conditions, user, resource) {
  for (const [key, conditionRule] of Object.entries(conditions)) {
    // Resolve dynamic path references (e.g. "user.departmentId" -> actual value)
    let actualValue = null;
    if (key.startsWith("user.")) {
      actualValue = user[key.split(".")[1]];
    } else if (key.startsWith("resource.")) {
      actualValue = resource[key.split(".")[1]];
    }

    if (typeof conditionRule === "object" && !Array.isArray(conditionRule)) {
      for (const [op, targetVal] of Object.entries(conditionRule)) {
        let resolvedTarget = targetVal;
        // Check if target is a path reference
        if (typeof targetVal === "string" && targetVal.startsWith("resource.")) {
          resolvedTarget = resource[targetVal.split(".")[1]];
        }
        if (!evaluateConditionValue(op, actualValue, resolvedTarget)) {
          return false;
        }
      }
    } else {
      if (actualValue !== conditionRule) return false;
    }
  }
  return true;
}

/**
 * Dynamic RBAC/ABAC Express Middleware
 */
const checkAccess = (resourceName, actionName) => {
  return async (req, res, next) => {
    try {
      const user = req.user; // Set by authMiddleware
      const tenant = req.tenant; // Set by tenantMiddleware

      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized." });
      }

      // Fetch dynamic role definitions from cached configuration
      const roles = tenant.permissions?.roles || [];
      const userRoles = roles.filter(r => user.roles.includes(r.name));

      let permissionGranted = false;

      // Compile rules including inherited rules
      const allRules = [];
      const resolveInheritedRules = (roleName) => {
        const role = roles.find(r => r.name === roleName);
        if (!role) return;
        if (role.policies) allRules.push(...role.policies);
        if (role.inherits && role.inherits.length > 0) {
          role.inherits.forEach(resolveInheritedRules);
        }
      };

      user.roles.forEach(resolveInheritedRules);

      for (const rule of allRules) {
        if (rule.resource === resourceName && rule.action === actionName) {
          if (rule.conditions) {
            const matches = evaluateConditions(rule.conditions, user, req.body);
            if (matches) {
              permissionGranted = rule.effect === "allow";
            }
          } else {
            permissionGranted = rule.effect === "allow";
          }
        }
      }

      if (!permissionGranted) {
        logger.warn({ user: user._id, resource: resourceName, action: actionName }, "Access denied by ABAC Engine");
        return res.status(403).json({ success: false, message: "Forbidden: Insufficient privileges." });
      }

      next();
    } catch (error) {
      logger.error({ error: error.message }, "Error during policy evaluation");
      res.status(500).json({ success: false, message: "Internal authorization error." });
    }
  };
};

module.exports = checkAccess;
