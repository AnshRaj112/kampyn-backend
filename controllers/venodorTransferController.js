const mongoose = require("mongoose");
const Vendor = require("../models/account/Vendor");
const Order = require("../models/order/Order");
const InventoryReport = require("../models/inventory/InventoryReport");
const Retail = require("../models/item/Retail");

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

      // mutate vendor inventories here (this is the authoritative inventory change)
      senderItem.quantity -= quantity;

      const receiverItem = receiver.retailInventory.find(
        (inv) => inv.itemId && inv.itemId.toString() === itemId.toString()
      );
      if (receiverItem) {
        receiverItem.quantity += quantity;
      } else {
        receiver.retailInventory.push({
          itemId,
          quantity,
          isSpecial: "N",
          isAvailable: "Y",
        });
      }

      transferredItems.push({
        itemId,
        kind: "Retail",
        quantity,
      });
    }

    // save vendor changes
    await sender.save();
    await receiver.save();

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
        $push: { itemSend: { $each: transferredItems } },
        $setOnInsert: { retailEntries: [], produceEntries: [], rawEntries: [] },
      },
      { upsert: true, new: true }
    );

    await InventoryReport.findOneAndUpdate(
      { vendorId: receiver._id, date: { $gte: start } },
      {
        $push: { itemReceived: { $each: transferredItems } },
        $setOnInsert: { retailEntries: [], produceEntries: [], rawEntries: [] },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      message: "Bulk transfer completed successfully",
      orderId: newOrder._id,
      transferredItems,
    });
  } catch (error) {
    console.error("Bulk transfer error:", error);
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

    return res.status(200).json({
      message: "Transfer orders fetched successfully",
      orders,
    });
  } catch (error) {
    console.error("Get transfer orders error:", error);
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
 * Confirm transfer order - InventoryReport based
 * - This function NO LONGER mutates vendor inventories (bulkTransfer already did)
 * - It calculates opening/closing based on current vendor inventory (post-transfer)
 * - It marks itemSend/itemReceived as confirmed and increments sender soldQty once
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

    // 3. Fetch vendors (we will NOT mutate their inventories here)
    const senderVendor = await Vendor.findById(order.vendorId);
    const receiverVendor = await Vendor.findById(receiverVendorId);
    if (!senderVendor || !receiverVendor) {
      return res.status(404).json({ error: "Vendor(s) not found." });
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
        console.warn("Skipping item without valid kind/itemId:", item);
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
        });
      } else {
        if (!existingSenderSend.confirmed) existingSenderSend.confirmed = true;
      }

      // Update/create sender retailEntries and increment soldQty only once
      let senderEntry = (senderReport.retailEntries || []).find(
        (e) => e.item && e.item.toString() === item.itemId.toString()
      );

      const newlyConfirmedForSold =
        !existingSenderSend ||
        (existingSenderSend && !existingSenderSend._wasConfirmedForSoldUpdate);

      if (!senderEntry) {
        senderReport.retailEntries.push({
          item: item.itemId,
          openingQty: senderOpening,
          closingQty: senderClosing,
          soldQty: newlyConfirmedForSold ? item.quantity : 0,
        });
        if (existingSenderSend)
          existingSenderSend._wasConfirmedForSoldUpdate = true;
      } else {
        if (newlyConfirmedForSold) {
          senderEntry.soldQty = (senderEntry.soldQty || 0) + item.quantity;
          if (existingSenderSend)
            existingSenderSend._wasConfirmedForSoldUpdate = true;
        }
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
        });
      } else {
        if (!existingReceiverRecv.confirmed)
          existingReceiverRecv.confirmed = true;
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

    // 6. Save changes (reports + vendors are already accurate from bulkTransfer - we still save reports)
    await Promise.all([senderReport.save(), receiverReport.save()]);

    // 7. Mark order completed
    order.status = "completed";
    await order.save();

    return res.json({
      message: "Transfer confirmed and inventory/reports updated successfully.",
    });
  } catch (err) {
    console.error("Confirm transfer error:", err);
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
