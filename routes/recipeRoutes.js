const express = require("express");
const router = express.Router();
const recipeController = require("../controllers/recipeController");

// Import authentication middleware
const vendorAuthMiddleware = require("../middleware/vendorAuthMiddleware");
const { uniAuthMiddleware } = require("../middleware/uniAuthMiddleware");
const { authMiddleware } = require("../middleware/authMiddleware");

// Vendor Routes (Protected)
router.post("/vendor", vendorAuthMiddleware, recipeController.createRecipe);
router.get("/vendor", vendorAuthMiddleware, recipeController.getVendorRecipes);
router.get("/vendor/stats", vendorAuthMiddleware, recipeController.getRecipeStats);
router.get("/vendor/:recipeId", vendorAuthMiddleware, recipeController.getRecipeById);
router.put("/vendor/:recipeId", vendorAuthMiddleware, recipeController.updateRecipe);
router.delete("/vendor/:recipeId", vendorAuthMiddleware, recipeController.deleteRecipe);
router.patch("/vendor/:recipeId/status", vendorAuthMiddleware, recipeController.updateRecipeStatus);

// University Routes (Protected)
router.get("/university", uniAuthMiddleware, recipeController.getUniversityRecipes);
router.get("/university/:recipeId", uniAuthMiddleware, recipeController.getRecipeById);

// Public Routes (for users to view recipes)
router.get("/public", recipeController.getUniversityRecipes); // Public access to published recipes
router.get("/public/:recipeId", recipeController.getRecipeById); // Public access to individual recipe
router.post("/public/:recipeId/like", authMiddleware, recipeController.toggleRecipeLike);

// Admin Routes (if needed in the future)
// router.get("/admin", adminAuth, recipeController.getAllRecipes);
// router.delete("/admin/:recipeId", adminAuth, recipeController.deleteRecipe);

module.exports = router;
