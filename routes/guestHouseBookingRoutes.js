const express = require("express");
const {
  getRoomAvailability,
  createRoomBooking,
} = require("../controllers/guestHouse/guestHouseBookingController");

const router = express.Router();

router.get("/public/availability/:roomId", getRoomAvailability);
router.post("/public/book", createRoomBooking);

module.exports = router;

