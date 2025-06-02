const express = require("express");
const router = express.Router();
const {
  getFavourites,
  getFavouritesByUni,
  toggleFavourite,
} = require("../controllers/favouritesController");

router.get("/:userId", getFavourites);
router.get("/:userId/:uniId", getFavouritesByUni);
router.get("/:userId/:uniId/:vendorId", getFavouritesByUni);
router.patch("/:userId/:itemId/:kind/:vendorId", toggleFavourite);

module.exports = router;
