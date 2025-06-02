const express = require("express");
const router = express.Router();
const { getVendorsByUni } = require("../controllers/vendorController");

// Get all vendors for a specific university
router.get("/list/uni/:uniId", getVendorsByUni);

module.exports = router; 