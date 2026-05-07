const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const auditoriumSchema = new mongoose.Schema(
  {
    uniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Uni",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    sittingSpace: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: 0,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    amenities: {
      type: [String],
      default: [],
    },
    rules: {
      type: String,
      trim: true,
      maxlength: 1200,
      default: "",
    },
    coverImage: {
      type: String,
      default: "",
    },
    additionalImages: {
      type: [String],
      default: [],
    },
    images: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

auditoriumSchema.index({ uniId: 1, name: 1 }, { unique: true });

module.exports = Cluster_Accounts.model("Auditorium", auditoriumSchema);
