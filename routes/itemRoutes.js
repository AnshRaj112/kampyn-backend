const express = require("express");
const router = express.Router();
const itemController = require("../controllers/itemController");
const Retail = require('../models/item/Retail');
const Produce = require('../models/item/Produce');
const Raw = require('../models/item/Raw');
const { getAllSpecialsByUniId } = require('../controllers/itemController');

router.get(
  "/getvendors/:vendorId/retail",
  itemController.getRetailItemsByVendor
);
router.get(
  "/getvendors/:vendorId/produce",
  itemController.getProduceItemsByVendor
);
router.get(
  "/getvendors/:vendorId/raw",
  itemController.getRawItemsByVendor
);
// Add a new item in a category (retail/produce/raw)
router.post("/:category", itemController.addItem);

// Get paginated items by uniId for a category
router.get("/:category/uni/:uniId", itemController.getItemsByUniId);

// Get items filtered by type and uniId for a category
router.get("/:category/:type/:uniId", itemController.getItemsByTypeAndUni);

// Update an item by id in a category
router.put("/:category/:id", itemController.updateItem);

// Delete an item by id in a category
router.delete("/:category/:id", itemController.deleteItem);

// Search items with enhanced enum matching
router.get("/search/items", itemController.searchItems);

// Search vendors by name within a uniID
router.get("/search/vendors", itemController.searchVendorsByName);

//Fetch all vendors that currently hold a given retail/produce/raw item:
// Only returns vendorName + either quantity (retail) or isAvailable (produce) or openingAmount/closingAmount (raw).
router.get(
  "/vendors/by-item/:itemType/:itemId",
  itemController.getVendorsByItem
);

//Fetch all in‐stock retail items and all available produce items for one vendor:
router.get("/getvendors/:vendorId", itemController.getItemsByVendor);

// Get vendors for a specific item
router.get("/vendors/:itemId", itemController.getVendorsForItem);

// Get individual item by id in a category
router.get("/:category/item/:id", itemController.getItemById);

// Get vendor-specific items (items that belong only to a specific vendor)
router.get("/vendor/:vendorId/:category", itemController.getVendorSpecificItems);

router.get('/types/retail', (req, res) => {
  const retailTypes = Retail.schema.path('type').enumValues;
  res.json({ types: retailTypes });
});

router.get('/types/produce', (req, res) => {
  const produceTypes = Produce.schema.path('type').enumValues;
  res.json({ types: produceTypes });
});

module.exports = router;
