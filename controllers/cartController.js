// controllers/cartController.js

const cartUtils = require("../utils/cartUtils");

// 1) addToCart: add or increment quantity
exports.addToCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const { itemId, kind, quantity } = req.body;
    if (!itemId || !kind || !quantity || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "itemId, kind, and positive quantity are required." });
    }

    await cartUtils.addToCart(userId, itemId, kind, Number(quantity));
    return res
      .status(200)
      .json({ message: "Item added to cart successfully." });
  } catch (err) {
    console.error("Add to cart error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

// 2) getCart: return detailed cart + vendor name
exports.getCart = async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await cartUtils.getCartDetails(userId);
    return res.status(200).json({
      cart: data.cart,
      vendorId: data.vendorId,
      vendorName: data.vendorName,
    });
  } catch (err) {
    console.error("Get cart error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

// 3) increaseOne: increment by 1 (now checks max limits too)
exports.increaseOne = async (req, res) => {
  try {
    const { userId } = req.params;
    const { itemId, kind } = req.body;
    if (!itemId || !kind) {
      return res.status(400).json({ message: "itemId and kind are required." });
    }
    await cartUtils.changeQuantity(userId, itemId, kind, +1);
    return res.status(200).json({ message: "Quantity increased." });
  } catch (err) {
    console.error("Increase one error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

// 4) decreaseOne: decrement by 1 (removes if it hits 0)
exports.decreaseOne = async (req, res) => {
  try {
    const { userId } = req.params;
    const { itemId, kind } = req.body;
    if (!itemId || !kind) {
      return res.status(400).json({ message: "itemId and kind are required." });
    }
    await cartUtils.changeQuantity(userId, itemId, kind, -1);
    return res.status(200).json({ message: "Quantity decreased." });
  } catch (err) {
    console.error("Decrease one error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

// 5) removeItem: drop this (itemId, kind) entirely from cart
exports.removeItem = async (req, res) => {
  try {
    const { userId } = req.params;
    const { itemId, kind } = req.body;
    if (!itemId || !kind) {
      return res.status(400).json({ message: "itemId and kind are required." });
    }
    await cartUtils.removeItem(userId, itemId, kind);
    return res.status(200).json({ message: "Item removed from cart." });
  } catch (err) {
    console.error("Remove item error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};

// 6) getExtras: list extras from same vendor not already in cart
exports.getExtras = async (req, res) => {
  try {
    const { userId } = req.params;
    const extras = await cartUtils.getExtras(userId);
    return res.status(200).json({
      message: extras.length
        ? "Extras from the same vendor."
        : "No extra items found.",
      extras,
    });
  } catch (err) {
    console.error("Get extras error:", err.message);
    return res.status(400).json({ message: err.message });
  }
};
