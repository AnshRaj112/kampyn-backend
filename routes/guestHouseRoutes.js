const express = require("express");
const { uniAuthMiddleware } = require("../middleware/auth/uniAuthMiddleware");
const upload = require("../middleware/upload");
const {
  createGuestHouse,
  listGuestHousesByUniversity,
  listGuestHousesForUsers,
  updateGuestHouse,
  deleteGuestHouse,
} = require("../controllers/guestHouse/guestHouseController");

const router = express.Router();

router.get("/public/:uniId", listGuestHousesForUsers);

router.use(uniAuthMiddleware);

router.get("/", listGuestHousesByUniversity);
router.post("/", upload.array("images", 10), createGuestHouse);
router.put("/:guestHouseId", upload.array("images", 10), updateGuestHouse);
router.delete("/:guestHouseId", deleteGuestHouse);

module.exports = router;

