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
const { ensureFloorPlanRoomPresetsForUni } = require("../controllers/guestHouse/guestHouseRoomController");
const {
  listPhysicalRoomsForGuestHouse,
  updatePhysicalRoomPlanForUni,
  generatePhysicalRoomLayoutForUni,
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
router.post("/:guestHouseId/floor-plan/ensure-presets", ensureFloorPlanRoomPresetsForUni);
router.post("/:guestHouseId/physical-rooms/layout", generatePhysicalRoomLayoutForUni);
router.patch("/:guestHouseId/physical-rooms/:physicalRoomId", updatePhysicalRoomPlanForUni);

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

