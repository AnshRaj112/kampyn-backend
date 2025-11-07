// produce.js
const mongoose = require("mongoose");
const { Cluster_Item } = require("../../config/db"); // Using the clustered database
const produceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  type: {
    type: String,
    required: true,
  },
  // Optional subtype within a cuisine/type, e.g., "pizza" under "italian"
  subtype: { type: String },
  uniId: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true },
  unit: { type: String, required: true },
  price: { type: Number, required: true },
  priceExcludingTax: { type: Number, required: true },
  hsnCode: { type: String, required: true },
  gstPercentage: { type: Number, required: true },
  sgstPercentage: { type: Number, required: true },
  cgstPercentage: { type: Number, required: true },
  image: { type: String, required: true },
  packable: { type: Boolean, default: true },
  isVeg: { type: Boolean, default: true },
});
produceSchema.index({ uniId: 1, type: 1 });
// Helpful for subtype-based lookups if used
produceSchema.index({ uniId: 1, subtype: 1 });
produceSchema.post("findOneAndDelete", async function (doc) {
  if (doc) {
    const User = require("../account/User");
    await User.updateMany(
      {},
      { $pull: { favourites: { itemId: doc._id, kind: "Produce" } } }
    );
  }
});

module.exports = Cluster_Item.model("Produce", produceSchema); // Use Cluster_Item cluster
