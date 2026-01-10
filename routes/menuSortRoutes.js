// routes/menuSortRoutes.js
const express = require("express");
const router = express.Router();
const menuSortController = require("../controllers/menu/menuSortController");

// Get menu sort order
router.get("/order", menuSortController.getMenuSortOrder);

// Update menu sort order
router.post("/order", menuSortController.updateMenuSortOrder);
router.put("/order", menuSortController.updateMenuSortOrder);

// Get sorted items
router.get("/sorted-items", menuSortController.getSortedItems);

// Reset menu sort order
router.delete("/order", menuSortController.resetMenuSortOrder);

module.exports = router;

