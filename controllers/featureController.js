const Feature = require("../models/account/Feature");
const logger = require("../utils/pinoLogger");

exports.listFeatures = async (req, res) => {
  try {
    const features = await Feature.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: features });
  } catch (error) {
    logger.error("listFeatures error", error);
    res.status(500).json({ success: false, message: "Failed to fetch features" });
  }
};

exports.createFeature = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    const feature = await Feature.create({ name, description, isActive });
    res.status(201).json({ success: true, data: feature });
  } catch (error) {
    logger.error("createFeature error", error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Feature already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to create feature" });
  }
};


