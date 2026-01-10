const express = require("express");
const router = express.Router();
const foodcourtController = require("../controllers/foodCourt/foodCourtController");

// Foodcourt routes
router.post("/", foodcourtController.createFoodcourt);

module.exports = router;
