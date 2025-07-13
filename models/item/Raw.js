// raw.js
const mongoose = require("mongoose");
const { Cluster_Item } = require("../../config/db"); // Using the clustered database

const rawSchema = new mongoose.Schema({
  name: { type: String, required: true },
  unit: { type: String, required: true },
});

module.exports = Cluster_Item.model("Raw", rawSchema); // Use Cluster_Item cluster
