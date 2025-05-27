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

const express = require("express");
const { searchFoods, getPopularFoods, incrementSearchCount } = require("../controllers/foodController");

const router = express.Router();

router.get("/foods", searchFoods);
router.get("/popular-foods", getPopularFoods);
router.post("/increase-search", async (req, res) => {
  const { foodName } = req.body;
  if (!foodName) return res.status(400).json({ error: "Food name required" });

  await incrementSearchCount(foodName);
  res.json({ message: "Search count updated" });
});

module.exports = router;
