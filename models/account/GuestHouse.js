const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const guestHouseSchema = new mongoose.Schema(
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
    totalRooms: {
      type: Number,
      required: true,
      min: 1,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    managerName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    managerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
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
    services: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Service" }
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    guestExperienceSettings: {
      inRoomFoodEnabled: {
        type: Boolean,
        default: false,
      },
      inRoomFoodMenuNote: {
        type: String,
        trim: true,
        maxlength: 240,
        default: "",
      },
      allowServiceRequests: {
        type: Boolean,
        default: true,
      },
    },
  },
  { timestamps: true }
);

guestHouseSchema.index({ uniId: 1, name: 1 }, { unique: true });

module.exports = Cluster_Accounts.model("GuestHouse", guestHouseSchema);

