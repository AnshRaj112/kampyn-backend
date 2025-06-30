const express = require("express");
const router = express.Router();
const adminAuthController = require("../../controllers/auth/adminAuthController");
const { adminAuthMiddleware } = require("../../middleware/adminAuthMiddleware");

// Public routes (no authentication required)
router.post("/login", adminAuthController.adminLogin);
router.post("/logout", adminAuthController.adminLogout);

// Protected routes (authentication required)
router.get("/profile", adminAuthMiddleware, adminAuthController.getAdminProfile);
router.put("/profile", adminAuthMiddleware, adminAuthController.updateAdminProfile);
router.put("/change-password", adminAuthMiddleware, adminAuthController.changePassword);
router.post("/refresh-token", adminAuthMiddleware, adminAuthController.refreshToken);

module.exports = router; 