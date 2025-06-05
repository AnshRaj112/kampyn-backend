// src/utils/inventoryUtils.js

const Vendor = require("../models/Vendor");
const InventoryReport = require("../models/InventoryReport");

/**
 * Atomically decrement retail inventory for a given vendorId + itemId
 */
async function decrementRetailInventory(vendorId, itemId, quantity) {
  return Vendor.updateOne(
    {
      _id: vendorId,
      "retailInventory.itemId": itemId,
      "retailInventory.quantity": { $gte: quantity },
    },
    { $inc: { "retailInventory.$.quantity": -quantity } }
  );
}

/**
 * Set produce availability to "N"
 */
async function markProduceSold(vendorId, itemId) {
  return Vendor.updateOne(
    {
      _id: vendorId,
      "produceInventory.itemId": itemId,
      "produceInventory.isAvailable": "Y",
    },
    { $set: { "produceInventory.$.isAvailable": "Y" } }
  );
}

/**
 * Update or create today's InventoryReport entry for vendorId
 */
async function updateInventoryReport(vendorId, soldItems) {
  // soldItems: Array<{ itemId, kind, quantity }>
  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(0, 0, 0, 0);

  let invReport = await InventoryReport.findOne({
    vendorId,
    date: {
      $gte: todayAtMidnight,
      $lt: new Date(todayAtMidnight.getTime() + 24 * 60 * 60 * 1000),
    },
  });

  if (!invReport) {
    invReport = await InventoryReport.create({ vendorId, date: new Date() });
  }

  // we can copy‐paste the logic shown earlier,
  // or call a helper that merges soldItems into invReport.retailEntries/produceEntries
  // for brevity, see `orderUtils.postPaymentProcessing`.
}

module.exports = {
  decrementRetailInventory,
  markProduceSold,
  updateInventoryReport,
};
