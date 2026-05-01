const express = require("express");
const { uniAuthMiddleware } = require("../middleware/auth/uniAuthMiddleware");
const upload = require("../middleware/upload");
const {
  createGuestHouseRoom,
  listGuestHouseRooms,
  listGuestHouseRoomsForUsers,
  updateGuestHouseRoom,
} = require("../controllers/guestHouse/guestHouseRoomController");

const router = express.Router();

router.get("/public/:guestHouseId", listGuestHouseRoomsForUsers);

router.use(uniAuthMiddleware);

router.get("/", listGuestHouseRooms);
router.post(
  "/",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "detailedImage", maxCount: 10 },
  ]),
  createGuestHouseRoom
);
router.put(
  "/:roomId",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "detailedImage", maxCount: 10 },
  ]),
  updateGuestHouseRoom
);

module.exports = router;

