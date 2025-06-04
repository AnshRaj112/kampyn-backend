// retail.js
const mongoose = require("mongoose");
const { Cluster_Item } = require("../../config/db"); // Using the clustered database
const Uni = require("../account/Uni");

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
  uniId: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true },
  unit: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  isSpecial: { type: String, enum: ["Y", "N"], required: true, default: "N" },
});
retailSchema.index({ uniId: 1, type: 1 });
retailSchema.post("findOneAndDelete", async function (doc) {
  if (doc) {
    const User = require("../account/User");
    await User.updateMany(
      {},
      { $pull: { favourites: { itemId: doc._id, kind: "Retail" } } }
    );
  }
});

module.exports = Cluster_Item.model("Retail", retailSchema); // Use Cluster_Item cluster
