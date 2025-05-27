// retail.js
const mongoose = require("mongoose");
const { Cluster_Item } = require("../../config/db"); // Using the clustered database

const retailSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: [
      "biscuits",
      "chips",
      "icecream",
      "drinks",
      "snacks",
      "sweets",
      "nescafe",
      "others",
    ],
    required: true,
  },
  unit: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  isSpecial: { type: String, enum: ["Y", "N"], required: true, default: "N" },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

module.exports = Cluster_Item.model("Retail", retailSchema); // Use Cluster_Item cluster
