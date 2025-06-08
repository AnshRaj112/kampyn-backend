// utils/inventoryReportUtils.js
const mongoose = require("mongoose");
const InventoryReport = require("../models/inventory/InventoryReport");
const Vendor = require("../models/account/Vendor");
const Uni = require("../models/account/Uni");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");

/** normalize to midnight UTC */
function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** one millisecond before the next day’s midnight UTC */
function endOfDay(date) {
  const d = startOfDay(date);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCMilliseconds(d.getUTCMilliseconds() - 1);
  return d;
}

/**
 * Ensures one (and only one) report per vendor per calendar day:
 *  - If none exists in [00:00:00,23:59:59.999], creates it.
 *  - Otherwise leaves the existing doc alone.
 */
async function generateDailyReportForVendor(vendorId, targetDate = new Date()) {
  const dateUTC = startOfDay(targetDate);
  const tomorrowUTC = endOfDay(targetDate);
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  // look for any report on that date, regardless of time
  const existing = await InventoryReport.findOne({
    vendorId: vendorObjectId,
    date: { $gte: dateUTC, $lte: tomorrowUTC },
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
    .select("retailInventory")
    .exec();
  if (!vendor) throw new Error("Vendor not found");

  // attempt to find *yesterday’s* report by the same range trick:
  const yesterday = new Date(dateUTC);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yStart = startOfDay(yesterday);
  const yEnd = endOfDay(yesterday);

  const prev = await InventoryReport.findOne({
    vendorId: vendorObjectId,
    date: { $gte: yStart, $lte: yEnd },
  })
    .lean()
    .select("retailEntries.item retailEntries.closingQty")
    .exec();

  // build today’s entries
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

  // insert with the normalized midnight date
  await InventoryReport.collection.insertOne({
    vendorId,
    date: dateUTC,
    retailEntries,
    produceEntries: [],
    rawEntries: [],
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
 * Fetches a full report for one vendor+date, plus vendor name.
 */

async function getInventoryReport(vendorId, forDate) {
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const dayStart = startOfDay(forDate);
  const dayEnd = endOfDay(forDate);

  // 1) Find _any_ document on that day
  const report = await InventoryReport.findOne({
    vendorId: vendorObjectId,
    date: { $gte: dayStart, $lte: dayEnd },
  }).lean();
  if (!report) {
    throw new Error(
      `No inventory report found for vendor ${vendorId} on ${dayStart
        .toISOString()
        .slice(0, 10)}`
    );
  }

  // 2) Manually fetch vendor name
  const vendor = await Vendor.findById(vendorObjectId)
    .lean()
    .select("fullName");
  report.vendor = { _id: vendor._id, fullName: vendor.fullName };

  // 3) Resolve item names for retailEntries
  if (report.retailEntries?.length) {
    const ids = report.retailEntries.map((e) => e.item);
    const docs = await Retail.find({ _id: { $in: ids } })
      .lean()
      .select("name");
    const map = Object.fromEntries(docs.map((d) => [d._id.toString(), d.name]));
    report.retailEntries = report.retailEntries.map((e) => ({
      item: { _id: e.item, name: map[e.item.toString()] || null },
      openingQty: e.openingQty,
      closingQty: e.closingQty,
      soldQty: e.soldQty,
    }));
  }

  // 4) Resolve produceEntries similarly
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

  return report;
}

module.exports = {
  generateDailyReportForVendor,
  generateDailyReportForUni,
  getInventoryReport,
};
