// const express = require("express");
// const { searchFoods, getPopularFoods } = require("../controllers/foodController");

// const router = express.Router();

// // Define route for searching food
// router.get("/foods", searchFoods);
// router.get("/popular-foods", getPopularFoods);
// router.post("/increase-search", (req, res) => {
//     const { foodName } = req.body;
//     if (!foodName) return res.status(400).json({ error: "Food name required" });
  
//     require("../controllers/foodController").incrementSearchCount(foodName);
//     res.json({ message: "Search count updated" });
// });
  

// module.exports = router;

// const express = require("express");
// const { searchFoods, getPopularFoods, incrementSearchCount } = require("../controllers/foodController");

// const router = express.Router();

// router.get("/foods", searchFoods);
// router.get("/popular-foods", getPopularFoods);
// router.post("/increase-search", async (req, res) => {
//   const { foodName } = req.body;
//   if (!foodName) return res.status(400).json({ error: "Food name required" });

//   await incrementSearchCount(foodName);
//   res.json({ message: "Search count updated" });
// });

// module.exports = router;

// routes/foodRoute.js
const express = require("express");
const router = express.Router();
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");

router.get("/", async (req, res) => {
  const { query, uniID } = req.query;

  if (!query || !uniID) {
    return res.status(400).json({ error: "Missing query or uniID" });
  }

  try {
    const regex = new RegExp(query, "i");

    const [retailResults, produceResults] = await Promise.all([
      Retail.find({ name: regex, uniId: uniID }).populate("vendorId").lean(),
      Produce.find({ name: regex, uniId: uniID }).populate("vendorId").lean(),
    ]);

    const allResults = [...retailResults, ...produceResults];

    res.status(200).json(allResults);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
