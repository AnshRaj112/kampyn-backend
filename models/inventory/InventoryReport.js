const mongoose = require("mongoose");
const { Cluster_Inventory } = require("../../config/db");

const inventoryReportSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    date: { type: Date, default: Date.now, required: true },

    retailEntries: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: "Retail" },
        openingQty: Number,
        closingQty: Number,
        soldQty: Number,
        _id: false,
      },
    ],

    produceEntries: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: "Produce" },
        soldQty: Number,
        _id: false,
      },
    ],

    rawEntries: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: "Raw" },
        openingQty: Number,
        closingQty: Number,
        _id: false,
      },
    ],

    itemReceived: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "itemReceived.kind",
        },
        kind: { type: String, enum: ["Retail", "Produce", "Raw"] },
        quantity: Number,
        date: { type: Date, default: Date.now },
        _id: false,
      },
    ],

    itemSend: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "itemSend.kind",
        },
        kind: { type: String, enum: ["Retail", "Produce", "Raw"] },
        quantity: Number,
        date: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

// Now build the correct unique index on vendorId + date:
inventoryReportSchema.index({ vendorId: 1, date: 1 }, { unique: true });

const InventoryReport = Cluster_Inventory.model(
  "InventoryReport",
  inventoryReportSchema
);

module.exports = InventoryReport;
