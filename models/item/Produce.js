// produce.js
const mongoose = require("mongoose");
const { Cluster_Item } = require("../../config/db"); // Using the clustered database
const { commonTaxedItemFields } = require("./shared/itemSchemaFields");
const produceSchema = new mongoose.Schema({
  ...commonTaxedItemFields(),
  // Optional subtype within a cuisine/type, e.g., "pizza" under "italian"
  subtype: { type: String },
  unit: { type: String, required: true },
  packable: { type: Boolean, default: true },
}, { shardKey: { tenantId: 1 } });
produceSchema.index({ uniId: 1, type: 1 });
produceSchema.index({ tenantId: 1 });
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
