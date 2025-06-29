const mongoose = require("mongoose");
const { Cluster_Order } = require("../../config/db");

const orderCounterSchema = new mongoose.Schema({
  // Counter identifier: "YYYYMMDD-VENDORID" for vendor-specific daily counters
  counterId: {
    type: String,
    required: true,
    unique: true,
  },
  // Current sequence number
  sequence: {
    type: Number,
    default: 1,
  },
  // Last updated timestamp
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

// Index for fast lookups
orderCounterSchema.index({ counterId: 1 });

module.exports = Cluster_Order.model("OrderCounter", orderCounterSchema); 