const InventoryReport = require("../models/inventory/InventoryReport");
const Vendor = require("../models/account/Vendor"); // To fetch current inventory if needed

async function ensureInventoryReport(vendorId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  let report = await InventoryReport.findOne({
    vendorId,
    date: { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 86400000) }, // next day
  });

  if (!report) {
    // Fetch current vendor inventory to initialize report entries
    const vendor = await Vendor.findById(vendorId);

    report = new InventoryReport({
      vendorId,
      date: startOfDay,
      retailEntries: [],
      produceEntries: [],
    });

    // Initialize retailEntries with current inventory quantities as opening and closing qty
    for (const inv of vendor.retailInventory) {
      report.retailEntries.push({
        item: inv.itemId,
        openingQty: inv.quantity,
        closingQty: inv.quantity,
        soldQty: 0,
      });
    }

    // For produceEntries, no initial quantities, just empty soldQty
    for (const pInv of vendor.produceInventory) {
      report.produceEntries.push({
        item: pInv.itemId,
        soldQty: 0,
      });
    }

    await report.save();
  }

  return report;
}

async function updateInventoryForRetail(report, soldItems) {
  for (const { item, soldQty } of soldItems) {
    let entry = report.retailEntries.find(
      (e) => e.item.toString() === item.toString()
    );

    if (!entry) {
      // If item is missing from today's report, add it with 0 opening/closing but will subtract soldQty
      entry = {
        item,
        soldQty: 0,
        openingQty: 0,
        closingQty: 0,
      };
      report.retailEntries.push(entry);
    }

    entry.soldQty += soldQty;
    entry.closingQty -= soldQty;

    // Prevent negative closingQty
    if (entry.closingQty < 0) entry.closingQty = 0;
  }

  report.markModified("retailEntries");
}

async function updateInventoryForProduce(report, soldItems) {
  for (const { item, soldQty } of soldItems) {
    let entry = report.produceEntries.find(
      (e) => e.item.toString() === item.toString()
    );

    if (!entry) {
      entry = {
        item,
        soldQty: 0,
      };
      report.produceEntries.push(entry);
    }

    entry.soldQty += soldQty;
  }

  report.markModified("produceEntries");
}

module.exports = {
  ensureInventoryReport,
  updateInventoryForRetail,
  updateInventoryForProduce,
};
