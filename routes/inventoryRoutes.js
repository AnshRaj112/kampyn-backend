const express = require("express");
const router = express.Router();
const {
  addInventory,
  reduceRetailInventory,
  updateRetailAvailability,
  updateRawMaterialInventory,
  clearAllRawMaterialInventory,
} = require("../controllers/inventoryController");

router.post("/add", addInventory);
router.post("/reduce", reduceRetailInventory);
router.post("/retail/availability", updateRetailAvailability);
router.post("/raw-materials", updateRawMaterialInventory);
router.delete("/raw-materials", require("../controllers/inventoryController").deleteRawMaterialInventory);
router.post("/clear-raw-materials", clearAllRawMaterialInventory);

module.exports = router;
