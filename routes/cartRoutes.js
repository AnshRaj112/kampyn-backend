const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart/cartController");
const { authMiddleware } = require("../middleware/auth/authMiddleware");

// Cart routes (Authentication handled via cookies/logic if needed, but not globally enforced here)

router.post("/add/:userId", authMiddleware, cartController.addToCart);
router.get("/:userId", authMiddleware, cartController.getCart);
router.post("/add-one/:userId", authMiddleware, cartController.increaseOne);
router.post("/remove-one/:userId", authMiddleware, cartController.decreaseOne);
router.post("/remove-item/:userId", authMiddleware, cartController.removeItem);
router.get("/extras/:userId", authMiddleware, cartController.getExtras);

module.exports = router;
