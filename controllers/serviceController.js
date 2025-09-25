const Service = require("../models/account/Service");

exports.listServices = async (req, res) => {
  try {
    const { feature } = req.query;
    const filter = {};
    if (feature) filter.feature = feature;
    const services = await Service.find(filter).populate("feature").sort({ createdAt: -1 });
    res.json({ success: true, data: services });
  } catch (error) {
    console.error("listServices error", error);
    res.status(500).json({ success: false, message: "Failed to fetch services" });
  }
};

exports.createService = async (req, res) => {
  try {
    const { name, description, feature, isActive, basePrice } = req.body;
    if (!name || !feature) {
      return res.status(400).json({ success: false, message: "name and feature are required" });
    }
    const service = await Service.create({ name, description, feature, isActive, basePrice });
    res.status(201).json({ success: true, data: service });
  } catch (error) {
    console.error("createService error", error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Service already exists for feature" });
    }
    res.status(500).json({ success: false, message: "Failed to create service" });
  }
};


