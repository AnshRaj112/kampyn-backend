const express = require("express");
const router = express.Router();
const {
  getFavourites,
  getFavouritesByUni,
  toggleFavourite,
} = require("../controllers/favourites/favouritesController");
const { authMiddleware } = require("../middleware/auth/authMiddleware");

// Favourite routes

router.get("/:userId", getFavourites);
router.get("/:userId/:uniId", getFavouritesByUni);
router.get("/:userId/:uniId/:vendorId", getFavouritesByUni);
router.patch("/:userId/:itemId/:kind/:vendorId", toggleFavourite);

module.exports = router;
