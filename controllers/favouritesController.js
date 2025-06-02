const User = require("../models/account/User");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");
const Vendor = require("../models/account/Vendor");

exports.toggleFavourite = async (req, res) => {
  try {
    const { userId, itemId, kind } = req.params;

    if (!["Retail", "Produce"].includes(kind)) {
      return res.status(400).json({ error: "Invalid kind." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    // Check if the item already exists in favorites
    const existingFavourite = user.favourites.find(
      (fav) => fav.itemId.toString() === itemId && fav.kind === kind
    );

    if (existingFavourite) {
      // Remove the existing favorite
      user.favourites = user.favourites.filter(
        (fav) => !(fav.itemId.toString() === itemId && fav.kind === kind)
      );
      await user.save();
      return res.status(200).json({ message: "Favourite removed." });
    } else {
      // Verify the item exists before adding
      const ItemModel = kind === "Retail" ? Retail : Produce;
      const item = await ItemModel.findById(itemId);
      if (!item) return res.status(404).json({ error: "Item not found." });

      // Find the vendor that has this item in their inventory
      const vendor = await Vendor.findOne({
        uniID: item.uniId,
        [kind === "Retail" ? "retailInventory.itemId" : "produceInventory.itemId"]: itemId
      });

      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found for this item." });
      }

      // Add new favorite with vendorId
      user.favourites.push({ 
        itemId, 
        kind, 
        vendorId: vendor._id 
      });
      await user.save();
      return res.status(200).json({ message: "Favourite added." });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Get all favourite items
exports.getFavourites = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const favourites = await Promise.all(
      user.favourites.map(async (fav) => {
        const Model = fav.kind === "Retail" ? Retail : Produce;
        const item = await Model.findById(fav.itemId).lean();
        if (!item) return null;

        // Find the vendor that has this item in their inventory
        const vendor = await Vendor.findOne({
          uniID: item.uniId,
          [fav.kind === "Retail" ? "retailInventory.itemId" : "produceInventory.itemId"]: fav.itemId
        });

        return {
          ...item,
          kind: fav.kind,
          vendorId: vendor?._id // Include vendorId from the found vendor
        };
      })
    );

    res.status(200).json({ favourites: favourites.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Get favourite items filtered by uniId
exports.getFavouritesByUni = async (req, res) => {
  try {
    const { userId, uniId } = req.params;

    if (!uniId) {
      return res.status(400).json({ error: "Missing 'uniId' in path." });
    }

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const filteredFavourites = await Promise.all(
      user.favourites.map(async (fav) => {
        const Model = fav.kind === "Retail" ? Retail : Produce;
        const item = await Model.findOne({ _id: fav.itemId, uniId }).lean();
        if (!item) return null;

        // Find the vendor that has this item in their inventory
        const vendor = await Vendor.findOne({
          uniID: uniId,
          [fav.kind === "Retail" ? "retailInventory.itemId" : "produceInventory.itemId"]: fav.itemId
        });

        return {
          ...item,
          kind: fav.kind,
          vendorId: vendor?._id // Include vendorId from the found vendor
        };
      })
    );

    res.status(200).json({
      favourites: filteredFavourites.filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
};
