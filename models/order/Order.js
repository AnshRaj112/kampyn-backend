const mongoose = require("mongoose");
const { Cluster_Order } = require("../../config/db");
const { Cluster_Accounts } = require("../../config/db");

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  orderType: {
    type: String,
    enum: ["takeaway", "delivery", "dinein", "cash"],
    required: true,
  },
  collectorName: { type: String, required: true },
  collectorPhone: { type: String, required: true },

  items: [
    {
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "items.kind",
      },
      kind: { type: String, required: true, enum: ["Retail", "Produce"] },
      quantity: { type: Number, default: 1 },
      // no _id: false needed if you want Mongoose to generate sub‐IDs, but you can keep _id:false if you prefer
    },
  ],
  total: { type: Number, required: true },
  address: { type: String },

  reservationExpiresAt: { type: Date }, // this helps to delete the document if unsuccesful payment
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    default: null,
  },
  status: {
    type: String,
    enum: [
      "pendingPayment",
      "inProgress",
      "completed",
      "onTheWay",
      "delivered",
      "failed",
    ],
    default: "pendingPayment",
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});
orderSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
orderSchema.index({ userId: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, reservationExpiresAt: 1 });

module.exports = Cluster_Order.model("Order", orderSchema);
