const mongoose = require("mongoose");
const { Cluster_User } = require('../../config/db');

const OtpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  // Temporary user data stored during signup (only used for signup OTPs)
  userData: {
    fullName: { type: String },
    phone: { type: String },
    password: { type: String }, // Hashed password
    gender: { type: String },
    uniID: { type: mongoose.Schema.Types.ObjectId, ref: "Uni" }
  },
  createdAt: { type: Date, default: Date.now, expires: 600 } // OTP expires after 10 minutes
});

module.exports = Cluster_User.model("Otp", OtpSchema);