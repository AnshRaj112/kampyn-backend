const express = require("express");
const router = express.Router();
const { listServices, createService } = require("../controllers/account/serviceController");

router.get("/services", listServices);
router.post("/services", createService);

module.exports = router;


