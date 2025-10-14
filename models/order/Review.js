const mongoose = require("mongoose");
const { Cluster_Order } = require("../../config/db");

const reviewSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    uniId: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },
  },
  { timestamps: true }
);

reviewSchema.index({ orderId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ uniId: 1, createdAt: -1 });

module.exports = Cluster_Order.model("Review", reviewSchema);


