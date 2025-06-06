const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const {
  getVendorsByItemId,
  getItemsForVendorId,
} = require("../utils/itemUtils");

// Utility to get the correct model
const getModel = (category) => {
  switch (category.toLowerCase()) {
    case "retail":
      return Retail;
    case "produce":
      return Produce;
    default:
      throw new Error("Invalid category. Must be 'retail' or 'produce'.");
  }
};

// Add Item (with duplicate check)
exports.addItem = async (req, res) => {
  try {
    const { category } = req.params;
    const { name, uniId } = req.body;

    if (!name || !uniId) {
      return res
        .status(400)
        .json({ error: "Missing required fields: name and uniId" });
    }

    const ItemModel = getModel(category);
    const existingItem = await ItemModel.findOne({ name: name.trim(), uniId });

    if (existingItem) {
      return res.status(409).json({
        error: "Item with the same name already exists for this uniId",
      });
    }

    const item = new ItemModel(req.body);
    await item.save();

    res.status(201).json({ message: "Item added successfully", item });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get Items by type and uniId
exports.getItemsByTypeAndUni = async (req, res) => {
  try {
    const { category, type, uniId } = req.params;

    const ItemModel = getModel(category);
    const items = await ItemModel.find({ type, uniId })
      .select("name price image type isSpecial")
      .lean();
    res.status(200).json(items);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get paginated items by uniId
exports.getItemsByUniId = async (req, res) => {
  try {
    const { category, uniId } = req.params;
    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const skip = (page - 1) * limit;

    const ItemModel = getModel(category);

    const [items, total] = await Promise.all([
      ItemModel.find({ uniId })
        .select("name price image type isSpecial")
        .skip(skip)
        .limit(limit)
        .lean(),
      ItemModel.countDocuments({ uniId }),
    ]);

    res.status(200).json({
      page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      items,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update Item
exports.updateItem = async (req, res) => {
  try {
    const { category, id } = req.params;
    const ItemModel = getModel(category);
    const updatedItem = await ItemModel.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (!updatedItem) return res.status(404).json({ error: "Item not found" });

    res.status(200).json({ message: "Item updated", item: updatedItem });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete Item
exports.deleteItem = async (req, res) => {
  try {
    const { category, id } = req.params;
    const ItemModel = getModel(category);
    const deletedItem = await ItemModel.findByIdAndDelete(id);

    if (!deletedItem) return res.status(404).json({ error: "Item not found" });

    res.status(200).json({ message: "Item deleted", item: deletedItem });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getVendorsByItem = async (req, res) => {
  const { itemType, itemId } = req.params;

  try {
    const vendors = await getVendorsByItemId(itemType, itemId);

    if (vendors.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No available vendors found for ${itemType} item ${itemId}.`,
      });
    }

    return res.json({ success: true, data: vendors });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getItemsByVendor = async (req, res) => {
  const { vendorId } = req.params;

  try {
    const { foodCourtName, retailItems, produceItems } =
      await getItemsForVendorId(vendorId);
    return res.json({
      success: true,
      foodCourtName,
      data: {
        retailItems,
        produceItems,
      },
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

// Search vendors by name within uniID
exports.searchVendorsByName = async (req, res) => {
  const { query, uniID } = req.query;

  if (!query || !uniID) {
    return res.status(400).json({ error: "Missing search query or uniID" });
  }

  try {
    const regex = new RegExp(query, "i"); // case-insensitive partial match

    // Search in both Retail and Produce collections for vendors
    const [retailVendors, produceVendors] = await Promise.all([
      Retail.find({
        uniId: uniID,
        "vendor.name": regex
      }).select("vendor.name vendor._id").lean(),
      
      Produce.find({
        uniId: uniID,
        "vendor.name": regex
      }).select("vendor.name vendor._id").lean()
    ]);

    // Combine and deduplicate vendors
    const vendorMap = new Map();
    [...retailVendors, ...produceVendors].forEach(item => {
      if (item.vendor && !vendorMap.has(item.vendor._id.toString())) {
        vendorMap.set(item.vendor._id.toString(), {
          _id: item.vendor._id,
          name: item.vendor.name
        });
      }
    });

    const vendors = Array.from(vendorMap.values());
    res.status(200).json(vendors);
  } catch (error) {
    res.status(500).json({ error: "Failed to search vendors", details: error.message });
  }
};

//search Items with enhanced enum matching
exports.searchItems = async (req, res) => {
  const { query, uniID, searchByType } = req.query;

  if (!query || !uniID) {
    return res.status(400).json({ error: "Missing search query or uniID" });
  }

  try {
    const regex = new RegExp(query, "i"); // case-insensitive partial match

    // Define retail types
    const retailTypes = [
      "biscuits",
      "chips",
      "icecream",
      "drinks",
      "snacks",
      "sweets",
      "nescafe"
    ];

    // First, find items that match the query directly
    const [retailItems, produceItems] = await Promise.all([
      Retail.find({
        uniId: uniID,
        $or: [
          { name: regex },
          { type: regex }
        ]
      }).select("name price image type").lean(),
      
      Produce.find({
        uniId: uniID,
        $or: [
          { name: regex },
          { type: regex }
        ]
      }).select("name price image type").lean()
    ]);

    // If we found any items, get their types for enum matching
    const matchedTypes = new Set();
    [...retailItems, ...produceItems].forEach(item => {
      if (item.type) matchedTypes.add(item.type);
    });

    // If we found matching types and searchByType is true, search for all items with those types
    let additionalItems = [];
    if (matchedTypes.size > 0 && searchByType === 'true') {
      const [additionalRetail, additionalProduce] = await Promise.all([
        Retail.find({
          uniId: uniID,
          type: { $in: Array.from(matchedTypes) }
        }).select("name price image type").lean(),
        
        Produce.find({
          uniId: uniID,
          type: { $in: Array.from(matchedTypes) }
        }).select("name price image type").lean()
      ]);

      additionalItems = [
        ...additionalRetail.map(item => ({ ...item, source: "retail", isTypeMatch: true })),
        ...additionalProduce.map(item => ({ ...item, source: "produce", isTypeMatch: true }))
      ];
    }

    // Combine results, ensuring no duplicates and correct source assignment
    const itemMap = new Map();
    [...retailItems, ...produceItems].forEach(item => {
      const key = `${item._id}-${item.type}`;
      if (!itemMap.has(key)) {
        // Determine source based on type
        const isRetailType = retailTypes.includes(item.type.toLowerCase());
        itemMap.set(key, {
          ...item,
          source: isRetailType ? "retail" : "produce",
          isTypeMatch: false
        });
      }
    });

    // Add additional items (type matches) if they don't already exist
    additionalItems.forEach(item => {
      const key = `${item._id}-${item.type}`;
      if (!itemMap.has(key)) {
        // Determine source based on type for additional items
        const isRetailType = retailTypes.includes(item.type.toLowerCase());
        itemMap.set(key, {
          ...item,
          source: isRetailType ? "Retail" : "Produce"
        });
      }
    });

    const results = Array.from(itemMap.values());

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: "Failed to search items", details: error.message });
  }
};

exports.getVendorsForItem = async (req, res) => {
  try {
    const { itemId } = req.params;

    // First try to find the item in Retail collection
    let item = await Retail.findById(itemId).lean();
    let itemType = "retail";

    // If not found in Retail, try Produce collection
    if (!item) {
      item = await Produce.findById(itemId).lean();
      itemType = "produce";
    }

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Get vendors that have this item in their inventory
    const vendors = await getVendorsByItemId(itemType, itemId);

    // Format the response based on item type
    const formattedVendors = vendors.map(vendor => {
      const baseVendor = {
        _id: vendor.vendorId,
        name: vendor.vendorName,
        price: vendor.inventoryValue?.price || item.price
      };

      // For retail items, only include quantity
      if (itemType === "retail") {
        return {
          ...baseVendor,
          inventoryValue: {
            price: vendor.inventoryValue?.price || item.price,
            quantity: vendor.inventoryValue?.quantity || 0
          }
        };
      }
      
      // For produce items, only include isAvailable
      return {
        ...baseVendor,
        inventoryValue: {
          price: vendor.inventoryValue?.price || item.price,
          isAvailable: vendor.inventoryValue?.isAvailable || "N"
        }
      };
    });

    res.status(200).json(formattedVendors);
  } catch (error) {
    console.error("Error getting vendors for item:", error);
    res.status(500).json({ message: error.message });
  }
};