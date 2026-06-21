const express = require("express");
const router = express.Router();
const tenantController = require("../controllers/tenant/tenantController");
const promotionController = require("../controllers/promotionController");
const { adminAuthMiddleware, requireSuperAdmin } = require("../middleware/auth/adminAuthMiddleware");
const { uniOrSuperAdminAuth } = require("../middleware/auth/uniAuthMiddleware");

// Public Endpoint: Retrieve active tenant dynamic configurations (branding / modules)
// This endpoint utilizes req.tenant populated by the global tenantMiddleware
router.get("/config", tenantController.getTenantConfig);

// Scoped impersonation context switching (Super Admin only)
router.post("/switch-tenant", adminAuthMiddleware, requireSuperAdmin, tenantController.switchTenantContext);

// branding updates (Super Admin or University Admin)
router.put("/branding", uniOrSuperAdminAuth, tenantController.updateTenantBranding);

// PUT: Save all configuration changes from Tenant Studio
router.put("/studio-config", uniOrSuperAdminAuth, tenantController.updateTenantStudioConfig);

// Module enablement list updates (Super Admin only)
router.put("/modules", adminAuthMiddleware, requireSuperAdmin, tenantController.updateTenantModules);

// Tenant suspension and activation (Super Admin only)
router.put("/status", adminAuthMiddleware, requireSuperAdmin, tenantController.updateTenantStatus);

// Environment Promotion (Super Admin or University Admin)
router.post("/promote", uniOrSuperAdminAuth, promotionController.promoteConfiguration);

// Environment Rollback (Super Admin or University Admin)
router.post("/rollback", uniOrSuperAdminAuth, promotionController.rollbackConfiguration);

module.exports = router;
