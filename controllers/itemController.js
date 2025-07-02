const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const Vendor = require("../models/account/Vendor");
const {
  getVendorsByItemId,
  getItemsForVendorId,
  getProduceItemsForVendorId,
  getRetailItemsForVendorId,
} = require("../utils/itemUtils");
const Uni = require("../models/account/Uni");

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

    // Add the new item to all vendors in the same university
    const vendors = await Vendor.find({ uniID: uniId });
    if (category.toLowerCase() === 'retail') {
      await Promise.all(vendors.map(vendor => {
        // Only add if not already present
        if (!vendor.retailInventory.some(inv => inv.itemId.equals(item._id))) {
          vendor.retailInventory.push({ itemId: item._id, quantity: 0 });
          return vendor.save();
        }
        return Promise.resolve();
      }));
    } else if (category.toLowerCase() === 'produce') {
      await Promise.all(vendors.map(vendor => {
        // Only add if not already present
        if (!vendor.produceInventory.some(inv => inv.itemId.equals(item._id))) {
          vendor.produceInventory.push({ itemId: item._id, isAvailable: 'Y' });
          return vendor.save();
        }
        return Promise.resolve();
      }));
    }

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
      .select("name price image type")
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
        .select("name price image type")
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
    const updateData = { ...req.body };
    delete updateData.isSpecial;
    const updatedItem = await ItemModel.findByIdAndUpdate(id, updateData, {
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
    // First check if vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    const { foodCourtName, retailItems, produceItems } =
      await getItemsForVendorId(vendorId);

    return res.status(200).json({
      success: true,
      foodCourtName,
      data: {
        retailItems: retailItems || [],
        produceItems: produceItems || [],
      },
    });
  } catch (err) {
    console.error("Error in getItemsByVendor:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor items",
      error: err.message,
    });
  }
};

// New controller for Retail-only
exports.getRetailItemsByVendor = async (req, res) => {
  const { vendorId } = req.params;
  try {
    const { foodCourtName, retailItems } = await getRetailItemsForVendorId(
      vendorId
    );
    return res.status(200).json({
      success: true,
      foodCourtName,
      data: { retailItems },
    });
  } catch (err) {
    console.error("Error in getRetailItemsByVendor:", err);
    const status = err.message.includes("not found") ? 404 : 500;
    return res.status(status).json({
      success: false,
      message: err.message,
    });
  }
};

// New controller for Produce-only
exports.getProduceItemsByVendor = async (req, res) => {
  const { vendorId } = req.params;
  try {
    const { foodCourtName, produceItems } = await getProduceItemsForVendorId(
      vendorId
    );
    return res.status(200).json({
      success: true,
      foodCourtName,
      data: { produceItems },
    });
  } catch (err) {
    console.error("Error in getProduceItemsByVendor:", err);
    const status = err.message.includes("not found") ? 404 : 500;
    return res.status(status).json({
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
    // First get the university to check vendor availability
    const uni = await Uni.findById(uniID).select("vendors").lean();
    if (!uni) {
      return res.status(404).json({ error: "University not found" });
    }

    // Create a map of available vendor IDs
    const availableVendorIds = new Set(
      (uni.vendors || [])
        .filter((v) => v.isAvailable === "Y")
        .map((v) => v.vendorId.toString())
    );

    console.log("Available vendor IDs:", Array.from(availableVendorIds));

    // Search in the Vendor collection with a more flexible query
    const vendors = await Vendor.find({
      uniID: uniID,
      $or: [
        { fullName: { $regex: query, $options: "i" } },
        { fullName: { $regex: query.replace(/\s+/g, ".*"), $options: "i" } },
      ],
    })
      .select("_id fullName")
      .lean();

    console.log("Found vendors before availability check:", vendors.length);

    // Filter vendors to only include available ones
    const availableVendors = vendors.filter((vendor) =>
      availableVendorIds.has(vendor._id.toString())
    );

    console.log("Found available vendors:", availableVendors.length);

    // Format the response
    const formattedVendors = availableVendors.map((vendor) => ({
      _id: vendor._id,
      name: vendor.fullName,
    }));

    res.status(200).json(formattedVendors);
  } catch (error) {
    console.error("Error in searchVendorsByName:", error);
    res
      .status(500)
      .json({ error: "Failed to search vendors", details: error.message });
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
      "nescafe",
    ];

    // First, find items that match the query directly
    const [retailItems, produceItems] = await Promise.all([
      Retail.find({
        uniId: uniID,
        $or: [{ name: regex }, { type: regex }],
      })
        .select("name price image type")
        .lean(),

      Produce.find({
        uniId: uniID,
        $or: [{ name: regex }, { type: regex }],
      })
        .select("name price image type")
        .lean(),
    ]);

    // If we found any items, get their types for enum matching
    const matchedTypes = new Set();
    [...retailItems, ...produceItems].forEach((item) => {
      if (item.type) matchedTypes.add(item.type);
    });

    // If no types were matched but searchByType is true, try to infer the type from the query
    let typesToSearch = Array.from(matchedTypes);
    if (typesToSearch.length === 0 && searchByType === "true") {
      // Try to match the query against known types
      const queryLower = query.toLowerCase();
      typesToSearch = retailTypes.filter((type) => type.includes(queryLower));

      // If still no types found, try to match against item names to infer type
      if (typesToSearch.length === 0) {
        const [allRetailItems] = await Promise.all([
          Retail.find({ uniId: uniID }).select("name type").lean(),
        ]);

        // Find items that contain the search query
        const matchingItems = allRetailItems.filter((item) =>
          item.name.toLowerCase().includes(queryLower)
        );

        // Get unique types from matching items
        const inferredTypes = new Set(matchingItems.map((item) => item.type));
        typesToSearch = Array.from(inferredTypes);
      }
    }

    // If we have types to search for, get all items of those types
    let additionalItems = [];
    if (typesToSearch.length > 0) {
      const [additionalRetail, additionalProduce] = await Promise.all([
        Retail.find({
          uniId: uniID,
          type: { $in: typesToSearch },
        })
          .select("name price image type")
          .lean(),

        Produce.find({
          uniId: uniID,
          type: { $in: typesToSearch },
        })
          .select("name price image type")
          .lean(),
      ]);

      additionalItems = [
        ...additionalRetail.map((item) => ({
          ...item,
          source: "retail",
          isTypeMatch: true,
        })),
        ...additionalProduce.map((item) => ({
          ...item,
          source: "produce",
          isTypeMatch: true,
        })),
      ];
    }

    // Combine results, ensuring no duplicates and correct source assignment
    const itemMap = new Map();
    [...retailItems, ...produceItems].forEach((item) => {
      const key = `${item._id}-${item.type}`;
      if (!itemMap.has(key)) {
        // Determine source based on type
        const isRetailType = retailTypes.includes(item.type.toLowerCase());
        itemMap.set(key, {
          ...item,
          source: isRetailType ? "retail" : "produce",
          isTypeMatch: false,
        });
      }
    });

    // Add additional items (type matches) if they don't already exist
    additionalItems.forEach((item) => {
      const key = `${item._id}-${item.type}`;
      if (!itemMap.has(key)) {
        // Determine source based on type for additional items
        const isRetailType = retailTypes.includes(item.type.toLowerCase());
        itemMap.set(key, {
          ...item,
          source: isRetailType ? "retail" : "produce",
          isTypeMatch: true,
        });
      }
    });

    const results = Array.from(itemMap.values());

    // If no exact matches found but we have type matches, return them as "You may also like"
    if (
      retailItems.length === 0 &&
      produceItems.length === 0 &&
      additionalItems.length > 0
    ) {
      return res.status(200).json({
        message: "No exact matches found",
        youMayAlsoLike: additionalItems,
      });
    }

    res.status(200).json(results);
  } catch (error) {
    console.error("Error in searchItems:", error);
    res
      .status(500)
      .json({ error: "Failed to search items", details: error.message });
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
    const formattedVendors = vendors.map((vendor) => {
      const baseVendor = {
        _id: vendor.vendorId,
        name: vendor.vendorName,
        price: vendor.inventoryValue?.price || item.price,
      };

      // For retail items, only include quantity
      if (itemType === "retail") {
        return {
          ...baseVendor,
          inventoryValue: {
            price: vendor.inventoryValue?.price || item.price,
            quantity: vendor.inventoryValue?.quantity || 0,
          },
        };
      }

      // For produce items, only include isAvailable
      return {
        ...baseVendor,
        inventoryValue: {
          price: vendor.inventoryValue?.price || item.price,
          isAvailable: vendor.inventoryValue?.isAvailable || "N",
        },
      };
    });

    res.status(200).json(formattedVendors);
  } catch (error) {
    console.error("Error getting vendors for item:", error);
    res.status(500).json({ message: error.message });
  }
};
