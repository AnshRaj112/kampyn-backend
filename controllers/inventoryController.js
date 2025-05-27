// controllers/inventoryController.js

const Vendor = require("../models/account/Vendor");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const InventoryReport = require("../models/inventory/InventoryReport");

exports.addInventory = async (req, res) => {
  try {
    let { vendorId, itemId, itemType, quantity, isAvailable } = req.body;
    quantity = quantity ? Number(quantity) : 0;

    // Normalize and validate itemType
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

    // Check if vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Get today's date range
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // Get or create today's InventoryReport for the vendor
    let report = await InventoryReport.findOne({
      vendorId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });

    if (!report) {
      report = new InventoryReport({ vendorId, date: new Date() });
    }

    if (normalizedItemType === "retail") {
      const item = await Retail.findById(itemId);
      if (!item) {
        return res.status(404).json({ message: "Retail item not found" });
      }

      // Update or insert item in vendor's retailInventory
      const existingRetail = vendor.retailInventory.find(
        (i) => i.itemId.toString() === itemId
      );

      if (existingRetail) {
        existingRetail.quantity += quantity;
      } else {
        vendor.retailInventory.push({ itemId, quantity });
      }

      vendor.markModified("retailInventory");

      // Update or insert in inventory report
      const updatedQty =
        vendor.retailInventory.find((i) => i.itemId.toString() === itemId)
          ?.quantity || quantity;

      const retailEntry = report.retailEntries.find(
        (entry) => entry.item.toString() === itemId
      );

      if (retailEntry) {
        retailEntry.closingQty = updatedQty;
      } else {
        report.retailEntries.push({
          item: itemId,
          openingQty: 0,
          closingQty: updatedQty,
          soldQty: 0,
        });
      }
    } else if (normalizedItemType === "produce") {
      const item = await Produce.findById(itemId);
      if (!item) {
        return res.status(404).json({ message: "Produce item not found" });
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

      // Do NOT update inventory report produceEntries here!
    }

    // Save both documents
    await vendor.save();
    await report.save();

    return res.status(200).json({ message: "Inventory updated successfully" });
  } catch (error) {
    console.error("Error adding inventory:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
// controllers/inventoryController.js

exports.reduceRetailInventory = async (req, res) => {
  try {
    let { vendorId, itemId, quantity } = req.body;
    quantity = quantity ? Number(quantity) : 0;

    if (!vendorId || !itemId || !quantity) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    const item = await Retail.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: "Retail item not found" });
    }

    const existingRetail = vendor.retailInventory.find(
      (i) => i.itemId.toString() === itemId
    );

    if (!existingRetail || existingRetail.quantity < quantity) {
      return res.status(400).json({ message: "Insufficient stock to reduce" });
    }

    existingRetail.quantity -= quantity;
    vendor.markModified("retailInventory");

    // Prepare today's date range using local time
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

    let report = await InventoryReport.findOne({
      vendorId,
      date: { $gte: startDate, $lt: endDate },
    });

    if (!report) {
      report = new InventoryReport({ vendorId, date: new Date() });
    }

    const retailEntry = report.retailEntries.find(
      (entry) => entry.item.toString() === itemId
    );

    if (retailEntry) {
      retailEntry.closingQty = existingRetail.quantity;
    } else {
      // If no previous entry exists, create it (with 0 opening/soldQty)
      report.retailEntries.push({
        item: itemId,
        openingQty: 0,
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
