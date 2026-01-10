const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth/authMiddleware");
const reviewController = require("../controllers/review/reviewController");

// User submits or updates a review for an order
router.post("/order/:orderId", authMiddleware, reviewController.upsertReview);

// User fetches their review state for an order
router.get("/order/:orderId/me", authMiddleware, reviewController.getMyReviewForOrder);

// University fetches reviews list
router.get("/university/:uniId", reviewController.listReviewsForUniversity);

module.exports = router;


