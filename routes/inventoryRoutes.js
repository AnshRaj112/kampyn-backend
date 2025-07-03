const express = require("express");
const router = express.Router();
const {
  addInventory,
  reduceRetailInventory,
  updateRetailAvailability,
} = require("../controllers/inventoryController");

router.post("/add", addInventory);
router.post("/reduce", reduceRetailInventory);
router.post("/retail/availability", updateRetailAvailability);

module.exports = router;
