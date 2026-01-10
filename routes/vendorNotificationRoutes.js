const express = require("express");
const router = express.Router();

const vendorAuthMiddleware = require("../middleware/auth/vendorAuthMiddleware");
const { streamVendorNotifications } = require("../controllers/vendor/vendorNotificationController");

router.get("/stream", vendorAuthMiddleware, streamVendorNotifications);

module.exports = router;

