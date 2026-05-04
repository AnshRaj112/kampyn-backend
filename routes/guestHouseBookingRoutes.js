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
const {
  listPhysicalRoomsForGuestHouseManager,
  listRoomTypesForGuestHouseManager,
  generatePhysicalRoomLayoutForManager,
  createPhysicalRoomForGuestHouseManager,
  updatePhysicalRoomForGuestHouseManager,
  deletePhysicalRoomForGuestHouseManager,
} = require("../controllers/guestHouse/guestHousePhysicalRoomController");

const router = express.Router();

router.get("/public/availability/:roomId", getRoomAvailability);
router.get("/public/booking-lookup", lookupGuestHouseBooking);
router.post("/public/create-payment-order", createGuestHousePaymentOrder);
router.post("/public/verify-payment", verifyGuestHousePayment);

router.get("/manager/bookings", verifyToken, listGuestHouseBookingsForManager);
router.patch("/manager/bookings/:bookingId", verifyToken, updateGuestHouseBookingRoomAssignment);
router.get("/manager/inventory-overview", verifyToken, getPhysicalInventoryOverviewForManager);
router.get("/manager/bookings/:bookingId/assignable-units", verifyToken, getAssignableUnitsForBooking);

router.get("/manager/physical-rooms", verifyToken, listPhysicalRoomsForGuestHouseManager);
router.get("/manager/room-types", verifyToken, listRoomTypesForGuestHouseManager);
router.post("/manager/physical-rooms/layout", verifyToken, generatePhysicalRoomLayoutForManager);
router.post("/manager/physical-rooms", verifyToken, createPhysicalRoomForGuestHouseManager);
router.patch("/manager/physical-rooms/:physicalRoomId", verifyToken, updatePhysicalRoomForGuestHouseManager);
router.delete("/manager/physical-rooms/:physicalRoomId", verifyToken, deletePhysicalRoomForGuestHouseManager);

module.exports = router;
