// // const Item = require("../models/item/Item");


// // Function to search food based on query
// exports.searchFoods = async (req, res) => {
//   const { query } = req.query;
//   if (!query) {
//     return res.json([]);
//   }

//   try {
//     const lowerQuery = query.toLowerCase();

//     const items = await Item.find({
//       name: { $regex: lowerQuery, $options: "i" }, // case-insensitive search
//     }).sort({ searchCount: -1 });

//     res.json(items);
//   } catch (err) {
//     res.status(500).json({ message: "Error searching foods", error: err.message });
//   }
// };


// exports.getPopularFoods = async (req, res) => {
//   try {
//     const popularItems = await Item.find({}, "name price image searchCount")
//       .sort({ searchCount: -1 })
//       .limit(12);

//     res.status(200).json(popularItems);
//   } catch (err) {
//     res.status(500).json({ message: "Error fetching popular foods", error: err.message });
//   }
// };




// // Function to increase search count (for popular search feature)
// exports.incrementSearchCount = async (foodName) => {
//   try {
//     const item = await Item.findOne({ name: foodName });
//     if (item) {
//       item.searchCount = (item.searchCount || 0) + 1;
//       await item.save();
//     }
//   } catch (err) {
//     logger.error("Error incrementing search count:", err);
//   }
// };

const Produce = require("../models/item/Produce");
const Retail = require("../models/item/Retail");
const User = require("../models/account/User");
const logger = require("../utils/pinoLogger");

// Search food items across both collections
exports.searchFoods = async (req, res) => {
  const { query, uniID } = req.query;
  if (!query) return res.json([]);

  try {
    const regex = new RegExp(query, "i");

    const filter = uniID
      ? { name: regex, vendorId: { $exists: true } }
      : { name: regex };

    const produceItems = await Produce.find(filter).populate("vendorId", "location type uniID");
    const retailItems = await Retail.find(filter).populate("vendorId", "location type uniID");

    const filtered = [...produceItems, ...retailItems].filter(item => {
      return !uniID || item.vendorId?.uniID?.toString() === uniID;
    });

    const sorted = filtered.sort((a, b) => (b.searchCount || 0) - (a.searchCount || 0));

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: "Search error", error: err.message });
  }
};

// Popular food (from both models, sorted by search count)
exports.getPopularFoods = async (req, res) => {
  const { uniID } = req.query;

  try {
    const [produce, retail] = await Promise.all([
      Produce.find({ vendorId: { $exists: true } }).populate("vendorId", "location uniID").lean(),
      Retail.find({ vendorId: { $exists: true } }).populate("vendorId", "location uniID").lean(),
    ]);

    const allItems = [...produce, ...retail].filter(item => {
      return !uniID || item.vendorId?.uniID?.toString() === uniID;
    });

    const sorted = allItems.sort((a, b) => (b.searchCount || 0) - (a.searchCount || 0)).slice(0, 12);

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: "Error fetching popular foods", error: err.message });
  }
};

// Increment search count
exports.incrementSearchCount = async (foodName) => {
  try {
    const item = await Produce.findOne({ name: foodName }) || await Retail.findOne({ name: foodName });
    if (item) {
      item.searchCount = (item.searchCount || 0) + 1;
      await item.save();
    }
  } catch (err) {
    logger.error("Error incrementing search count:", err);
  }
};
