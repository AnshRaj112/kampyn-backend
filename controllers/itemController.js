const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");

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
