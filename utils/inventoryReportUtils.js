// utils/inventoryReportUtils.js
const mongoose = require("mongoose");
const InventoryReport = require("../models/inventory/InventoryReport");
const Vendor = require("../models/account/Vendor");
const Uni = require("../models/account/Uni");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const Raw = require("../models/item/Raw");

/** normalize to midnight IST (Indian Standard Time) */
function startOfDay(date) {
  const d = new Date(date);
  // Set to midnight in IST (UTC+5:30)
  d.setHours(0, 0, 0, 0);
  return d;
}

/** one millisecond before the next day's midnight IST */
function endOfDay(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  d.setMilliseconds(d.getMilliseconds() - 1);
  return d;
}

/** Format date as YYYY-MM-DD in IST */
function formatDateIST(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Clear raw material inventory for all vendors at the end of each day
 * This ensures vendors start fresh each day with raw materials
 */
async function clearRawMaterialInventory() {
  try {
    console.info(`🧹 Starting raw material inventory clearing process at ${new Date().toISOString()}`);
    
    // First, generate reports for all vendors to capture current raw material data
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1); // Use yesterday's date for the report
    
    console.info(`📊 Generating final reports for ${yesterday.toISOString().split('T')[0]} before clearing`);
    await generateReportsForAllVendors(yesterday);
    
    console.info(`🧹 Clearing raw material inventory for all vendors`);
    
    // Clear rawMaterialInventory array for all vendors
    const result = await Vendor.updateMany(
      {}, // Update all vendors
      { $set: { rawMaterialInventory: [] } }
    );
    
    console.info(`✅ Cleared raw material inventory for ${result.modifiedCount} vendors`);
    return result.modifiedCount;
  } catch (error) {
    console.error("❌ Error clearing raw material inventory:", error);
    throw error;
  }
}

/**
 * Schedule daily raw material inventory clearing
 * Runs at 12:01 AM IST (start of new day) to clear after reports are generated
 */
function scheduleRawMaterialClearing() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 1, 0, 0); // 12:01 AM IST - after midnight
  
  const timeUntilMidnight = tomorrow.getTime() - now.getTime();
  
  console.info(`⏰ Next raw material clearing scheduled for ${tomorrow.toISOString()}`);
  console.info(`⏰ Time until clearing: ${Math.floor(timeUntilMidnight / (1000 * 60 * 60))} hours, ${Math.floor((timeUntilMidnight % (1000 * 60 * 60)) / (1000 * 60))} minutes`);
  
  // Schedule the first clearing
  setTimeout(async () => {
    try {
      await clearRawMaterialInventory();
      console.info("✅ Daily raw material clearing completed successfully");
    } catch (error) {
      console.error("❌ Error during scheduled raw material clearing:", error);
    }
  }, timeUntilMidnight);
  
  // Then schedule it to run every 24 hours
  setInterval(async () => {
    try {
      await clearRawMaterialInventory();
      console.info("✅ Daily raw material clearing completed successfully");
    } catch (error) {
      console.error("❌ Error during scheduled raw material clearing:", error);
    }
  }, 24 * 60 * 60 * 1000);
}

/**
 * Initialize the daily clearing schedule
 * Call this when the server starts
 */
function initializeDailyClearing() {
  scheduleRawMaterialClearing();
}

/**
 * Ensures one (and only one) report per vendor per calendar day:
 *  - If none exists in [00:00:00,23:59:59.999], creates it.
 *  - Otherwise leaves the existing doc alone.
 */
async function generateDailyReportForVendor(vendorId, targetDate = new Date()) {
  const dateIST = startOfDay(targetDate);
  const tomorrowIST = endOfDay(targetDate);
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  // look for any report on that date, regardless of time
  const existing = await InventoryReport.findOne({
    vendorId: vendorObjectId,
    date: { $gte: dateIST, $lte: tomorrowIST },
  })
    .lean()
    .select("_id");

  if (existing) {
    // already have one today — do nothing
    return { created: false };
  }

  // otherwise build a fresh report
  const vendor = await Vendor.findById(vendorObjectId)
    .lean()
    .select("retailInventory rawMaterialInventory")
    .exec();
  if (!vendor) throw new Error("Vendor not found");

  // attempt to find *yesterday's* report by the same range trick:
  const yesterday = new Date(dateIST);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStart = startOfDay(yesterday);
  const yEnd = endOfDay(yesterday);

  const prev = await InventoryReport.findOne({
    vendorId: vendorObjectId,
    date: { $gte: yStart, $lte: yEnd },
  })
    .lean()
    .select("retailEntries.item retailEntries.closingQty rawEntries.item rawEntries.closingQty")
    .exec();

  // build today's entries
  const retailEntries = vendor.retailInventory.map((r) => {
    const prevE = prev?.retailEntries.find(
      (e) => e.item.toString() === r.itemId.toString()
    );
    const qty = prevE ? prevE.closingQty : r.quantity;
    return {
      item: r.itemId,
      openingQty: qty,
      closingQty: qty,
      soldQty: 0,
    };
  });

  // build raw material entries
  let rawEntries = [];
  
  // First, check if we have current raw material inventory data
  if (vendor.rawMaterialInventory && vendor.rawMaterialInventory.length > 0) {
    // Use current day's raw material data
    rawEntries = vendor.rawMaterialInventory.map((r) => {
      const prevE = prev?.rawEntries.find(
        (e) => e.item.toString() === r.itemId.toString()
      );
      // Use previous day's closing as opening, or current opening if no previous data
      const openingQty = prevE ? prevE.closingQty : r.openingAmount;
      const closingQty = r.closingAmount;
      
      return {
        item: r.itemId,
        openingQty: openingQty,
        closingQty: closingQty,
      };
    });
  } else if (prev && prev.rawEntries && prev.rawEntries.length > 0) {
    // No current raw material data, but we have previous day's data
    // This happens when raw materials were cleared but we need to show continuity
    rawEntries = prev.rawEntries.map((r) => {
      // Try to find current raw material data for this item
      const currentRaw = vendor.rawMaterialInventory?.find(
        (current) => current.itemId.toString() === r.item.toString()
      );
      
      const openingQty = r.closingQty; // Previous day's closing becomes today's opening
      const closingQty = currentRaw ? currentRaw.closingAmount : r.closingQty; // Use current closing or previous closing
      
      return {
        item: r.item,
        openingQty: openingQty,
        closingQty: closingQty,
      };
    });
  }
  // If neither current nor previous data exists, rawEntries remains empty

  // insert with the normalized midnight date
  await InventoryReport.collection.insertOne({
    vendorId,
    date: dateIST,
    retailEntries,
    produceEntries: [],
    rawEntries,
    itemReceived: [],
    itemSend: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { created: true };
}

/**
 * Run generateDailyReportForVendor on every vendor in the Uni.
 */
async function generateDailyReportForUni(uniId, targetDate = new Date()) {
  const Uni = require("../models/account/Uni");
  const uni = await Uni.findById(uniId)
    .lean()
    .select("vendors.vendorId")
    .exec();
  if (!uni) throw new Error("University not found");

  const results = await Promise.all(
    uni.vendors.map((v) => generateDailyReportForVendor(v.vendorId, targetDate))
  );

  return {
    total: results.length,
    created: results.filter((r) => r.created).length,
    added: results.reduce((sum, r) => sum + (r.added || 0), 0),
  };
}
/**
 * Fetches a full report for one vendor+date, always returning vendor details.
 * If no report exists for the given date, returns an object with vendor info and an error message.
 */
async function getInventoryReport(vendorId, forDate) {
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  // 1) Always fetch vendor name first
  const vendor = await Vendor.findById(vendorObjectId)
    .lean()
    .select("fullName");
  if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

  // Use today's date if no date provided
  const targetDate = forDate ? new Date(forDate) : new Date();
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  // 2) Try to find any document on that day
  const report = await InventoryReport.findOne({
    vendorId: vendorObjectId,
    date: { $gte: dayStart, $lte: dayEnd },
  }).lean();

  if (!report) {
    // Return vendor info and error instead of throwing
    const formattedDate = formatDateIST(dayStart);
    
    return {
      vendor: { _id: vendor._id, fullName: vendor.fullName },
      date: formattedDate,
      error: `No inventory report found for vendor ${vendorId} on ${formattedDate}`,
    };
  }

  // 3) Attach vendor info and format date
  report.vendor = { _id: vendor._id, fullName: vendor.fullName };
  report.date = formatDateIST(report.date);

  // 4) Resolve item names for retailEntries and build entries from movements if missing
  {
    report.retailEntries = Array.isArray(report.retailEntries) ? report.retailEntries : [];

    // Calculate received and produced amounts from itemReceived array
    const receivedMap = new Map();
    const producedMap = new Map();
    if (report.itemReceived?.length) {
      report.itemReceived.forEach((received) => {
        if (received.kind === "Retail") {
          const itemId = received.itemId.toString();
          if (received.source === "produced") {
            producedMap.set(itemId, (producedMap.get(itemId) || 0) + received.quantity);
          } else {
            receivedMap.set(itemId, (receivedMap.get(itemId) || 0) + received.quantity);
          }
        }
      });
    }

    // Calculate sent amounts from itemSend array
    const sentMap = new Map();
    if (report.itemSend?.length) {
      report.itemSend.forEach((sent) => {
        if (sent.kind === "Retail") {
          const itemId = sent.itemId.toString();
          sentMap.set(itemId, (sentMap.get(itemId) || 0) + sent.quantity);
        }
      });
    }

    // Ensure any items that have movements (produced/received/sent) are present as entries
    const existingEntryIds = new Set(report.retailEntries.map((e) => e.item.toString()));
    const movementIds = new Set([
      ...Array.from(receivedMap.keys()),
      ...Array.from(producedMap.keys()),
      ...Array.from(sentMap.keys()),
    ]);

    // Fetch previous day's closing map for openingQty inference
    const y = new Date(dayStart);
    y.setDate(y.getDate() - 1);
    const yStart = startOfDay(y);
    const yEnd = endOfDay(y);
    let prevDayClosingMap = new Map();
    const prevDay = await InventoryReport.findOne({
      vendorId: vendorObjectId,
      date: { $gte: yStart, $lte: yEnd },
    }).lean();
    if (prevDay?.retailEntries?.length) {
      prevDayClosingMap = new Map(
        prevDay.retailEntries.map((e) => [e.item.toString(), e.closingQty || 0])
      );
    }

    movementIds.forEach((id) => {
      if (!existingEntryIds.has(id)) {
        const openingQty = prevDayClosingMap.get(id) || 0;
        const receivedQty = receivedMap.get(id) || 0;
        const producedQty = producedMap.get(id) || 0;
        const soldQty = 0;
        const sentQty = sentMap.get(id) || 0;
        const closingQty = openingQty + receivedQty + producedQty - soldQty - sentQty;
        report.retailEntries.push({
          item: new mongoose.Types.ObjectId(id),
          openingQty,
          closingQty,
          soldQty,
        });
        existingEntryIds.add(id);
      }
    });

    const ids = report.retailEntries.map((e) => e.item);
    const docs = await Retail.find({ _id: { $in: ids } })
      .lean()
      .select("name");
    const map = Object.fromEntries(docs.map((d) => [d._id.toString(), d.name]));

    report.retailEntries = report.retailEntries.map((e) => {
      const openingQty = e.openingQty || 0;
      const soldQty = e.soldQty || 0;
      const receivedQty = receivedMap.get(e.item.toString()) || 0;
      const producedQty = producedMap.get(e.item.toString()) || 0;
      const sentQty = sentMap.get(e.item.toString()) || 0;
      // Calculate closing from conservation: closing = opening + produced + received - sold - sent
      const closingQty = openingQty + producedQty + receivedQty - soldQty - sentQty;
      return {
        item: { _id: e.item, name: map[e.item.toString()] || null },
        openingQty,
        closingQty,
        soldQty,
        receivedQty,
        producedQty,
      };
    });
  }

  // 5) Resolve produceEntries similarly
  if (report.produceEntries?.length) {
    const ids = report.produceEntries.map((e) => e.item);
    const docs = await Produce.find({ _id: { $in: ids } })
      .lean()
      .select("name");
    const map = Object.fromEntries(docs.map((d) => [d._id.toString(), d.name]));
    report.produceEntries = report.produceEntries.map((e) => ({
      item: { _id: e.item, name: map[e.item.toString()] || null },
      soldQty: e.soldQty,
    }));
  }

  // 6) Resolve rawEntries similarly
  if (report.rawEntries?.length) {
    const ids = report.rawEntries.map((e) => e.item);
    const docs = await Raw.find({ _id: { $in: ids } })
      .lean()
      .select("name unit");
    const map = Object.fromEntries(docs.map((d) => [d._id.toString(), d]));
    report.rawEntries = report.rawEntries.map((e) => ({
      item: { 
        _id: e.item, 
        name: map[e.item.toString()]?.name || null,
        unit: map[e.item.toString()]?.unit || null
      },
      openingQty: e.openingQty,
      closingQty: e.closingQty,
    }));
  }

  // 6.5) Aggregate received from vendor sources for reporting
  if (Array.isArray(report.itemReceived) && report.itemReceived.length) {
    const retailReceived = report.itemReceived.filter((r) => r.kind === "Retail" && r.source === "received");
    if (retailReceived.length) {
      const receivedFromMap = new Map(); // "itemId_sourceVendorId" -> { itemId, qty, fromVendor }
      const nameCache = new Map();

      for (const r of retailReceived) {
        const itemIdStr = r.itemId.toString();
        if (r.sourceVendorId) {
          const key = `${itemIdStr}_${r.sourceVendorId.toString()}`;
          const existing = receivedFromMap.get(key);
          if (existing) {
            existing.quantity += (r.quantity || 0);
          } else {
            receivedFromMap.set(key, {
              itemId: r.itemId,
              quantity: r.quantity || 0,
              fromVendorId: r.sourceVendorId,
              fromVendorName: r.sourceVendorName || null,
            });
          }
        }
      }

      if (receivedFromMap.size > 0) {
        const allItemIds = Array.from(new Set(Array.from(receivedFromMap.values()).map(v => v.itemId.toString())));
        const itemIds = allItemIds.map((id) => new mongoose.Types.ObjectId(id));
        const retailDocs = await Retail.find({ _id: { $in: itemIds } }).lean().select("name");
        retailDocs.forEach((d) => nameCache.set(d._id.toString(), d.name));

        report.receivedFrom = Array.from(receivedFromMap.values()).map((row) => ({
          item: { _id: row.itemId, name: nameCache.get(row.itemId.toString()) || null },
          quantity: row.quantity,
          from: row.fromVendorId ? { _id: row.fromVendorId, name: row.fromVendorName || null } : null,
        }));
      }
    }
  }

  // 7) Aggregate vendor-to-vendor retail sends for reporting
  if (Array.isArray(report.itemSend) && report.itemSend.length) {
    const retailSends = report.itemSend.filter((s) => s.kind === "Retail");
    if (retailSends.length) {
      // Group totals by item
      const sentByItem = new Map(); // itemId -> qty
      // Group by item+targetVendor combination
      const sentToMap = new Map(); // "itemId_targetVendorId" -> { itemId, qty, toVendor }
      const nameCache = new Map();

      for (const s of retailSends) {
        const itemIdStr = s.itemId.toString();
        sentByItem.set(itemIdStr, (sentByItem.get(itemIdStr) || 0) + (s.quantity || 0));

        // Aggregate by item+vendor
        if (s.targetVendorId) {
          const key = `${itemIdStr}_${s.targetVendorId.toString()}`;
          const existing = sentToMap.get(key);
          if (existing) {
            existing.quantity += (s.quantity || 0);
          } else {
            sentToMap.set(key, {
              itemId: s.itemId,
              quantity: s.quantity || 0,
              toVendorId: s.targetVendorId,
              toVendorName: s.targetVendorName || null,
            });
          }
        }
      }

      // Resolve item names
      const allItemIds = new Set([...sentByItem.keys(), ...Array.from(sentToMap.values()).map(v => v.itemId.toString())]);
      const itemIds = Array.from(allItemIds).map((id) => new mongoose.Types.ObjectId(id));
      const retailDocs = await Retail.find({ _id: { $in: itemIds } }).lean().select("name");
      retailDocs.forEach((d) => nameCache.set(d._id.toString(), d.name));

      report.sent = Array.from(sentByItem.entries()).map(([itemId, qty]) => ({
        item: { _id: itemId, name: nameCache.get(itemId) || null },
        quantity: qty,
      }));

      report.sentTo = Array.from(sentToMap.values()).map((row) => ({
        item: { _id: row.itemId, name: nameCache.get(row.itemId.toString()) || null },
        quantity: row.quantity,
        to: row.toVendorId ? { _id: row.toVendorId, name: row.toVendorName || null } : null,
      }));
    }
  }

  return report;
}

/**
 * Generate reports for all vendors to capture raw material data before clearing
 * This should be called before the daily clearing to ensure data is captured
 */
async function generateReportsForAllVendors(targetDate = new Date()) {
  try {
    console.info(`📊 Generating inventory reports for all vendors at ${new Date().toISOString()}`);
    
    const vendors = await Vendor.find({}).select('_id fullName').lean();
    console.info(`📊 Found ${vendors.length} vendors to process`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const vendor of vendors) {
      try {
        const result = await generateDailyReportForVendor(vendor._id, targetDate);
        if (result.created || result.added) {
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Error generating report for vendor ${vendor._id} (${vendor.fullName}):`, error.message);
        errorCount++;
      }
    }
    
    console.info(`✅ Report generation completed: ${successCount} successful, ${errorCount} errors`);
    return { successCount, errorCount, total: vendors.length };
  } catch (error) {
    console.error("❌ Error in generateReportsForAllVendors:", error);
    throw error;
  }
}

module.exports = {
  generateDailyReportForVendor,
  generateDailyReportForUni,
  getInventoryReport,
  clearRawMaterialInventory,
  scheduleRawMaterialClearing,
  initializeDailyClearing,
  generateReportsForAllVendors,
};
