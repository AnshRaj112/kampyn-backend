const User = require("../../models/account/User");
const Retail = require("../../models/item/Retail");
const Produce = require("../../models/item/Produce");
const Vendor = require("../../models/account/Vendor");
const logger = require("../../utils/pinoLogger");

exports.toggleFavourite = async (req, res) => {
  try {
    const { userId, itemId, kind, vendorId } = req.params;

    if (!["Retail", "Produce"].includes(kind)) {
      return res.status(400).json({ error: "Invalid kind." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    // Verify the vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found." });
    }

    // Check if the item already exists in favorites
    const existingFavourite = user.favourites.find(
      (fav) => fav.itemId && fav.itemId.toString() === itemId && 
               fav.kind === kind && 
               fav.vendorId && fav.vendorId.toString() === vendorId
    );

    if (existingFavourite) {
      // Remove the existing favorite
      user.favourites = user.favourites.filter(
        (fav) => !(fav.itemId && fav.itemId.toString() === itemId && 
                  fav.kind === kind && 
                  fav.vendorId && fav.vendorId.toString() === vendorId)
      );
      await user.save();
      return res.status(200).json({ message: "Favourite removed." });
    } 
      // Verify the item exists before adding
      const ItemModel = kind === "Retail" ? Retail : Produce;
      const item = await ItemModel.findById(itemId);
      if (!item) return res.status(404).json({ error: "Item not found." });

      // Verify the vendor has this item in their inventory
      const inventory = vendor[kind === "Retail" ? "retailInventory" : "produceInventory"] || [];
      const hasItem = inventory.some(
        inv => inv && inv.itemId && inv.itemId.toString() === itemId
      );

      if (!hasItem) {
        return res.status(400).json({ error: "Item not found in vendor's inventory." });
      }

      // Add new favorite with vendorId
      user.favourites.push({ 
        itemId, 
        kind, 
        vendorId 
      });
      await user.save();
      return res.status(200).json({ message: "Favourite added." });
    
  } catch (err) {
    logger.error("Error in toggleFavourite:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

// Get all favourite items
exports.getFavourites = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    logger.info("User favorites:", user.favourites); // Debug log

    const favourites = await Promise.all(
      user.favourites.map(async (fav) => {
        try {
          const Model = fav.kind === "Retail" ? Retail : Produce;
          const item = await Model.findById(fav.itemId).lean();
          if (!item) {
            logger.info(`Item not found for ID: ${fav.itemId}`); // Debug log
            return null;
          }

          // Get the vendor directly from the favorite's vendorId
          const vendor = await Vendor.findById(fav.vendorId).lean();
          if (!vendor) {
            logger.info(`Vendor not found for ID: ${fav.vendorId}`); // Debug log
            return null;
          }

          return {
            ...item,
            kind: fav.kind,
            vendorId: fav.vendorId,
            vendorName: vendor.fullName
          };
        } catch (err) {
          logger.error("Error processing favorite:", err); // Debug log
          return null;
        }
      })
    );

    logger.info("Processed favorites:", favourites.filter(Boolean)); // Debug log
    res.status(200).json({ favourites: favourites.filter(Boolean) });
  } catch (err) {
    logger.error("Error in getFavourites:", err);
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

        // Get the vendor directly from the favorite's vendorId
        const vendor = await Vendor.findById(fav.vendorId).lean();
        if (!vendor) return null;

        return {
          ...item,
          kind: fav.kind,
          vendorId: fav.vendorId,
          vendorName: vendor.fullName
        };
      })
    );

    res.status(200).json({
      favourites: filteredFavourites.filter(Boolean),
    });
  } catch (err) {
    logger.error("Error in getFavouritesByUni:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};
