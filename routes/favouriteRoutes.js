const express = require("express");
const router = express.Router();
const {
  getFavourites,
  getFavouritesByUni,
  toggleFavourite,
} = require("../controllers/favourites/favouritesController");
const { authMiddleware } = require("../middleware/auth/authMiddleware");
const { validateUserAccess } = require("../middleware/auth/validateUserAccess");

// Favourite routes

router.get("/:userId", authMiddleware, validateUserAccess, getFavourites);
router.get("/:userId/:uniId", authMiddleware, validateUserAccess, getFavouritesByUni);
router.get("/:userId/:uniId/:vendorId", authMiddleware, validateUserAccess, getFavouritesByUni);
router.patch("/:userId/:itemId/:kind/:vendorId", authMiddleware, validateUserAccess, toggleFavourite);

module.exports = router;
