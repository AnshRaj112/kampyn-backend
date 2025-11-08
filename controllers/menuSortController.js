// controllers/menuSortController.js
const MenuSortOrder = require("../models/menu/MenuSortOrder");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const Vendor = require("../models/account/Vendor");

// Get menu sort order for a university or vendor
exports.getMenuSortOrder = async (req, res) => {
  try {
    const { uniId, vendorId } = req.query;

    if (!uniId) {
      return res.status(400).json({
        success: false,
        error: "uniId is required",
      });
    }

    const query = { uniId };
    if (vendorId && vendorId !== "null" && vendorId !== "") {
      query.vendorId = vendorId;
    } else {
      query.vendorId = null; // University-wide sort order
    }

    let sortOrder = await MenuSortOrder.findOne(query).lean();

    // If no sort order exists, create a default one
    if (!sortOrder) {
      sortOrder = await MenuSortOrder.create({
        uniId,
        vendorId: query.vendorId,
        itemOrder: [],
      });
    }

    res.status(200).json({
      success: true,
      data: sortOrder,
    });
  } catch (error) {
    console.error("Error getting menu sort order:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Update menu sort order
exports.updateMenuSortOrder = async (req, res) => {
  try {
    const { uniId, vendorId, itemOrder, typeOrder, subtypeOrder } = req.body;

    if (!uniId) {
      return res.status(400).json({
        success: false,
        error: "uniId is required",
      });
    }

    if (itemOrder && !Array.isArray(itemOrder)) {
      return res.status(400).json({
        success: false,
        error: "itemOrder must be an array",
      });
    }

    if (typeOrder && !Array.isArray(typeOrder)) {
      return res.status(400).json({
        success: false,
        error: "typeOrder must be an array",
      });
    }

    if (subtypeOrder && !Array.isArray(subtypeOrder)) {
      return res.status(400).json({
        success: false,
        error: "subtypeOrder must be an array",
      });
    }

    // Validate vendor exists if vendorId is provided
    if (vendorId && vendorId !== "null" && vendorId !== "") {
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        return res.status(404).json({
          success: false,
          error: "Vendor not found",
        });
      }
      if (String(vendor.uniID) !== String(uniId)) {
        return res.status(400).json({
          success: false,
          error: "Vendor does not belong to this university",
        });
      }
    }

    const query = { uniId };
    const updateVendorId = vendorId && vendorId !== "null" && vendorId !== "" ? vendorId : null;
    query.vendorId = updateVendorId;

    // Validate itemOrder entries if provided
    if (itemOrder) {
      for (const item of itemOrder) {
        if (!item.itemId || !item.category || !item.type || typeof item.sortIndex !== "number") {
          return res.status(400).json({
            success: false,
            error: "Invalid itemOrder format. Each item must have itemId, category, type, and sortIndex",
          });
        }

        // Verify item exists
        const ItemModel = item.category === "retail" ? Retail : Produce;
        const itemDoc = await ItemModel.findById(item.itemId);
        if (!itemDoc) {
          return res.status(404).json({
            success: false,
            error: `Item ${item.itemId} not found in ${item.category}`,
          });
        }
        if (String(itemDoc.uniId) !== String(uniId)) {
          return res.status(400).json({
            success: false,
            error: `Item ${item.itemId} does not belong to this university`,
          });
        }
      }
    }

    // Build update object
    const updateData = {
      updatedAt: new Date(),
    };

    if (itemOrder) {
      updateData.itemOrder = itemOrder;
    }
    if (typeOrder) {
      updateData.typeOrder = typeOrder;
    }
    if (subtypeOrder) {
      updateData.subtypeOrder = subtypeOrder;
    }

    // Update or create sort order
    const sortOrder = await MenuSortOrder.findOneAndUpdate(
      query,
      {
        $set: updateData,
      },
      {
        upsert: true,
        new: true,
      }
    );

    res.status(200).json({
      success: true,
      message: "Menu sort order updated successfully",
      data: sortOrder,
    });
  } catch (error) {
    console.error("Error updating menu sort order:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get items with applied sort order
exports.getSortedItems = async (req, res) => {
  try {
    const { uniId, vendorId, category } = req.query;

    if (!uniId || !category) {
      return res.status(400).json({
        success: false,
        error: "uniId and category are required",
      });
    }

    if (!["retail", "produce"].includes(category)) {
      return res.status(400).json({
        success: false,
        error: "category must be 'retail' or 'produce'",
      });
    }

    // Get sort order
    const sortQuery = { uniId };
    const updateVendorId = vendorId && vendorId !== "null" && vendorId !== "" ? vendorId : null;
    sortQuery.vendorId = updateVendorId;

    const sortOrder = await MenuSortOrder.findOne(sortQuery).lean();

    // Get all items
    const ItemModel = category === "retail" ? Retail : Produce;
    const items = await ItemModel.find({ uniId })
      .select("name description price image type subtype packable isVeg")
      .lean();

    // If no sort order, return items as-is
    if (!sortOrder || !sortOrder.itemOrder || sortOrder.itemOrder.length === 0) {
      return res.status(200).json({
        success: true,
        items,
        sorted: false,
      });
    }

    // Create a map of itemId -> sortIndex for fast lookup
    const sortMap = new Map();
    sortOrder.itemOrder
      .filter((item) => item.category === category)
      .forEach((item) => {
        sortMap.set(String(item.itemId), item.sortIndex);
      });

    // Sort items: items with sortIndex first (by sortIndex), then items without sortIndex (by name)
    const sortedItems = items.sort((a, b) => {
      const aSortIndex = sortMap.get(String(a._id));
      const bSortIndex = sortMap.get(String(b._id));

      // If both have sortIndex, sort by sortIndex
      if (aSortIndex !== undefined && bSortIndex !== undefined) {
        return aSortIndex - bSortIndex;
      }
      // If only a has sortIndex, a comes first
      if (aSortIndex !== undefined) {
        return -1;
      }
      // If only b has sortIndex, b comes first
      if (bSortIndex !== undefined) {
        return 1;
      }
      // If neither has sortIndex, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });

    res.status(200).json({
      success: true,
      items: sortedItems,
      sorted: true,
    });
  } catch (error) {
    console.error("Error getting sorted items:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Reset menu sort order (remove custom sorting)
exports.resetMenuSortOrder = async (req, res) => {
  try {
    const { uniId, vendorId } = req.body;

    if (!uniId) {
      return res.status(400).json({
        success: false,
        error: "uniId is required",
      });
    }

    const query = { uniId };
    const updateVendorId = vendorId && vendorId !== "null" && vendorId !== "" ? vendorId : null;
    query.vendorId = updateVendorId;

    await MenuSortOrder.deleteOne(query);

    res.status(200).json({
      success: true,
      message: "Menu sort order reset successfully",
    });
  } catch (error) {
    console.error("Error resetting menu sort order:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

