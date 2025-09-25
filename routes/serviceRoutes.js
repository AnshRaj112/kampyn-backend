const express = require("express");
const router = express.Router();
const { listServices, createService } = require("../controllers/serviceController");

router.get("/services", listServices);
router.post("/services", createService);

module.exports = router;


