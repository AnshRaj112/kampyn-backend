const mongoose = require("mongoose");
const Vendor = require("../models/account/Vendor");
const Order = require("../models/order/Order");
const InventoryReport = require("../models/inventory/InventoryReport");
const Retail = require("../models/item/Retail");
const logger = require("../utils/pinoLogger");

/**
 * Bulk transfer retail items from one vendor to another
  */
 exports.bulkTransferRetailItems = async (req, res) => {
  const { senderId, receiverId, items } = req.body;

  if (
    !senderId ||
    !receiverId ||
    !items ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "Sender, receiver, and items array are required." });
  }

  if (senderId === receiverId) {
    return res
      .status(400)
      .json({ error: "Sender and receiver must be different vendors." });
  }

  try {
    const sender = await Vendor.findById(senderId);
    const receiver = await Vendor.findById(receiverId);

    if (!sender)
      return res.status(404).json({ error: "Sender vendor not found." });
    if (!receiver)
      return res.status(404).json({ error: "Receiver vendor not found." });

    const transferredItems = [];

    for (let { itemId, quantity } of items) {
      if (!itemId || !quantity || quantity <= 0) {
        return res.status(400).json({
          error: "Each item must have a valid itemId and quantity > 0.",
        });
      }

      const retailItem = await Retail.findById(itemId);
      if (!retailItem) {
        return res
          .status(404)
          .json({ error: `Retail item with ID ${itemId} does not exist.` });
      }

      const senderItem = sender.retailInventory.find(
        (inv) => inv.itemId && inv.itemId.toString() === itemId.toString()
      );
      if (!senderItem) {
        return res.status(404).json({
          error: `Item ${retailItem.name} not found in sender's inventory.`,
        });
      }

      if (senderItem.quantity < quantity) {
        return res
          .status(400)
          .json({ error: `Not enough quantity for item ${retailItem.name}.` });
      }

      // Reduce from sender now; do NOT add to receiver until confirmation
      senderItem.quantity -= quantity;

      transferredItems.push({
        itemId,
        kind: "Retail",
        quantity,
      });
    }

    // Save only sender changes here. Receiver will be updated on confirmation.
    await sender.save();

    const orderNumber = `TRF-${Date.now()}`;
    const newOrder = new Order({
      orderNumber,
      userId: sender._id,
      orderType: "cash",
      orderCategory: "transfer",
      paymentMethod: "cash",
      collectorName: receiver.fullName,
      collectorPhone: receiver.phone || "N/A",
      items: transferredItems,
      total: 0,
      vendorId: sender._id,
      isGuest: false,
      status: "onTheWay",
    });
    await newOrder.save();

    const start = startOfDay(new Date());
    await InventoryReport.findOneAndUpdate(
      { vendorId: sender._id, date: { $gte: start } },
      {
        $push: { itemSend: { $each: transferredItems.map(t => ({ ...t, targetVendorId: receiver._id, targetVendorName: receiver.fullName, date: new Date() })) } },
        $setOnInsert: { retailEntries: [], produceEntries: [], rawEntries: [] },
      },
      { upsert: true, new: true }
    );

    // Do not update receiver's report yet. That happens on confirmation.

    return res.status(200).json({
      message: "Transfer initiated. Awaiting receiver confirmation.",
      orderId: newOrder._id,
      transferredItems,
    });
  } catch (error) {
    logger.error("Bulk transfer error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get transfer orders for receiver
 */
exports.getTransferOrdersForReceiver = async (req, res) => {
  const { receiverId } = req.params;

  if (!receiverId) {
    return res.status(400).json({ error: "Receiver ID is required." });
  }

  try {
    const receiver = await Vendor.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ error: "Receiver vendor not found." });
    }

    const orders = await Order.find({
      orderCategory: "transfer",
      collectorName: receiver.fullName,
      status: { $in: ["onTheWay", "pending"] },
    }).sort({ createdAt: -1 });

    // Populate item details for each order
    const populatedOrders = await Promise.all(
      orders.map(async (order) => {
        const orderObj = order.toObject();
        
        // Populate item details based on kind
        if (orderObj.items && orderObj.items.length > 0) {
          const populatedItems = await Promise.all(
            orderObj.items.map(async (item) => {
              try {
                let itemDetails = null;
                
                if (item.kind === "Retail") {
                  const Retail = require("../models/item/Retail");
                  itemDetails = await Retail.findById(item.itemId);
                } else if (item.kind === "Produce") {
                  const Produce = require("../models/item/Produce");
                  itemDetails = await Produce.findById(item.itemId);
                }
                
                return {
                  ...item,
                  itemName: itemDetails ? itemDetails.name : "Unknown Item",
                  itemType: itemDetails ? itemDetails.type : "Unknown Type",
                  unit: itemDetails ? itemDetails.unit : "pcs"
                };
              } catch (err) {
                logger.error(`Error populating item ${item.itemId}:`, err);
                return {
                  ...item,
                  itemName: "Unknown Item",
                  itemType: "Unknown Type",
                  unit: "pcs"
                };
              }
            })
          );
          
          orderObj.items = populatedItems;
        }
        
        return orderObj;
      })
    );

    return res.status(200).json({
      message: "Transfer orders fetched successfully",
      orders: populatedOrders,
    });
  } catch (error) {
    logger.error("Get transfer orders error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/* ----------------- Confirm transfer ----------------- */

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Confirm transfer order
 * - Adds items to receiver inventory at confirmation time
 * - Computes opening/closing and updates InventoryReport for both parties
 * - Marks order completed
 */
exports.confirmTransfer = async (req, res) => {
  try {
    const { orderId, receiverVendorId } = req.body;
    if (!orderId || !receiverVendorId) {
      return res
        .status(400)
        .json({ error: "orderId and receiverVendorId are required." });
    }

    // 1. Fetch order
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found." });

    // Guard: ensure both IDs exist before .toString()
    if (!order.vendorId || !receiverVendorId) {
      return res.status(400).json({ error: "Invalid vendor IDs provided." });
    }

    // 2. Validate sender/receiver
    if (order.vendorId.toString() === receiverVendorId.toString()) {
      return res.status(400).json({ error: "Sender cannot confirm receipt." });
    }
    if (order.status !== "onTheWay") {
      return res
        .status(400)
        .json({ error: "Only 'onTheWay' orders can be confirmed." });
    }

    // 3. Fetch vendors (we WILL mutate receiver inventory here)
    const senderVendor = await Vendor.findById(order.vendorId);
    const receiverVendor = await Vendor.findById(receiverVendorId);
    if (!senderVendor || !receiverVendor) {
      return res.status(404).json({ error: "Vendor(s) not found." });
    }

    // 3a. Apply receiver inventory increments now
    for (const item of order.items || []) {
      if (item.kind !== "Retail" || !item.itemId) continue;
      const receiverItem = receiverVendor.retailInventory.find(
        (inv) => inv.itemId && inv.itemId.toString() === item.itemId.toString()
      );
      if (receiverItem) {
        receiverItem.quantity += item.quantity;
      } else {
        receiverVendor.retailInventory.push({
          itemId: item.itemId,
          quantity: item.quantity,
          isSpecial: "N",
          isAvailable: "Y",
        });
      }
    }

    const start = startOfDay(new Date());
    const end = endOfDay(new Date());

    // 4. Fetch or create reports (same-day range)
    let senderReport = await InventoryReport.findOne({
      vendorId: senderVendor._id,
      date: { $gte: start, $lte: end },
    });
    if (!senderReport) {
      senderReport = new InventoryReport({
        vendorId: senderVendor._id,
        date: start,
        retailEntries: [],
        produceEntries: [],
        rawEntries: [],
        itemSend: [],
        itemReceived: [],
      });
    }

    let receiverReport = await InventoryReport.findOne({
      vendorId: receiverVendor._id,
      date: { $gte: start, $lte: end },
    });
    if (!receiverReport) {
      receiverReport = new InventoryReport({
        vendorId: receiverVendor._id,
        date: start,
        retailEntries: [],
        produceEntries: [],
        rawEntries: [],
        itemSend: [],
        itemReceived: [],
      });
    }

    // 5. For each item, compute opening/closing from current vendor inventory (post-transfer)
    for (const item of order.items || []) {
      if (item.kind !== "Retail" || !item.itemId) {
        logger.warn("Skipping item without valid kind/itemId:", item);
        continue;
      }

      // Current quantities in vendor inventories (these reflect the result of bulkTransfer)
      const senderInv = senderVendor.retailInventory.find(
        (inv) => inv.itemId && inv.itemId.toString() === item.itemId.toString()
      );
      const receiverInv = receiverVendor.retailInventory.find(
        (inv) => inv.itemId && inv.itemId.toString() === item.itemId.toString()
      );

      // Use current quantities (post-transfer). If missing, fallback safely.
      const senderCurrentQty = senderInv ? senderInv.quantity : 0;
      const receiverCurrentQty = receiverInv ? receiverInv.quantity : 0;

      // opening = before sending, closing = after sending (since bulkTransfer mutated inventory earlier)
      const senderOpening = senderCurrentQty + item.quantity;
      const senderClosing = senderCurrentQty;

      const receiverOpening = receiverCurrentQty - item.quantity;
      const receiverClosing = receiverCurrentQty;

      // --- Sender: itemSend handling (dedupe & confirm) ---
      const existingSenderSend = Array.isArray(senderReport.itemSend)
        ? senderReport.itemSend.find(
            (s) => s.itemId && s.itemId.toString() === item.itemId.toString()
          )
        : null;

      if (!existingSenderSend) {
        senderReport.itemSend.push({
          itemId: item.itemId,
          kind: "Retail",
          quantity: item.quantity,
          date: new Date(),
          confirmed: true,
          targetVendorId: receiverVendor._id,
          targetVendorName: receiverVendor.fullName,
        });
      } else {
        if (!existingSenderSend.confirmed) existingSenderSend.confirmed = true;
        if (!existingSenderSend.targetVendorId) {
          existingSenderSend.targetVendorId = receiverVendor._id;
          existingSenderSend.targetVendorName = receiverVendor.fullName;
        }
      }

      // Update/create sender retailEntries - transfers should NOT increment soldQty
      let senderEntry = (senderReport.retailEntries || []).find(
        (e) => e.item && e.item.toString() === item.itemId.toString()
      );

      if (!senderEntry) {
        senderReport.retailEntries.push({
          item: item.itemId,
          openingQty: senderOpening,
          closingQty: senderClosing,
          soldQty: 0,
        });
      } else {
        // Don't increment soldQty for transfers
        senderEntry.openingQty = senderEntry.openingQty || senderOpening;
        senderEntry.closingQty = senderClosing;
      }

      // --- Receiver: itemReceived handling (dedupe & confirm) ---
      const existingReceiverRecv = Array.isArray(receiverReport.itemReceived)
        ? receiverReport.itemReceived.find(
            (r) => r.itemId && r.itemId.toString() === item.itemId.toString()
          )
        : null;

      if (!existingReceiverRecv) {
        receiverReport.itemReceived.push({
          itemId: item.itemId,
          kind: "Retail",
          quantity: item.quantity,
          date: new Date(),
          confirmed: true,
          source: "received",
          sourceVendorId: senderVendor._id,
          sourceVendorName: senderVendor.fullName,
        });
      } else {
        if (!existingReceiverRecv.confirmed)
          existingReceiverRecv.confirmed = true;
        if (!existingReceiverRecv.sourceVendorId) {
          existingReceiverRecv.sourceVendorId = senderVendor._id;
          existingReceiverRecv.sourceVendorName = senderVendor.fullName;
        }
      }

      // Update/create receiver retailEntries (soldQty stays 0 for receiver on transfers)
      let receiverEntry = (receiverReport.retailEntries || []).find(
        (e) => e.item && e.item.toString() === item.itemId.toString()
      );
      if (!receiverEntry) {
        receiverReport.retailEntries.push({
          item: item.itemId,
          openingQty: receiverOpening,
          closingQty: receiverClosing,
          soldQty: 0,
        });
      } else {
        receiverEntry.openingQty = receiverEntry.openingQty || receiverOpening;
        receiverEntry.closingQty = receiverClosing;
      }
    }

    // 6. Save changes (save receiver vendor inventory + reports)
    await Promise.all([receiverVendor.save(), senderReport.save(), receiverReport.save()]);

    // 7. Mark order completed
    order.status = "completed";
    await order.save();

    return res.json({
      message: "Transfer confirmed and inventory/reports updated successfully.",
    });
  } catch (err) {
    logger.error("Confirm transfer error:", err);
    return res.status(500).json({ error: "Server error." });
  }
};

// Utility to mimic mongoose findOrCreate (if you still want it)
mongoose.Model.findOrCreate = async function (filter, doc) {
  let found = await this.findOne(filter);
  if (!found) {
    found = new this(doc);
    await found.save();
  }
  return [found];
};
