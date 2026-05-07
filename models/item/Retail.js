// retail.js
const mongoose = require("mongoose");
const { Cluster_Item } = require("../../config/db"); // Using the clustered database
const { commonTaxedItemFields } = require("./shared/itemSchemaFields");

const retailSchema = new mongoose.Schema({
  ...commonTaxedItemFields(),
  unit: { type: String, default: "pcs" },
  packable: { type: Boolean, default: false },
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
