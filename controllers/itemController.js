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

//search Items
exports.searchItems = async (req, res) => {
  const { query, uniID } = req.query;

  if (!query || !uniID) {
    return res.status(400).json({ error: "Missing search query or uniID" });
  }

  try {
    const regex = new RegExp(query, "i"); // case-insensitive partial match

    const [retailItems, produceItems] = await Promise.all([
      Retail.find({
        uniId: uniID,
        $or: [
          { name: regex },
          { type: regex },
        ],
      }).select("name price image type"),
      
      Produce.find({
        uniId: uniID,
        $or: [
          { name: regex },
          { type: regex },
        ],
      }).select("name price image type"),
    ]);

    const results = [
      ...retailItems.map((item) => ({ ...item.toObject(), source: "retail" })),
      ...produceItems.map((item) => ({ ...item.toObject(), source: "produce" })),
    ];

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