// src/routes/expressOrderRoutes.js
const express = require("express");
const {
  handleInitiate,
  handleViewVendor,
  handleConfirm,
} = require("../controllers/order/expressOrderController");
const { authMiddleware } = require("../middleware/auth/authMiddleware");

const router = express.Router();

// All express order routes require authentication
router.use(authMiddleware);

// 1) Initiate express order
//    POST /express-order/initiate
router.post("/initiate", handleInitiate);

// 2) View pending express orders
//    GET /express-order/vendor/:vendorId
router.get("/vendor/:vendorId", handleViewVendor);

// 3) Confirm express order (manual payment)
//    POST /express-order/confirm/:orderId
router.post("/confirm/:orderId", handleConfirm);

module.exports = router;
