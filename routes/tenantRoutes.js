const express = require("express");
const router = express.Router();
const tenantController = require("../controllers/tenant/tenantController");
const promotionController = require("../controllers/promotionController");
const { adminAuthMiddleware, requireSuperAdmin } = require("../middleware/auth/adminAuthMiddleware");
const jwt = require("jsonwebtoken");
const Uni = require("../models/account/Uni");
const Admin = require("../models/account/Admin");

// Helper middleware to authenticate either University Admin or Super Admin
const uniOrSuperAdminAuth = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token || req.cookies?.adminToken;
    if (!token) {
      return res.status(401).json({ success: false, message: "Access denied. No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try finding super admin first
    const admin = await Admin.findById(decoded.userId).select("-password");
    if (admin && admin.isActive && admin.role === "super_admin") {
      req.admin = {
        adminId: admin._id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      };
      return next();
    }

    // Try finding university admin
    const university = await Uni.findById(decoded.userId).select("-password");
    if (university && university.isAvailable === 'Y') {
      if (req.tenantId && String(university._id) !== String(req.tenantId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Your session does not belong to the requested university tenant context."
        });
      }
      req.uni = {
        _id: university._id,
        fullName: university.fullName,
        email: university.email
      };
      return next();
    }

    return res.status(401).json({ success: false, message: "Access denied. Invalid or inactive account." });
  } catch (error) {
    return res.status(401).json({ success: false, message: "Access denied. Invalid or expired token." });
  }
};

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

// Environment Promotion (Super Admin or University Admin)
router.post("/promote", uniOrSuperAdminAuth, promotionController.promoteConfiguration);

// Environment Rollback (Super Admin or University Admin)
router.post("/rollback", uniOrSuperAdminAuth, promotionController.rollbackConfiguration);

module.exports = router;
