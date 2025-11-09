// utils/vendorUtils.js
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const Raw = require("../models/item/Raw");
const logger = require("./pinoLogger");

/**
 * Populates a new vendor with all existing items from their university
 * @param {Object} vendor - The vendor document to populate
 * @param {String} uniId - The university ID
 * @returns {Promise<void>}
 */
async function populateVendorWithUniversityItems(vendor, uniId) {
  try {
    logger.info({ vendorId: vendor._id, uniId }, "Populating vendor with items from university");

    // Fetch all existing items for the university
    const [retailItems, produceItems, rawItems] = await Promise.all([
      Retail.find({ uniId }).select('_id unit').lean(),
      Produce.find({ uniId }).select('_id unit').lean(),
      Raw.find({}).select('_id unit').lean() // Raw items are not university-specific
    ]);

    logger.info({ retailCount: retailItems.length, produceCount: produceItems.length, rawCount: rawItems.length }, "Found items for vendor");

    // Add retail items to vendor inventory (quantity: 0)
    const retailInventory = retailItems.map(item => ({
      itemId: item._id,
      quantity: 0,
      isSpecial: "N",
      isAvailable: "Y"
    }));

    // Add produce items to vendor inventory (isAvailable: N)
    const produceInventory = produceItems.map(item => ({
      itemId: item._id,
      isAvailable: "N",
      isSpecial: "N"
    }));

    // Add raw material items to vendor inventory (openingAmount: 0, closingAmount: 0)
    const rawMaterialInventory = rawItems.map(item => ({
      itemId: item._id,
      openingAmount: 0,
      closingAmount: 0,
      unit: item.unit || 'kg'
    }));

    // Update vendor with the populated inventories
    vendor.retailInventory = retailInventory;
    vendor.produceInventory = produceInventory;
    vendor.rawMaterialInventory = rawMaterialInventory;

    await vendor.save();

    logger.info({ retailCount: retailInventory.length, produceCount: produceInventory.length, rawCount: rawMaterialInventory.length }, "Successfully populated vendor");
  } catch (error) {
    logger.error({ error: error.message, vendorId: vendor._id, uniId }, "Error populating vendor with university items");
    throw error;
  }
}

module.exports = {
  populateVendorWithUniversityItems
};
