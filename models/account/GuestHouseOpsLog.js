const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const guestHouseOpsLogSchema = new mongoose.Schema(
  {
    uniId: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true, index: true },
    guestHouseId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestHouse", required: true, index: true },
    actorRole: { type: String, enum: ["guestHouse", "uni", "user", "system"], required: true, index: true },
    actorId: { type: String, default: "", index: true },
    actionType: {
      type: String,
      enum: ["booking_lifecycle", "rate_rule_change", "amenity_update", "service_request", "service_request_update"],
      required: true,
      index: true,
    },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    message: { type: String, trim: true, maxlength: 240, default: "" },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

guestHouseOpsLogSchema.index({ guestHouseId: 1, createdAt: -1 });

module.exports = Cluster_Accounts.model("GuestHouseOpsLog", guestHouseOpsLogSchema);
