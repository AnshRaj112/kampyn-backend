const express = require("express");
const router = express.Router();
const { listServices, createService } = require("../controllers/account/serviceController");
const { adminAuthMiddleware } = require("../middleware/auth/adminAuthMiddleware");

router.use(adminAuthMiddleware);

router.get("/services", listServices);
router.post("/services", createService);

module.exports = router;


