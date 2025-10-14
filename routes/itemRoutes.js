const express = require("express");
const router = express.Router();
const itemController = require("../controllers/itemController");
const Retail = require('../models/item/Retail');
const Produce = require('../models/item/Produce');
const Raw = require('../models/item/Raw');
const { getAllSpecialsByUniId } = require('../controllers/itemController');

router.get(
  "/getvendors/:vendorId/retail",
  itemController.getRetailItemsByVendor
);
router.get(
  "/getvendors/:vendorId/produce",
  itemController.getProduceItemsByVendor
);
router.get(
  "/getvendors/:vendorId/raw",
  itemController.getRawItemsByVendor
);
// Add a new item in a category (retail/produce/raw)
router.post("/:category", itemController.addItem);

// Get paginated items by uniId for a category
router.get("/:category/uni/:uniId", itemController.getItemsByUniId);

// Get items filtered by type and uniId for a category
router.get("/:category/:type/:uniId", itemController.getItemsByTypeAndUni);

// Get detailed items (with HSN/GST) by type and uniId for a category
router.get(
  "/:category/:type/:uniId/detailed",
  itemController.getItemsByTypeAndUniDetailed
);

// Update an item by id in a category
router.put("/:category/:id", itemController.updateItem);

// Bulk update HSN/GST for a uniId by item type within a category
router.put("/:category/:type/:uniId/tax", itemController.bulkUpdateTaxByType);

// Bulk update HSN/GST for specific items by IDs within a category
router.put("/:category/tax/by-ids", itemController.bulkUpdateTaxByIds);

// Delete an item by id in a category
router.delete("/:category/:id", itemController.deleteItem);

// Search items with enhanced enum matching
router.get("/search/items", itemController.searchItems);

// Search vendors by name within a uniID
router.get("/search/vendors", itemController.searchVendorsByName);

//Fetch all vendors that currently hold a given retail/produce/raw item:
// Only returns vendorName + either quantity (retail) or isAvailable (produce) or openingAmount/closingAmount (raw).
router.get(
  "/vendors/by-item/:itemType/:itemId",
  itemController.getVendorsByItem
);

//Fetch all in‐stock retail items and all available produce items for one vendor:
router.get("/getvendors/:vendorId", itemController.getItemsByVendor);

// Get vendors for a specific item
router.get("/vendors/:itemId", itemController.getVendorsForItem);

// Get individual item by id in a category
router.get("/:category/item/:id", itemController.getItemById);

// Get vendor-specific items (items that belong only to a specific vendor)
router.get("/vendor/:vendorId/:category", itemController.getVendorSpecificItems);

router.get('/types/retail', (req, res) => {
  const retailTypes = Retail.schema.path('type').enumValues;
  res.json({ types: retailTypes });
});

router.get('/types/produce', (req, res) => {
  const produceTypes = Produce.schema.path('type').enumValues;
  res.json({ types: produceTypes });
});

// Get HSN code suggestions based on item type
router.get('/hsn-suggestions/:category/:type', async (req, res) => {
  try {
    const { category, type } = req.params;
    const ItemModel = getModel(category);
    
    // Find items with the same type and get their HSN codes and GST percentages
    const items = await ItemModel.find({ type }).select('hsnCode name gstPercentage').lean();
    
    // Extract unique HSN codes and count occurrences, also get GST percentage
    const hsnCounts = {};
    items.forEach(item => {
      if (item.hsnCode) {
        if (!hsnCounts[item.hsnCode]) {
          hsnCounts[item.hsnCode] = {
            count: 0,
            gstPercentage: null,
            items: []
          };
        }
        hsnCounts[item.hsnCode].count++;
        hsnCounts[item.hsnCode].items.push(item.name);
        
        // Set GST percentage from the first valid one we find
        if (hsnCounts[item.hsnCode].gstPercentage === null && item.gstPercentage != null) {
          hsnCounts[item.hsnCode].gstPercentage = item.gstPercentage;
        }
      }
    });
    
    // Sort by frequency (most used first) and return suggestions
    const suggestions = Object.entries(hsnCounts)
      .sort(([,a], [,b]) => b.count - a.count)
      .map(([hsnCode, data]) => ({
        hsnCode,
        count: data.count,
        gstPercentage: data.gstPercentage || 0, // Default to 0 if no GST percentage found
        items: data.items
      }));
    
    res.json({ 
      success: true, 
      suggestions,
      totalItems: items.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get most common HSN codes for a specific type across all categories
router.get('/common-hsn/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    // Search in all item categories for the given type
    const [retailItems, produceItems] = await Promise.all([
      Retail.find({ type }).select('hsnCode name gstPercentage').lean(),
      Produce.find({ type }).select('hsnCode name gstPercentage').lean()
    ]);
    
    // Combine all items
    const allItems = [...retailItems, ...produceItems];
    
    // Debug: Log some items to see what we're getting
    console.log(`Debug: Found ${allItems.length} items for type "${type}"`);
    if (allItems.length > 0) {
      console.log('Sample items:', allItems.slice(0, 3).map(item => ({
        name: item.name,
        hsnCode: item.hsnCode,
        gstPercentage: item.gstPercentage,
        hasGst: item.gstPercentage != null
      })));
    }
    
    // Extract unique HSN codes and count occurrences, also get GST percentage
    const hsnCounts = {};
    allItems.forEach(item => {
      if (item.hsnCode) {
        if (!hsnCounts[item.hsnCode]) {
          hsnCounts[item.hsnCode] = {
            count: 0,
            gstPercentage: null,
            items: []
          };
        }
        hsnCounts[item.hsnCode].count++;
        hsnCounts[item.hsnCode].items.push(item.name);
        
        // Set GST percentage from the first valid one we find
        if (hsnCounts[item.hsnCode].gstPercentage === null && item.gstPercentage != null) {
          hsnCounts[item.hsnCode].gstPercentage = item.gstPercentage;
        }
      }
    });
    
    // Debug: Log the HSN counts
    console.log('HSN Counts:', Object.entries(hsnCounts).map(([hsn, data]) => ({
      hsnCode: hsn,
      count: data.count,
      gstPercentage: data.gstPercentage,
      hasGst: data.gstPercentage != null
    })));
    
    // Sort by frequency (most used first) and return suggestions
    const suggestions = Object.entries(hsnCounts)
      .sort(([,a], [,b]) => b.count - a.count)
      .map(([hsnCode, data]) => ({
        hsnCode,
        count: data.count,
        gstPercentage: data.gstPercentage || 0, // Default to 0 if no GST percentage found
        items: data.items
      }));
    
    res.json({ 
      success: true, 
      suggestions,
      totalItems: allItems.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Debug endpoint to check database state
router.get('/debug/hsn-data/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    const [retailItems, produceItems] = await Promise.all([
      Retail.find({ type }).select('hsnCode name gstPercentage').lean(),
      Produce.find({ type }).select('hsnCode name gstPercentage').lean()
    ]);
    
    const allItems = [...retailItems, ...produceItems];
    
    res.json({
      success: true,
      type,
      totalItems: allItems.length,
      items: allItems.map(item => ({
        name: item.name,
        hsnCode: item.hsnCode,
        gstPercentage: item.gstPercentage,
        hasGst: item.gstPercentage != null
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
