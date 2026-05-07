const express = require("express");
const { uniAuthMiddleware } = require("../middleware/auth/uniAuthMiddleware");
const {
  getAuditoriumAvailability,
  createAuditoriumPaymentOrder,
  verifyAuditoriumPayment,
  listAuditoriumBookingsForUniversity,
} = require("../controllers/auditorium/auditoriumBookingController");

const router = express.Router();

router.get("/public/availability/:auditoriumId", getAuditoriumAvailability);
router.post("/public/create-payment-order", createAuditoriumPaymentOrder);
router.post("/public/verify-payment", verifyAuditoriumPayment);

router.get("/uni/bookings", uniAuthMiddleware, listAuditoriumBookingsForUniversity);

module.exports = router;
