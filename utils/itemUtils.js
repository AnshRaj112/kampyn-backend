// utils/itemUtils.js

const mongoose = require("mongoose");
const Vendor = require("../models/account/Vendor");
const Uni = require("../models/account/Uni");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");

/**
 * Safely convert a string to ObjectId.
 * Throws if the string is not a valid ObjectId.
 */
function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Malformed ObjectId "${id}".`);
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * Verify that the vendor exists, and that in its Uni.vendors array,
 * there is an entry { vendorId: <this vendor>, isAvailable: "Y" }.
 *
 * Throws if Uni not found, or vendor not listed or marked unavailable.
 */
async function assertVendorAvailableInUni(vendorId, uniId) {
  console.log(`Checking vendor ${vendorId} availability in uni ${uniId}`);
  
  const uni = await Uni.findById(uniId).select("vendors").lean();
  if (!uni) {
    console.log(`Uni ${uniId} not found`);
    throw new Error(`Uni with ID ${uniId} not found.`);
  }

  console.log(`Uni ${uniId} vendors:`, uni.vendors);
  
  const entry = (uni.vendors || []).find(
    (v) => String(v.vendorId) === String(vendorId)
  );
  
  if (!entry) {
    console.log(`Vendor ${vendorId} not found in uni ${uniId} vendors list`);
    throw new Error(`Vendor ${vendorId} is not registered under Uni ${uniId}.`);
  }
  
  if (entry.isAvailable !== "Y") {
    console.log(`Vendor ${vendorId} is marked as unavailable in uni ${uniId}`);
    throw new Error(
      `Vendor ${vendorId} is currently unavailable under Uni ${uniId}.`
    );
  }
  
  console.log(`Vendor ${vendorId} is available in uni ${uniId}`);
}

async function getItemsForVendorId(vendorId) {
  const vOid = toObjectId(vendorId);

  // 1. Fetch vendor (minimal fields)
  const vendor = await Vendor.findById(vOid)
    .select("fullName uniID retailInventory produceInventory")
    .lean();
  if (!vendor) throw new Error(`Vendor ${vendorId} not found.`);

  await assertVendorAvailableInUni(vOid, vendor.uniID);

  // 2. Extract item IDs for batch lookup
  const retailEntries = (vendor.retailInventory || []).filter(
    (entry) => entry.quantity > 0
  );
  const produceEntries = (vendor.produceInventory || []).filter(
    (entry) => entry.isAvailable === "Y"
  );

  const retailItemIdSet = new Set(retailEntries.map((e) => String(e.itemId)));
  const produceItemIdSet = new Set(produceEntries.map((e) => String(e.itemId)));

  // 3. Batch fetch item data
  const [retailDocs, produceDocs] = await Promise.all([
    Retail.find({
      _id: { $in: Array.from(retailItemIdSet).map(toObjectId) },
      uniId: vendor.uniID,
    })
      .select("name type unit price image")
      .lean(),
    Produce.find({
      _id: { $in: Array.from(produceItemIdSet).map(toObjectId) },
      uniId: vendor.uniID,
    })
      .select("name type unit price image")
      .lean(),
  ]);

  // 4. Create quick lookup maps
  const retailMap = new Map(retailDocs.map((doc) => [String(doc._id), doc]));
  const produceMap = new Map(produceDocs.map((doc) => [String(doc._id), doc]));

  // 5. Inline enrich response
  const retailItems = retailEntries
    .map(({ itemId, quantity }) => {
      const doc = retailMap.get(String(itemId));
      if (!doc) return null;
      return {
        itemId: doc._id,
        name: doc.name,
        type: doc.type,
        unit: doc.unit,
        price: doc.price,
        image: doc.image,
        quantity,
      };
    })
    .filter(Boolean);

  const produceItems = produceEntries
    .map(({ itemId }) => {
      const doc = produceMap.get(String(itemId));
      if (!doc) return null;
      return {
        itemId: doc._id,
        name: doc.name,
        type: doc.type,
        unit: doc.unit,
        price: doc.price,
        image: doc.image,
      };
    })
    .filter(Boolean);

  return {
    foodCourtName: vendor.fullName,
    retailItems,
    produceItems,
  };
}

/**
 * Given an itemKind ("retail" or "produce") and an itemId,
 * return all vendors (with just their name + quantity/isAvailable) that:
 *   • have quantity > 0 (if retail) or isAvailable:"Y" (if produce),
 *   • and are themselves marked available under their Uni.vendors.
 *
 * Output: [ { vendorId, vendorName, uniID, inventoryValue }, … ]
 *
 * Throws if itemKind is invalid or itemId is not a valid ObjectId.
 */
async function getVendorsByItemId(itemKind, itemId) {
  if (!["retail", "produce"].includes(itemKind)) {
    throw new Error(
      `Invalid itemKind "${itemKind}". Must be "retail" or "produce".`
    );
  }

  const oid = toObjectId(itemId);
  console.log(`Finding vendors for ${itemKind} item ${itemId}`);

  // 1) Find all vendors whose inventory array for that kind contains this item
  const matchField =
    itemKind === "retail" ? "retailInventory" : "produceInventory";
  
  // First find all vendors that have this item in their inventory
  const vendors = await Vendor.find({
    [matchField]: { $elemMatch: { itemId: oid } }
  })
    .select("fullName uniID " + matchField)
    .lean();

  console.log(`Found ${vendors.length} vendors with item in inventory:`, vendors.map(v => v._id));

  const results = [];

  // 2) For each vendor, check Uni availability and pick out the correct inventory entry
  for (const v of vendors) {
    try {
      // Check if vendor is available in their university
      await assertVendorAvailableInUni(v._id, v.uniID);
      
      const entry = (v[matchField] || []).find(
        (e) => String(e.itemId) === String(oid)
      );
      
      if (!entry) {
        console.log(`Vendor ${v._id} has no matching inventory entry for item ${itemId}`);
        continue;
      }

      const inventoryValue =
        itemKind === "retail"
          ? { quantity: entry.quantity || 0 }
          : { isAvailable: entry.isAvailable || "N" };

      results.push({
        vendorId: v._id,
        vendorName: v.fullName,
        uniID: v.uniID,
        inventoryValue,
      });
      
      console.log(`Added vendor ${v._id} to results with inventory:`, inventoryValue);
    } catch (error) {
      console.log(`Skipping vendor ${v._id}:`, error.message);
      continue;
    }
  }

  console.log(`Returning ${results.length} available vendors:`, results.map(r => r.vendorId));
  return results;
}

module.exports = {
  getItemsForVendorId,
  getVendorsByItemId,
};
