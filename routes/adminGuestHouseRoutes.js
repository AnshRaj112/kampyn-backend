const express = require("express");
const { adminAuthMiddleware } = require("../middleware/auth/adminAuthMiddleware");
const {
  listGuestHousesForAdmin,
  updateGuestHouseServices,
} = require("../controllers/guestHouse/adminGuestHouseController");

const router = express.Router();

router.use(adminAuthMiddleware);

router.get("/", listGuestHousesForAdmin);
router.patch("/:guestHouseId/services", updateGuestHouseServices);

module.exports = router;

