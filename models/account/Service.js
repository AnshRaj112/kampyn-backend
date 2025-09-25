const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    feature: { type: mongoose.Schema.Types.ObjectId, ref: "Feature", required: true },
    isActive: { type: Boolean, default: true },
    basePrice: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

serviceSchema.index({ feature: 1, name: 1 }, { unique: true });

module.exports = Cluster_Accounts.model("Service", serviceSchema);


