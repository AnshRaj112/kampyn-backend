const Vendor = require("../models/account/Vendor"); // Cluster_Accounts
const Retail = require("../models/item/Retail"); // Cluster_Item
const Produce = require("../models/item/Produce"); // Cluster_Item
const Raw = require("../models/item/Raw"); // Cluster_Item
const InventoryReport = require("../models/inventory/InventoryReport"); // Cluster_Inventory
const { clearRawMaterialInventory } = require("../utils/inventoryReportUtils");

const validateSameUniversity = (vendor, item) => {
  return vendor.uniID.toString() === item.uniId.toString();
};

const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(now.setHours(0, 0, 0, 0));
  const endOfDay = new Date(now.setHours(23, 59, 59, 999));
  return { startOfDay, endOfDay };
};

exports.addInventory = async (req, res) => {
  try {
    let { vendorId, itemId, itemType, quantity, isAvailable } = req.body;
    quantity = quantity ? Number(quantity) : 0;

    if (!vendorId || !itemId || !itemType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const normalizedItemType = itemType.trim().toLowerCase();
    if (!["retail", "produce"].includes(normalizedItemType)) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    if (normalizedItemType === "retail" && (!quantity || quantity <= 0)) {
      return res.status(400).json({ message: "Invalid or missing quantity" });
    }

    if (normalizedItemType === "produce" && !["Y", "N"].includes(isAvailable)) {
      return res.status(400).json({ message: "Invalid availability flag" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const { startOfDay, endOfDay } = getTodayRange();
    let report = await InventoryReport.findOne({
      vendorId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });

    if (!report) report = new InventoryReport({ vendorId, date: new Date() });

    if (normalizedItemType === "retail") {
      const item = await Retail.findById(itemId);
      if (!item)
        return res.status(404).json({ message: "Retail item not found" });

      if (!validateSameUniversity(vendor, item)) {
        return res.status(403).json({
          message:
            "Retail item does not belong to the same university as the vendor",
        });
      }

      // Get the current quantity before any changes
      const existingRetail = vendor.retailInventory.find(
        (i) => i.itemId.toString() === itemId
      );
      const currentQuantity = existingRetail ? existingRetail.quantity : 0;
      
      // Update the vendor's inventory
      if (existingRetail) {
        existingRetail.quantity += quantity;
      } else {
        vendor.retailInventory.push({ itemId, quantity });
      }

      vendor.markModified("retailInventory");

      const updatedQty =
        vendor.retailInventory.find((i) => i.itemId.toString() === itemId)
          ?.quantity || quantity;

      // Add to itemReceived array to track received items
      report.itemReceived.push({
        itemId: itemId,
        kind: "Retail",
        quantity: quantity,
        date: new Date()
      });

      // Update the inventory report
      const retailEntry = report.retailEntries.find(
        (entry) => entry.item.toString() === itemId
      );
      if (retailEntry) {
        // If entry exists, update closing quantity
        retailEntry.closingQty = updatedQty;
        // Don't modify openingQty as it should remain the same
      } else {
        // If no entry exists, create new entry with proper opening stock
        report.retailEntries.push({
          item: itemId,
          openingQty: currentQuantity, // Opening stock before addition
          closingQty: updatedQty,
          soldQty: 0,
        });
      }
    } else if (normalizedItemType === "produce") {
      const item = await Produce.findById(itemId);
      if (!item)
        return res.status(404).json({ message: "Produce item not found" });

      if (!validateSameUniversity(vendor, item)) {
        return res.status(403).json({
          message:
            "Produce item does not belong to the same university as the vendor",
        });
      }

      const status = isAvailable === "Y" ? "Y" : "N";
      const existingProduce = vendor.produceInventory.find(
        (i) => i.itemId.toString() === itemId
      );
      if (existingProduce) {
        existingProduce.isAvailable = status;
      } else {
        vendor.produceInventory.push({ itemId, isAvailable: status });
      }

      vendor.markModified("produceInventory");
      // No inventory report update needed for produce items
    }

    await vendor.save();
    await report.save();

    return res.status(200).json({ message: "Inventory updated successfully" });
  } catch (error) {
    console.error("Error adding inventory:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.reduceRetailInventory = async (req, res) => {
  try {
    let { vendorId, itemId, quantity } = req.body;
    quantity = quantity ? Number(quantity) : 0;

    if (!vendorId || !itemId || !quantity) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const item = await Retail.findById(itemId);
    if (!item)
      return res.status(404).json({ message: "Retail item not found" });

    if (!validateSameUniversity(vendor, item)) {
      return res.status(403).json({
        message:
          "Retail item does not belong to the same university as the vendor",
      });
    }

    const existingRetail = vendor.retailInventory.find(
      (i) => i.itemId.toString() === itemId
    );
    if (!existingRetail || existingRetail.quantity < quantity) {
      return res.status(400).json({ message: "Insufficient stock to reduce" });
    }

    // Get the current quantity before reduction
    const currentQuantity = existingRetail.quantity;
    
    existingRetail.quantity -= quantity;
    vendor.markModified("retailInventory");

    const { startOfDay, endOfDay } = getTodayRange();
    let report = await InventoryReport.findOne({
      vendorId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });

    if (!report) report = new InventoryReport({ vendorId, date: new Date() });

    // Add to itemSend array to track sent items
    report.itemSend.push({
      itemId: itemId,
      kind: "Retail",
      quantity: quantity,
      date: new Date()
    });

    const retailEntry = report.retailEntries.find(
      (entry) => entry.item.toString() === itemId
    );
    if (retailEntry) {
      retailEntry.closingQty = existingRetail.quantity;
      // Don't modify openingQty as it should remain the same
    } else {
      report.retailEntries.push({
        item: itemId,
        openingQty: currentQuantity, // Opening stock before reduction
        closingQty: existingRetail.quantity,
        soldQty: 0,
      });
    }

    await vendor.save();
    await report.save();

    return res.status(200).json({ message: "Inventory reduced successfully" });
  } catch (error) {
    console.error("Error reducing inventory:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.updateRetailAvailability = async (req, res) => {
  try {
    const { vendorId, itemId, isAvailable } = req.body;
    if (!vendorId || !itemId || !["Y", "N"].includes(isAvailable)) {
      return res.status(400).json({ message: "Missing or invalid fields" });
    }
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    const retailEntry = vendor.retailInventory.find(
      (i) => i.itemId.toString() === itemId
    );
    if (!retailEntry) {
      return res.status(404).json({ message: "Retail item not found in inventory" });
    }
    retailEntry.isAvailable = isAvailable;
    vendor.markModified("retailInventory");
    await vendor.save();
    return res.status(200).json({ message: "Retail item availability updated" });
  } catch (error) {
    console.error("Error updating retail availability:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.updateRawMaterialInventory = async (req, res) => {
  try {
    const { vendorId, itemId, openingAmount, closingAmount, unit } = req.body;

    if (!vendorId || !itemId || openingAmount === undefined || closingAmount === undefined || !unit) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["l", "kg"].includes(unit)) {
      return res.status(400).json({ message: "Invalid unit. Must be 'l' or 'kg'" });
    }

    if (openingAmount < 0 || closingAmount < 0) {
      return res.status(400).json({ message: "Amounts cannot be negative" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const item = await Raw.findById(itemId);
    if (!item) return res.status(404).json({ message: "Raw material item not found" });

    const existingRaw = vendor.rawMaterialInventory.find(
      (i) => i.itemId.toString() === itemId
    );

    if (existingRaw) {
      existingRaw.openingAmount = openingAmount;
      existingRaw.closingAmount = closingAmount;
      existingRaw.unit = unit;
    } else {
      vendor.rawMaterialInventory.push({ 
        itemId, 
        openingAmount, 
        closingAmount, 
        unit 
      });
    }

    vendor.markModified("rawMaterialInventory");

    // Update inventory report
    const { startOfDay, endOfDay } = getTodayRange();
    let report = await InventoryReport.findOne({
      vendorId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });

    if (!report) report = new InventoryReport({ vendorId, date: new Date() });

    const rawEntry = report.rawEntries.find(
      (entry) => entry.item.toString() === itemId
    );
    if (rawEntry) {
      rawEntry.openingQty = openingAmount;
      rawEntry.closingQty = closingAmount;
    } else {
      report.rawEntries.push({
        item: itemId,
        openingQty: openingAmount,
        closingQty: closingAmount,
      });
    }

    await vendor.save();
    await report.save();

    return res.status(200).json({ message: "Raw material inventory updated successfully" });
  } catch (error) {
    console.error("Error updating raw material inventory:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.deleteRawMaterialInventory = async (req, res) => {
  try {
    const { vendorId, itemId } = req.body;
    if (!vendorId || !itemId) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });
    // Remove from vendor's rawMaterialInventory
    vendor.rawMaterialInventory = (vendor.rawMaterialInventory || []).filter(
      (entry) => entry.itemId.toString() !== itemId
    );
    vendor.markModified("rawMaterialInventory");
    await vendor.save();
    // Remove from today's inventory report if exists
    const { startOfDay, endOfDay } = getTodayRange();
    let report = await InventoryReport.findOne({
      vendorId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });
    if (report) {
      report.rawEntries = (report.rawEntries || []).filter(
        (entry) => entry.item.toString() !== itemId
      );
      await report.save();
    }
    return res.status(200).json({ message: "Raw material deleted from inventory" });
  } catch (error) {
    console.error("Error deleting raw material inventory:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /inventory/clear-raw-materials
 * Manually clear all raw material inventory for all vendors
 * This is useful for testing or emergency situations
 */
exports.clearAllRawMaterialInventory = async (req, res) => {
  try {
    const clearedCount = await clearRawMaterialInventory();
    return res.status(200).json({ 
      message: `Successfully cleared raw material inventory for ${clearedCount} vendors`,
      clearedCount 
    });
  } catch (error) {
    console.error("Error clearing all raw material inventory:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
