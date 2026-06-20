const express = require("express");
const router = express.Router();
const tenantController = require("../controllers/tenant/tenantController");
const { adminAuthMiddleware, requireSuperAdmin } = require("../middleware/auth/adminAuthMiddleware");

// Public Endpoint: Retrieve active tenant dynamic configurations (branding / modules)
// This endpoint utilizes req.tenant populated by the global tenantMiddleware
router.get("/config", tenantController.getTenantConfig);

// Scoped impersonation context switching (Super Admin only)
router.post("/switch-tenant", adminAuthMiddleware, requireSuperAdmin, tenantController.switchTenantContext);

// branding updates (Super Admin only)
router.put("/branding", adminAuthMiddleware, requireSuperAdmin, tenantController.updateTenantBranding);

// Module enablement list updates (Super Admin only)
router.put("/modules", adminAuthMiddleware, requireSuperAdmin, tenantController.updateTenantModules);

// Tenant suspension and activation (Super Admin only)
router.put("/status", adminAuthMiddleware, requireSuperAdmin, tenantController.updateTenantStatus);

module.exports = router;
