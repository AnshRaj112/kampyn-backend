const express = require("express");
const { uniAuthMiddleware } = require("../middleware/auth/uniAuthMiddleware");
const upload = require("../middleware/upload");
const {
  createGuestHouseRoom,
  listGuestHouseRooms,
  listGuestHouseRoomsForUsers,
  updateGuestHouseRoom,
  deleteGuestHouseRoom,
} = require("../controllers/guestHouse/guestHouseRoomController");
const {
  listRateRulesForUni,
  createRateRuleForUni,
  updateRateRuleForUni,
  deleteRateRuleForUni,
} = require("../controllers/guestHouse/guestHouseRateRuleController");

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
router.delete("/:roomId", deleteGuestHouseRoom);
router.get("/rate-rules", listRateRulesForUni);
router.post("/:roomId/rate-rules", createRateRuleForUni);
router.put("/rate-rules/:ruleId", updateRateRuleForUni);
router.delete("/rate-rules/:ruleId", deleteRateRuleForUni);

module.exports = router;

