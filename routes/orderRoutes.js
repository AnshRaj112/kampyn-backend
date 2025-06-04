const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { placeOrder } = require("../controllers/orderController");

router.post("/place", authMiddleware, placeOrder);

module.exports = router;
