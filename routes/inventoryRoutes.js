const express = require("express");
const router = express.Router();
const {
  addInventory,
  reduceRetailInventory,
} = require("../controllers/inventoryController");

router.post("/add", addInventory);
router.post("/reduce", reduceRetailInventory);

module.exports = router;
