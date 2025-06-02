const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const { authMiddleware } = require("../middleware/authMiddleware");
// for JWT verification

router.post("/add/:userId", cartController.addToCart);
router.get("/:userId", cartController.getCart);
router.post("/add-one/:userId", cartController.increaseOne);
router.post("/remove-one/:userId", cartController.decreaseOne);
router.post("/remove-item/:userId", cartController.removeItem);
router.get("/extras/:userId", cartController.getExtras);

// router.post("/pay", authMiddleware, cartController.placeOrder);

module.exports = router;
