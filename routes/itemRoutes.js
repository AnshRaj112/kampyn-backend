const express = require("express");
const router = express.Router();
const itemController = require("../controllers/itemController");

// Add a new item in a category (retail/produce)
router.post("/:category", itemController.addItem);

// Get paginated items by uniId for a category
router.get("/:category/uni/:uniId", itemController.getItemsByUniId);

// Get items filtered by type and uniId for a category
router.get("/:category/:type/:uniId", itemController.getItemsByTypeAndUni);

// Update an item by id in a category
router.put("/:category/:id", itemController.updateItem);

// Delete an item by id in a category
router.delete("/:category/:id", itemController.deleteItem);

//search items
router.get("/foods", itemController.searchItems); 

//Fetch all vendors that currently hold a given retail/produce item:
// Only returns vendorName + either quantity (retail) or isAvailable (produce).
router.get(
  "/vendors/by-item/:itemType/:itemId",
  itemController.getVendorsByItem
);

//Fetch all in‐stock retail items and all available produce items for one vendor:
router.get("/getvendors/:vendorId", itemController.getItemsByVendor);

// Get vendors for a specific item
router.get("/vendors/:itemId", itemController.getVendorsForItem);

module.exports = router;
