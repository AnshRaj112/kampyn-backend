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
const {
  listPhysicalRoomsForGuestHouse,
  createPhysicalRoomForGuestHouse,
  updatePhysicalRoom,
  deletePhysicalRoom,
} = require("../controllers/guestHouse/guestHousePhysicalRoomController");

const router = express.Router();

router.get("/public/:uniId", listGuestHousesForUsers);

router.use(uniAuthMiddleware);

router.get("/", listGuestHousesByUniversity);
router.post(
  "/",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "additionalImages", maxCount: 10 },
    { name: "images", maxCount: 10 }, // legacy support
  ]),
  createGuestHouse
);

router.get("/:guestHouseId/physical-rooms", listPhysicalRoomsForGuestHouse);
router.post("/:guestHouseId/physical-rooms", createPhysicalRoomForGuestHouse);
router.patch("/physical-rooms/:physicalRoomId", updatePhysicalRoom);
router.delete("/physical-rooms/:physicalRoomId", deletePhysicalRoom);

router.put(
  "/:guestHouseId",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "additionalImages", maxCount: 10 },
    { name: "images", maxCount: 10 }, // legacy support
  ]),
  updateGuestHouse
);
router.delete("/:guestHouseId", deleteGuestHouse);

module.exports = router;

