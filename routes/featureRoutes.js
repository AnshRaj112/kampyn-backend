const express = require("express");
const router = express.Router();
const { listFeatures, createFeature } = require("../controllers/featureController");

router.get("/features", listFeatures);
router.post("/features", createFeature);

module.exports = router;


