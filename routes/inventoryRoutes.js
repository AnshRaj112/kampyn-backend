const express = require("express");
const router = express.Router();
const {
  addInventory,
  reduceRetailInventory,
  updateRetailAvailability,
  updateRawMaterialInventory,
  clearAllRawMaterialInventory,
  getRecipeWorksRecipes,
  validateRecipeIngredients,
  createItemsFromRecipe,
  produceRetailSimple,
  produceProduceSimple,
} = require("../controllers/inventoryController");
const vendorAuthMiddleware = require("../middleware/vendorAuthMiddleware");

router.post("/add", addInventory);
router.post("/reduce", reduceRetailInventory);
router.post("/retail/availability", updateRetailAvailability);
router.post("/raw-materials", updateRawMaterialInventory);
router.delete("/raw-materials", require("../controllers/inventoryController").deleteRawMaterialInventory);
router.post("/clear-raw-materials", clearAllRawMaterialInventory);

// Recipe Works routes
router.get("/recipe-works/recipes", vendorAuthMiddleware, getRecipeWorksRecipes);
router.post("/recipe-works/validate", vendorAuthMiddleware, validateRecipeIngredients);
router.post("/recipe-works/create", vendorAuthMiddleware, createItemsFromRecipe);

// Simple retail production endpoint
router.post("/produce-retail-simple", vendorAuthMiddleware, produceRetailSimple);
router.post("/produce-produce-simple", vendorAuthMiddleware, produceProduceSimple);

module.exports = router;
