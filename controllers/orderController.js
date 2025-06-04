// orderController.js

const User = require("../models/account/User");
const Order = require("../models/order/Order");
const Vendor = require("../models/account/Vendor");
const InventoryReport = require("../models/inventory/InventoryReport");

const {
  getItemDetails,
  getVendorInventory,
  validateQuantity,
} = require("../utils/cartUtils");

const {
  ensureInventoryReport,
  updateInventoryForRetail,
  updateInventoryForProduce,
} = require("../utils/orderUtils");

exports.placeOrder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ message: "Address is required." });
    }

    const user = await User.findById(userId);
    if (!user || user.cart.length === 0) {
      return res
        .status(400)
        .json({ message: "Cart is empty or user not found." });
    }

    const cart = user.cart;
    const vendorId = user.vendorId;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    let total = 0;
    const updatedRetailInventory = [];
    const updatedProduceInventory = [];
    const retailSold = [];
    const produceSold = [];

    for (const cartItem of cart) {
      const { itemId, kind, quantity } = cartItem;

      validateQuantity(kind, quantity);

      const itemDetails = await getItemDetails(itemId, kind);
      if (!itemDetails || typeof itemDetails.price !== "number") {
        return res
          .status(400)
          .json({ message: `Price not found for item ${itemId}` });
      }

      const availableQty = await getVendorInventory(vendorId, kind, itemId);

      if (kind === "Retail") {
        if (availableQty < 10) {
          return res.status(400).json({
            message: `Retail item "${itemDetails.name}" has insufficient stock (less than 10).`,
          });
        }
        if (availableQty < quantity) {
          return res.status(400).json({
            message: `Retail item "${itemDetails.name}" does not have enough inventory.`,
          });
        }
      } else if (kind === "Produce") {
        if (availableQty !== 1) {
          return res.status(400).json({
            message: `Produce item "${itemDetails.name}" is not available.`,
          });
        }
      }

      total += itemDetails.price * quantity;

      if (kind === "Retail") {
        updatedRetailInventory.push({ itemId, quantity });
        retailSold.push({ item: itemId, soldQty: quantity });
      } else if (kind === "Produce") {
        updatedProduceInventory.push({ itemId });
        produceSold.push({ item: itemId, soldQty: quantity });
      }
    }

    // Create the order
    const newOrder = await Order.create({
      userId,
      items: cart,
      total,
      address,
      vendorId,
      status: "ordered",
    });

    // Update vendor inventory (only Retail items quantity is updated)
    updatedRetailInventory.forEach(({ itemId, quantity }) => {
      const inv = vendor.retailInventory.find(
        (i) => i.itemId.toString() === itemId.toString()
      );
      if (inv) inv.quantity -= quantity;
    });

    await vendor.save();

    // Update daily inventory report
    const inventoryReport = await ensureInventoryReport(vendorId);
    await updateInventoryForRetail(inventoryReport, retailSold);
    await updateInventoryForProduce(inventoryReport, produceSold);
    await inventoryReport.save();

    // Clear cart, add active order
    user.activeOrders.push(newOrder._id);
    user.cart = [];
    user.vendorId = null; // Clear the vendor association after order is placed
    await user.save();

    res
      .status(201)
      .json({ message: "Order placed successfully", orderId: newOrder._id });
  } catch (err) {
    console.error("Place order error:", err);
    res
      .status(500)
      .json({ message: "Server error placing order", error: err.message });
  }
};
