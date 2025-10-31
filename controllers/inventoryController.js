const Vendor = require("../models/account/Vendor"); // Cluster_Accounts
const Retail = require("../models/item/Retail"); // Cluster_Item
const Produce = require("../models/item/Produce"); // Cluster_Item
const Raw = require("../models/item/Raw"); // Cluster_Item
const InventoryReport = require("../models/inventory/InventoryReport"); // Cluster_Inventory
const Recipe = require("../models/Recipe");
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
      // Do not overwrite createdAt
    } else {
      vendor.rawMaterialInventory.push({ 
        itemId, 
        openingAmount, 
        closingAmount, 
        unit,
        createdAt: new Date()
      });
    }

    vendor.markModified("rawMaterialInventory");

    // Update inventory report
    const { startOfDay, endOfDay } = getTodayRange();
    let report = await InventoryReport.findOne({
      vendorId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });

    if (!report) {
      // Create a new report for today if it doesn't exist
      report = new InventoryReport({ 
        vendorId, 
        date: startOfDay,
        retailEntries: [],
        produceEntries: [],
        rawEntries: [],
        itemReceived: [],
        itemSend: []
      });
    }

    // Ensure rawEntries array exists
    if (!report.rawEntries) {
      report.rawEntries = [];
    }

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

/**
 * Simple retail production: increments retail inventory and deducts raw usages.
 * Body: { vendorId, quantity, outputRetailItemId?, outputName?, rawUsages: [{ rawItemId, quantity, unit? }] }
 */
exports.produceRetailSimple = async (req, res) => {
  try {
    const { vendorId, quantity, outputRetailItemId, outputName, rawUsages } = req.body;
    if (!vendorId || !quantity || quantity <= 0) {
      return res.status(400).json({ success: false, message: "Missing vendorId or invalid quantity" });
    }
    if (!outputRetailItemId && !outputName) {
      return res.status(400).json({ success: false, message: "Provide outputRetailItemId or outputName" });
    }
    if (!Array.isArray(rawUsages) || rawUsages.length === 0) {
      return res.status(400).json({ success: false, message: "rawUsages required" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    // Resolve retail item
    let retailId = outputRetailItemId;
    if (!retailId && outputName) {
      const match = await Retail.findOne({ uniId: vendor.uniID, name: outputName }).select('_id').lean();
      if (match) retailId = match._id;
    }
    if (!retailId) return res.status(400).json({ success: false, message: "Could not resolve output retail item" });

    // Validate and prepare raw deductions
    const deductions = [];
    for (const usage of rawUsages) {
      if (!usage.rawItemId || typeof usage.quantity !== 'number' || usage.quantity < 0) {
        return res.status(400).json({ success: false, message: "Invalid rawUsages entry" });
      }
      const inv = vendor.rawMaterialInventory?.find(e => e.itemId.toString() === String(usage.rawItemId));
      if (!inv) {
        return res.status(400).json({ success: false, message: `Raw item not in vendor inventory: ${usage.rawItemId}` });
      }
      const available = inv.closingAmount > 0 ? inv.closingAmount : (inv.openingAmount || 0);
      if (available < usage.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient raw. Needed ${usage.quantity}${inv.unit}, available ${available}${inv.unit}` });
      }
      deductions.push({ itemId: usage.rawItemId, qty: usage.quantity });
    }

    // Initialize closings where needed and apply raw decrements (with fallbacks)
    for (const d of deductions) {
      const cur = vendor.rawMaterialInventory.find(e => e.itemId.toString() === String(d.itemId));
      if (cur && (cur.closingAmount <= 0) && (cur.openingAmount > 0)) {
        await Vendor.updateOne(
          { _id: vendorId, "rawMaterialInventory.itemId": d.itemId },
          { $set: { "rawMaterialInventory.$.closingAmount": cur.openingAmount } }
        );
      }
      let dec = await Vendor.updateOne(
        { _id: vendorId, "rawMaterialInventory.itemId": d.itemId },
        { $inc: { "rawMaterialInventory.$.closingAmount": -d.qty } }
      );
      if (!dec || !dec.modifiedCount) {
        dec = await Vendor.updateOne(
          { _id: vendorId },
          { $inc: { "rawMaterialInventory.$[elem].closingAmount": -d.qty } },
          { arrayFilters: [{ "elem.itemId": d.itemId }] }
        );
      }
    }

    // Increment retail; fallback to arrayFilters; push if absent
    let inc = await Vendor.updateOne(
      { _id: vendorId, "retailInventory.itemId": retailId },
      { $inc: { "retailInventory.$.quantity": Number(quantity) } }
    );
    if (!inc || !inc.modifiedCount) {
      inc = await Vendor.updateOne(
        { _id: vendorId },
        { $inc: { "retailInventory.$[elem].quantity": Number(quantity) } },
        { arrayFilters: [{ "elem.itemId": retailId }] }
      );
    }
    if (!inc || !inc.modifiedCount) {
      await Vendor.updateOne(
        { _id: vendorId },
        { $push: { retailInventory: { itemId: retailId, quantity: Number(quantity), isSpecial: "N", isAvailable: "Y" } } }
      );
    }

    // Build report entry
    const { startOfDay } = getTodayRange();
    let report = await InventoryReport.findOne({ vendorId, date: { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 86400000) } });
    if (!report) report = new InventoryReport({ vendorId, date: startOfDay, retailEntries: [], produceEntries: [], rawEntries: [], itemReceived: [], itemSend: [] });
    report.itemReceived.push({ itemId: retailId, kind: "Retail", quantity: Number(quantity), date: new Date() });
    for (const d of deductions) {
      report.itemSend.push({ itemId: d.itemId, kind: "Raw", quantity: d.qty, date: new Date() });
    }
    await report.save();

    // Return refreshed snapshot
    const refreshed = await Vendor.findById(vendorId).select("retailInventory rawMaterialInventory").lean();
    const retailEntry = (refreshed.retailInventory || []).find(e => e.itemId.toString() === String(retailId));
    const updatedRaw = deductions.map(d => ({ itemId: d.itemId, closingAmount: (refreshed.rawMaterialInventory || []).find(e => e.itemId.toString() === String(d.itemId))?.closingAmount }));

    return res.json({ success: true, message: "Retail produced and inventory updated", retail: retailEntry, raw: updatedRaw });
  } catch (e) {
    console.error("produceRetailSimple error:", e);
    return res.status(500).json({ success: false, message: "Failed to produce retail", error: e.message });
  }
};

/**
 * Simple produce production: deducts raw usages only (no produce inventory changes)
 * Body: { vendorId, rawUsages: [{ rawItemId, quantity, unit? }] }
 */
exports.produceProduceSimple = async (req, res) => {
  try {
    const { vendorId, rawUsages, outputProduceItemId, outputName } = req.body;
    if (!vendorId || !Array.isArray(rawUsages) || rawUsages.length === 0) {
      return res.status(400).json({ success: false, message: "vendorId and rawUsages are required" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    // Resolve produce item (optional, for reporting)
    let produceId = outputProduceItemId;
    if (!produceId && outputName) {
      const match = await Produce.findOne({ uniId: vendor.uniID, name: outputName }).select('_id').lean();
      if (match) produceId = match._id;
    }

    // Validate and prepare raw deductions
    const deductions = [];
    for (const usage of rawUsages) {
      if (!usage.rawItemId || typeof usage.quantity !== 'number' || usage.quantity < 0) {
        return res.status(400).json({ success: false, message: "Invalid rawUsages entry" });
      }
      const inv = vendor.rawMaterialInventory?.find(e => e.itemId.toString() === String(usage.rawItemId));
      if (!inv) {
        return res.status(400).json({ success: false, message: `Raw item not in vendor inventory: ${usage.rawItemId}` });
      }
      const available = inv.closingAmount > 0 ? inv.closingAmount : (inv.openingAmount || 0);
      if (available < usage.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient raw. Needed ${usage.quantity}${inv.unit}, available ${available}${inv.unit}` });
      }
      deductions.push({ itemId: usage.rawItemId, qty: usage.quantity });
    }

    // Initialize closings where needed and apply raw decrements (with fallbacks)
    for (const d of deductions) {
      const cur = vendor.rawMaterialInventory.find(e => e.itemId.toString() === String(d.itemId));
      if (cur && (cur.closingAmount <= 0) && (cur.openingAmount > 0)) {
        await Vendor.updateOne(
          { _id: vendorId, "rawMaterialInventory.itemId": d.itemId },
          { $set: { "rawMaterialInventory.$.closingAmount": cur.openingAmount } }
        );
      }
      let dec = await Vendor.updateOne(
        { _id: vendorId, "rawMaterialInventory.itemId": d.itemId },
        { $inc: { "rawMaterialInventory.$.closingAmount": -d.qty } }
      );
      if (!dec || !dec.modifiedCount) {
        dec = await Vendor.updateOne(
          { _id: vendorId },
          { $inc: { "rawMaterialInventory.$[elem].closingAmount": -d.qty } },
          { arrayFilters: [{ "elem.itemId": d.itemId }] }
        );
      }
    }

    // Update report: raw sends and optional produce received entry
    const { startOfDay } = getTodayRange();
    let report = await InventoryReport.findOne({ vendorId, date: { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 86400000) } });
    if (!report) report = new InventoryReport({ vendorId, date: startOfDay, retailEntries: [], produceEntries: [], rawEntries: [], itemReceived: [], itemSend: [] });
    for (const d of deductions) {
      report.itemSend.push({ itemId: d.itemId, kind: "Raw", quantity: d.qty, date: new Date() });
    }
    if (produceId) {
      report.itemReceived.push({ itemId: produceId, kind: "Produce", quantity: 1, date: new Date() });
      const existing = (report.produceEntries || []).find(e => e.item.toString() === String(produceId));
      if (!existing) {
        report.produceEntries.push({ item: produceId, soldQty: 0 });
      }
    }
    await report.save();

    const refreshed = await Vendor.findById(vendorId).select("rawMaterialInventory").lean();
    const updatedRaw = deductions.map(d => ({ itemId: d.itemId, closingAmount: (refreshed.rawMaterialInventory || []).find(e => e.itemId.toString() === String(d.itemId))?.closingAmount }));
    return res.json({ success: true, message: "Raw materials deducted", raw: updatedRaw });
  } catch (e) {
    console.error("produceProduceSimple error:", e);
    return res.status(500).json({ success: false, message: "Failed to process produce", error: e.message });
  }
};

/**
 * Recipe Works - Get recipes available for production
 */
exports.getRecipeWorksRecipes = async (req, res) => {
  try {
    const vendorId = req.vendor._id || req.vendor.vendorId;
    
    if (!vendorId) {
      return res.status(401).json({ message: "Vendor authentication required" });
    }

    // Get all recipes for this vendor that have outputType set
    const recipes = await Recipe.find({ 
      vendorId,
      outputType: { $in: ['retail', 'produce'] }
    })
    .populate('outputItemId')
    .lean();

    // Group recipes by output type
    const retailRecipes = recipes.filter(r => r.outputType === 'retail');
    const produceRecipes = recipes.filter(r => r.outputType === 'produce');

    res.json({
      success: true,
      data: {
        retail: retailRecipes,
        produce: produceRecipes,
        all: recipes
      }
    });
  } catch (error) {
    console.error("Error fetching recipe works recipes:", error);
    res.status(500).json({ message: "Failed to fetch recipes", error: error.message });
  }
};

/**
 * Recipe Works - Validate raw material inventory
 */
exports.validateRecipeIngredients = async (req, res) => {
  try {
    const { vendorId, recipeId, quantity } = req.body;
    
    if (!vendorId || !recipeId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: "Missing or invalid required fields" });
    }

    const vendor = await Vendor.findById(vendorId).lean();
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const recipe = await Recipe.findById(recipeId).lean();
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });

    // Calculate required ingredients based on quantity
    const multiplier = quantity / recipe.servings;
    const requiredIngredients = recipe.ingredients.map(ing => ({
      name: ing.name,
      quantity: ing.quantity * multiplier,
      unit: ing.unit
    }));

    // Check availability in raw material inventory
    const missingIngredients = [];
    const availableIngredients = [];

    for (const required of requiredIngredients) {
      // Find the raw material in inventory
      const rawMaterialEntry = vendor.rawMaterialInventory?.find(
        inv => {
          const rawId = inv.itemId.toString();
          return rawId; // We'll check by name matching since we don't have direct itemId linkage
        }
      );

      if (!rawMaterialEntry) {
        missingIngredients.push({
          name: required.name,
          quantity: required.quantity,
          unit: required.unit
        });
      } else {
        // Check if enough quantity is available
        const availableQty = rawMaterialEntry.closingAmount || 0;
        if (availableQty < required.quantity) {
          missingIngredients.push({
            name: required.name,
            required: required.quantity,
            available: availableQty,
            unit: required.unit
          });
        } else {
          availableIngredients.push({
            name: required.name,
            quantity: required.quantity,
            unit: required.unit,
            available: availableQty
          });
        }
      }
    }

    res.json({
      success: true,
      canProduce: missingIngredients.length === 0,
      missingIngredients,
      availableIngredients
    });
  } catch (error) {
    console.error("Error validating recipe ingredients:", error);
    res.status(500).json({ message: "Failed to validate ingredients", error: error.message });
  }
};

/**
 * Recipe Works - Create items from recipe
 */
exports.createItemsFromRecipe = async (req, res) => {
  try {
    const { vendorId, recipeId, quantity, mode } = req.body; // mode: 'quantity' or 'amount'
    console.log("[RecipeWorks] createItemsFromRecipe called", { vendorId, recipeId, quantity, mode });
    
    if (!vendorId || !recipeId || !quantity || !mode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    const recipe = await Recipe.findById(recipeId).populate('outputItemId').lean();
    if (!recipe) return res.status(404).json({ message: "Recipe not found" });
    console.log("[RecipeWorks] Loaded recipe", { outputType: recipe.outputType, servings: recipe.servings, outputItemId: recipe.outputItemId?._id || recipe.outputItemId });

    // If output item is missing, try to auto-resolve by matching recipe title to Retail/Produce name within same uni
    let resolvedOutputItemId = recipe.outputItemId;
    let resolvedOutputType = recipe.outputType;
    if (!resolvedOutputItemId && resolvedOutputType === 'retail') {
      const fallbackRetail = await Retail.findOne({ uniId: recipe.uniId, name: recipe.title }).select('_id').lean();
      if (fallbackRetail) {
        resolvedOutputItemId = fallbackRetail._id;
        console.log("[RecipeWorks] Auto-resolved retail outputItemId via title match", { itemId: String(resolvedOutputItemId) });
      }
    } else if (!resolvedOutputItemId && resolvedOutputType === 'produce') {
      const fallbackProduce = await Produce.findOne({ uniId: recipe.uniId, name: recipe.title }).select('_id').lean();
      if (fallbackProduce) {
        resolvedOutputItemId = fallbackProduce._id;
        console.log("[RecipeWorks] Auto-resolved produce outputItemId via title match", { itemId: String(resolvedOutputItemId) });
      }
    }

    if (!resolvedOutputType || !resolvedOutputItemId) {
      return res.status(400).json({ message: "Recipe does not have an output item configured", detail: { outputType: recipe.outputType, outputItemId: recipe.outputItemId } });
    }

    // Calculate required ingredients
    let multiplier;
    if (mode === 'quantity') {
      multiplier = quantity / recipe.servings;
    } else {
      // For amount mode, user specifies ingredient amounts, calculate output
      // This would need additional logic, for now use quantity
      multiplier = quantity / recipe.servings;
    }

    const requiredIngredients = (recipe.ingredients || []).map(ing => ({
      name: ing.name,
      quantity: ing.quantity * multiplier,
      unit: ing.unit
    }));
    console.log("[RecipeWorks] Computed required ingredients", requiredIngredients);

    // Helper: normalize and convert units to vendor inventory units (kg/l when applicable)
    const normalizeUnit = (unit) => String(unit || "").trim().toLowerCase();
    const massToKg = {
      g: 1 / 1000,
      gram: 1 / 1000,
      grams: 1 / 1000,
      kg: 1,
      kilogram: 1,
      kilograms: 1,
      oz: 0.0283495,
      ounce: 0.0283495,
      ounces: 0.0283495,
      lb: 0.45359237,
      lbs: 0.45359237,
      pound: 0.45359237,
      pounds: 0.45359237,
    };
    const volumeToL = {
      ml: 1 / 1000,
      milliliter: 1 / 1000,
      milliliters: 1 / 1000,
      l: 1,
      liter: 1,
      liters: 1,
      cup: 0.24,
      cups: 0.24,
      tbsp: 0.015,
      tablespoon: 0.015,
      tablespoons: 0.015,
      tsp: 0.005,
      teaspoon: 0.005,
      teaspoons: 0.005,
    };
    const convertToVendorUnit = (qty, fromUnit, vendorUnit) => {
      const f = normalizeUnit(fromUnit);
      const v = normalizeUnit(vendorUnit);
      if (!qty || !f || !v) return qty;
      if (v === "kg") {
        const factor = massToKg[f];
        return factor ? qty * factor : qty; // fallback: assume same unit
      }
      if (v === "l") {
        const factor = volumeToL[f];
        return factor ? qty * factor : qty;
      }
      // Unknown vendor unit: no conversion
      return qty;
    };

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Validate and prepare raw material deductions
    const ingredientDeductions = [];
    for (const required of requiredIngredients) {
      // Find raw material by case-insensitive exact name
      const rawItem = await Raw.findOne({ name: { $regex: new RegExp(`^${escapeRegex(required.name)}$`, "i") } }).lean();
      if (!rawItem) {
        return res.status(400).json({ message: `Raw material '${required.name}' not found in database`, detail: { required } });
      }
      console.log("[RecipeWorks] Matched raw item", { ingredient: required.name, rawItemId: rawItem._id });

      const inventoryEntry = vendor.rawMaterialInventory?.find(
        (inv) => inv.itemId.toString() === rawItem._id.toString()
      );

      if (!inventoryEntry) {
        return res.status(400).json({ message: `Raw material '${required.name}' not found in vendor inventory`, detail: { rawItemId: rawItem._id } });
      }
      console.log("[RecipeWorks] Vendor raw inventory entry", { rawItemId: rawItem._id, unit: inventoryEntry.unit, closingAmount: inventoryEntry.closingAmount });

      // Convert required qty to the vendor inventory unit (kg/l)
      const requiredInVendorUnit = convertToVendorUnit(required.quantity, required.unit, inventoryEntry.unit);
      console.log("[RecipeWorks] Required converted", { name: required.name, from: required.unit, to: inventoryEntry.unit, qty: required.quantity, converted: requiredInVendorUnit });

      const availableQty = (inventoryEntry.closingAmount > 0 ? inventoryEntry.closingAmount : (inventoryEntry.openingAmount || 0));
      if (availableQty < requiredInVendorUnit) {
        return res.status(400).json({
          message: `Insufficient ${required.name}. Required: ${requiredInVendorUnit.toFixed(2)}${inventoryEntry.unit}, Available: ${availableQty.toFixed(2)}${inventoryEntry.unit}`,
          detail: { requiredInVendorUnit, available: availableQty, unit: inventoryEntry.unit }
        });
      }

      ingredientDeductions.push({
        itemId: rawItem._id,
        quantity: requiredInVendorUnit,
        entry: inventoryEntry,
      });
    }

    // Deduct raw materials from inventory (atomic updates)
    for (const deduction of ingredientDeductions) {
      // If closingAmount is zero but openingAmount exists, initialize closing to opening for today before deducting
      const currentEntry = vendor.rawMaterialInventory.find(e => e.itemId.toString() === deduction.itemId.toString());
      if (currentEntry && (currentEntry.closingAmount <= 0) && (currentEntry.openingAmount > 0)) {
        const setRes = await Vendor.updateOne(
          { _id: vendorId, "rawMaterialInventory.itemId": deduction.itemId },
          { $set: { "rawMaterialInventory.$.closingAmount": currentEntry.openingAmount } }
        );
        console.log("[RecipeWorks] Raw initialized closing from opening", { itemId: deduction.itemId.toString(), opening: currentEntry.openingAmount, modifiedCount: setRes.modifiedCount });
      }
      let ures = await Vendor.updateOne(
        { _id: vendorId, "rawMaterialInventory.itemId": deduction.itemId },
        { $inc: { "rawMaterialInventory.$.closingAmount": -deduction.quantity } }
      );
      if (!ures || !ures.modifiedCount) {
        // Fallback using arrayFilters
        ures = await Vendor.updateOne(
          { _id: vendorId },
          { $inc: { "rawMaterialInventory.$[elem].closingAmount": -deduction.quantity } },
          { arrayFilters: [{ "elem.itemId": deduction.itemId }] }
        );
        console.log("[RecipeWorks] Raw decrement via arrayFilters", { itemId: deduction.itemId.toString(), qty: deduction.quantity, modifiedCount: ures.modifiedCount });
      } else {
        console.log("[RecipeWorks] Raw material decremented", { itemId: deduction.itemId.toString(), qty: deduction.quantity, modifiedCount: ures.modifiedCount });
      }
    }

    // Add output items to inventory
    let outputItemsAdded = 0;
    const { startOfDay, endOfDay } = getTodayRange();
    let report = await InventoryReport.findOne({
      vendorId,
      date: { $gte: startOfDay, $lt: endOfDay },
    });

    if (!report) {
      report = new InventoryReport({
        vendorId,
        date: startOfDay,
        retailEntries: [],
        produceEntries: [],
        rawEntries: [],
        itemReceived: [],
        itemSend: []
      });
    }

    if (resolvedOutputType === 'retail') {
      // Add to retail inventory
      const outputRetail = await Retail.findById(resolvedOutputItemId);
      if (!outputRetail) {
        return res.status(404).json({ message: "Output retail item not found" });
      }

      // Atomic increment of existing retail inventory; on miss, push a new element
      let incResult = await Vendor.updateOne(
        { _id: vendorId, "retailInventory.itemId": outputRetail._id },
        { $inc: { "retailInventory.$.quantity": Number(quantity || 0) } }
      );
      console.log("[RecipeWorks] Retail increment result", { itemId: outputRetail._id.toString(), incQty: Number(quantity || 0), modifiedCount: incResult.modifiedCount });
      if (!incResult || !incResult.modifiedCount) {
        // Fallback using arrayFilters in case positional match failed
        incResult = await Vendor.updateOne(
          { _id: vendorId },
          { $inc: { "retailInventory.$[elem].quantity": Number(quantity || 0) } },
          { arrayFilters: [{ "elem.itemId": outputRetail._id }] }
        );
        console.log("[RecipeWorks] Retail increment via arrayFilters", { itemId: outputRetail._id.toString(), incQty: Number(quantity || 0), modifiedCount: incResult.modifiedCount });
      }
      if (!incResult || !incResult.modifiedCount) {
        const pushRes = await Vendor.updateOne(
          { _id: vendorId },
          { $push: { retailInventory: { itemId: outputRetail._id, quantity: Number(quantity || 0), isSpecial: "N", isAvailable: "Y" } } }
        );
        console.log("[RecipeWorks] Retail pushed new entry", { modifiedCount: pushRes.modifiedCount, acknowledged: pushRes.acknowledged });
      }
      // Reload quantity after update
      const refreshedRetailDoc = await Vendor.findById(vendorId).select("retailInventory").lean();
      const afterRetail = (refreshedRetailDoc.retailInventory || []).find(e => e.itemId.toString() === outputRetail._id.toString());
      outputItemsAdded = afterRetail ? afterRetail.quantity : Number(quantity || 0);
      console.log("[RecipeWorks] Retail post-update quantity", { itemId: outputRetail._id.toString(), quantity: outputItemsAdded });

      // Update inventory report
      report.itemReceived.push({
        itemId: outputRetail._id,
        kind: "Retail",
        quantity: quantity,
        date: new Date()
      });

      const retailEntry = report.retailEntries.find(
        e => e.item.toString() === outputRetail._id.toString()
      );
      
      if (retailEntry) {
        retailEntry.closingQty = outputItemsAdded;
      } else {
        report.retailEntries.push({
          item: outputRetail._id,
          openingQty: Math.max(0, outputItemsAdded - quantity),
          closingQty: outputItemsAdded,
          soldQty: 0
        });
      }
    } else if (resolvedOutputType === 'produce') {
      // Add to produce inventory
      const outputProduce = await Produce.findById(resolvedOutputItemId);
      if (!outputProduce) {
        return res.status(404).json({ message: "Output produce item not found" });
      }

      const existingProduce = vendor.produceInventory.find(
        inv => inv.itemId.toString() === outputProduce._id.toString()
      );

      if (existingProduce) {
        existingProduce.isAvailable = 'Y';
      } else {
        vendor.produceInventory.push({
          itemId: outputProduce._id,
          isAvailable: 'Y',
          isSpecial: "N"
        });
      }

      // Update inventory report
      report.itemReceived.push({
        itemId: outputProduce._id,
        kind: "Produce",
        quantity: quantity,
        date: new Date()
      });

      const produceEntry = report.produceEntries.find(
        e => e.item.toString() === outputProduce._id.toString()
      );

      if (!produceEntry) {
        report.produceEntries.push({
          item: outputProduce._id,
          soldQty: 0
        });
      }
    }

    // Fetch latest vendor inventory for report entries
    const vendorAfter = await Vendor.findById(vendorId).select("rawMaterialInventory retailInventory produceInventory").lean();
    console.log("[RecipeWorks] Vendor inventory reloaded for report");

    // Update raw material entries in report
    for (const deduction of ingredientDeductions) {
      const rawEntry = report.rawEntries.find(
        e => e.item.toString() === deduction.itemId.toString()
      );

      const entry = (vendorAfter.rawMaterialInventory || []).find(
        inv => inv.itemId.toString() === deduction.itemId.toString()
      );

      if (rawEntry) {
        rawEntry.closingQty = entry.closingAmount;
      } else {
        report.rawEntries.push({
          item: deduction.itemId,
          openingQty: entry.openingAmount,
          closingQty: entry.closingAmount
        });
      }

      // Add to itemSend to track raw material usage
      report.itemSend.push({
        itemId: deduction.itemId,
        kind: "Raw",
        quantity: deduction.quantity,
        date: new Date()
      });
    }

    // Vendor already updated via atomic operations
    await report.save();

    res.json({
      success: true,
      message: `${quantity} ${resolvedOutputType === 'retail' ? 'item(s)' : 'serving(s)'} created successfully`,
      outputType: resolvedOutputType,
      quantity,
      ingredientsUsed: requiredIngredients,
      updatedRetailItemId: resolvedOutputType === 'retail' ? resolvedOutputItemId : undefined,
      retailInventory: resolvedOutputType === 'retail' ? (vendorAfter.retailInventory || []).find(e => e.itemId.toString() === String(resolvedOutputItemId)) : undefined,
      updatedRaw: ingredientDeductions.map(d => ({ itemId: d.itemId, newClosingAmount: (vendorAfter.rawMaterialInventory || []).find(e => e.itemId.toString() === d.itemId.toString())?.closingAmount }))
    });
    console.log("[RecipeWorks] Response sent successfully");
  } catch (error) {
    console.error("Error creating items from recipe:", error);
    res.status(500).json({ message: "Failed to create items", error: error.message });
  }
};
