const express = require("express");
const router = express.Router();
const { listFeatures, createFeature } = require("../controllers/account/featureController");
const { adminAuthMiddleware } = require("../middleware/auth/adminAuthMiddleware");

router.use(adminAuthMiddleware);

router.get("/features", listFeatures);
router.post("/features", createFeature);

module.exports = router;


