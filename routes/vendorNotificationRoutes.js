const express = require("express");
const router = express.Router();

const vendorAuthMiddleware = require("../middleware/vendorAuthMiddleware");
const { streamVendorNotifications } = require("../controllers/vendorNotificationController");

router.get("/stream", vendorAuthMiddleware, streamVendorNotifications);

module.exports = router;

