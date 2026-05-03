const express = require("express");
const { verifyToken } = require("../controllers/auth/guestHouseAuthController");
const {
  getRoomAvailability,
  createGuestHousePaymentOrder,
  verifyGuestHousePayment,
  lookupGuestHouseBooking,
  listGuestHouseBookingsForManager,
  updateGuestHouseBookingRoomAssignment,
  getPhysicalInventoryOverviewForManager,
  getAssignableUnitsForBooking,
} = require("../controllers/guestHouse/guestHouseBookingController");

const router = express.Router();

router.get("/public/availability/:roomId", getRoomAvailability);
router.get("/public/booking-lookup", lookupGuestHouseBooking);
router.post("/public/create-payment-order", createGuestHousePaymentOrder);
router.post("/public/verify-payment", verifyGuestHousePayment);

router.get("/manager/bookings", verifyToken, listGuestHouseBookingsForManager);
router.patch("/manager/bookings/:bookingId", verifyToken, updateGuestHouseBookingRoomAssignment);
router.get("/manager/inventory-overview", verifyToken, getPhysicalInventoryOverviewForManager);
router.get("/manager/bookings/:bookingId/assignable-units", verifyToken, getAssignableUnitsForBooking);

module.exports = router;
