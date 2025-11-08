// models/menu/MenuSortOrder.js
const mongoose = require("mongoose");
const { Cluster_Item } = require("../../config/db");

const menuSortOrderSchema = new mongoose.Schema(
  {
    uniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Uni",
      required: true,
      index: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null, // null = university-wide sort order, otherwise vendor-specific
      index: true,
    },
    // Sort order configuration
    // Key format: "category-type" or "category-type-subtype"
    // Value: array of itemIds in order
    sortOrder: {
      type: Map,
      of: [String], // Array of itemIds
      default: new Map(),
    },
    // Alternative: flat array of itemIds with their sort positions
    // This makes it easier to query and update
    itemOrder: [
      {
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        category: {
          type: String,
          enum: ["retail", "produce"],
          required: true,
        },
        type: {
          type: String,
          required: true,
        },
        subtype: {
          type: String,
          default: null,
        },
        sortIndex: {
          type: Number,
          required: true,
        },
        _id: false,
      },
    ],
    // Type ordering: which types appear first
    typeOrder: [
      {
        category: {
          type: String,
          enum: ["retail", "produce"],
          required: true,
        },
        type: {
          type: String,
          required: true,
        },
        sortIndex: {
          type: Number,
          required: true,
        },
        _id: false,
      },
    ],
    // Subtype ordering: which subtypes appear first within each type
    subtypeOrder: [
      {
        category: {
          type: String,
          enum: ["retail", "produce"],
          required: true,
        },
        type: {
          type: String,
          required: true,
        },
        subtype: {
          type: String,
          required: true,
        },
        sortIndex: {
          type: Number,
          required: true,
        },
        _id: false,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound index for fast lookups
menuSortOrderSchema.index({ uniId: 1, vendorId: 1 }, { unique: true });
menuSortOrderSchema.index({ uniId: 1 });

module.exports = Cluster_Item.model("MenuSortOrder", menuSortOrderSchema);

