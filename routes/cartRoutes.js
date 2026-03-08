const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart/cartController");
const { authMiddleware } = require("../middleware/auth/authMiddleware");

// Cart routes (Authentication handled via cookies/logic if needed, but not globally enforced here)

router.post("/add/:userId", cartController.addToCart);
router.get("/:userId", cartController.getCart);
router.post("/add-one/:userId", cartController.increaseOne);
router.post("/remove-one/:userId", cartController.decreaseOne);
router.post("/remove-item/:userId", cartController.removeItem);
router.get("/extras/:userId", cartController.getExtras);

module.exports = router;
