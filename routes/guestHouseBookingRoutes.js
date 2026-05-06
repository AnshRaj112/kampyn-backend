const express = require("express");
const { verifyToken } = require("../controllers/auth/guestHouseAuthController");
const {
  getRoomAvailability,
  createGuestHousePaymentOrder,
  verifyGuestHousePayment,
  lookupGuestHouseBooking,
  listPublicBookingsByContact,
  listGuestHouseBookingsForManager,
  updateGuestHouseBookingRoomAssignment,
  updateBookingLifecycleForManager,
  getPhysicalInventoryOverviewForManager,
  getOpsOverviewForManager,
  getAssignableUnitsForBooking,
  getManagerProfileSettings,
  updateManagerProfileSettings,
} = require("../controllers/guestHouse/guestHouseBookingController");
const {
  getAmenityTrackerForManager,
  updateAmenityTrackerForManager,
} = require("../controllers/guestHouse/guestHouseAmenityController");
const {
  listRateRulesForManager,
  createRateRuleForManager,
} = require("../controllers/guestHouse/guestHouseRateRuleController");
const { listOpsLogsForManager } = require("../controllers/guestHouse/guestHouseOpsLogController");
const {
  createServiceRequestPublic,
  listServiceRequestsPublic,
  listServiceRequestsForManager,
  updateServiceRequestForManager,
} = require("../controllers/guestHouse/guestHouseServiceRequestController");
const {
  listPhysicalRoomsForGuestHouseManager,
  listRoomTypesForGuestHouseManager,
  generatePhysicalRoomLayoutForManager,
  createPhysicalRoomForGuestHouseManager,
  updatePhysicalRoomForGuestHouseManager,
  deletePhysicalRoomForGuestHouseManager,
} = require("../controllers/guestHouse/guestHousePhysicalRoomController");
const {
  getPublicFoodCatalog,
  createPublicFoodOrder,
  listPublicFoodOrders,
  listFoodItemsForManager,
  createFoodItemForManager,
  updateFoodItemForManager,
  listFoodOrdersForManager,
  updateFoodOrderStatusForManager,
} = require("../controllers/guestHouse/guestHouseFoodController");

const router = express.Router();

router.get("/public/availability/:roomId", getRoomAvailability);
router.get("/public/booking-lookup", lookupGuestHouseBooking);
router.get("/public/bookings-by-contact", listPublicBookingsByContact);
router.get("/public/service-requests", listServiceRequestsPublic);
router.post("/public/service-requests", createServiceRequestPublic);
router.get("/public/in-room-food/catalog", getPublicFoodCatalog);
router.get("/public/in-room-food/orders", listPublicFoodOrders);
router.post("/public/in-room-food/orders", createPublicFoodOrder);
router.post("/public/create-payment-order", createGuestHousePaymentOrder);
router.post("/public/verify-payment", verifyGuestHousePayment);

router.get("/manager/bookings", verifyToken, listGuestHouseBookingsForManager);
router.patch("/manager/bookings/:bookingId", verifyToken, updateGuestHouseBookingRoomAssignment);
router.patch("/manager/bookings/:bookingId/lifecycle", verifyToken, updateBookingLifecycleForManager);
router.get("/manager/inventory-overview", verifyToken, getPhysicalInventoryOverviewForManager);
router.get("/manager/ops-overview", verifyToken, getOpsOverviewForManager);
router.get("/manager/profile-settings", verifyToken, getManagerProfileSettings);
router.patch("/manager/profile-settings", verifyToken, updateManagerProfileSettings);
router.get("/manager/amenities-tracker", verifyToken, getAmenityTrackerForManager);
router.patch("/manager/amenities-tracker", verifyToken, updateAmenityTrackerForManager);
router.get("/manager/rate-rules", verifyToken, listRateRulesForManager);
router.post("/manager/rate-rules", verifyToken, createRateRuleForManager);
router.get("/manager/ops-logs", verifyToken, listOpsLogsForManager);
router.get("/manager/service-requests", verifyToken, listServiceRequestsForManager);
router.patch("/manager/service-requests/:requestId", verifyToken, updateServiceRequestForManager);
router.get("/manager/in-room-food/items", verifyToken, listFoodItemsForManager);
router.post("/manager/in-room-food/items", verifyToken, createFoodItemForManager);
router.patch("/manager/in-room-food/items/:itemId", verifyToken, updateFoodItemForManager);
router.get("/manager/in-room-food/orders", verifyToken, listFoodOrdersForManager);
router.patch("/manager/in-room-food/orders/:orderId", verifyToken, updateFoodOrderStatusForManager);
router.get("/manager/bookings/:bookingId/assignable-units", verifyToken, getAssignableUnitsForBooking);

router.get("/manager/physical-rooms", verifyToken, listPhysicalRoomsForGuestHouseManager);
router.get("/manager/room-types", verifyToken, listRoomTypesForGuestHouseManager);
router.post("/manager/physical-rooms/layout", verifyToken, generatePhysicalRoomLayoutForManager);
router.post("/manager/physical-rooms", verifyToken, createPhysicalRoomForGuestHouseManager);
router.patch("/manager/physical-rooms/:physicalRoomId", verifyToken, updatePhysicalRoomForGuestHouseManager);
router.delete("/manager/physical-rooms/:physicalRoomId", verifyToken, deletePhysicalRoomForGuestHouseManager);

module.exports = router;
