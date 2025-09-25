const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const featureSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = Cluster_Accounts.model("Feature", featureSchema);


