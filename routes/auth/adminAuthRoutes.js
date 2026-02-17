const express = require("express");
const router = express.Router();
const adminAuthController = require("../../controllers/auth/adminAuthController");
const { adminAuthMiddleware } = require("../../middleware/auth/adminAuthMiddleware");
const { perApiAuthLimiter } = require("../../middleware/rateLimit");

// Public routes with per-API rate limiting
router.post("/login", perApiAuthLimiter, adminAuthController.adminLogin);
router.post("/logout", perApiAuthLimiter, adminAuthController.adminLogout);

// Protected routes (authentication required) with per-API rate limiting
router.get("/profile", perApiAuthLimiter, adminAuthMiddleware, adminAuthController.getAdminProfile);
router.put("/profile", perApiAuthLimiter, adminAuthMiddleware, adminAuthController.updateAdminProfile);
router.put("/change-password", perApiAuthLimiter, adminAuthMiddleware, adminAuthController.changePassword);
router.post("/refresh-token", perApiAuthLimiter, adminAuthMiddleware, adminAuthController.refreshToken);

module.exports = router; 