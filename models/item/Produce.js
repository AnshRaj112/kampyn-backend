// produce.js
const mongoose = require("mongoose");
const { Cluster_Item } = require("../../config/db"); // Using the clustered database
const produceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: [
      "combos-veg",
      "combos-nonveg",
      "veg",
      "shakes",
      "juices",
      "soups",
      "non-veg",
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
produceSchema.index({ uniId: 1, type: 1 });
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
