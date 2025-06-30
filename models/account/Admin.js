const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Cluster_Accounts } = require("../../config/db");

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator'],
    default: 'admin'
  },
  permissions: {
    viewLocks: { type: Boolean, default: true },
    releaseLocks: { type: Boolean, default: true },
    clearAllLocks: { type: Boolean, default: false },
    viewStats: { type: Boolean, default: true },
    manageUsers: { type: Boolean, default: false },
    manageVendors: { type: Boolean, default: false },
    systemSettings: { type: Boolean, default: false }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better performance
adminSchema.index({ email: 1 });
adminSchema.index({ username: 1 });
adminSchema.index({ role: 1 });
adminSchema.index({ isActive: 1 });

// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.updatedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware to hash password on updates
adminSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  if (update.password) {
    try {
      const salt = await bcrypt.genSalt(12);
      update.password = await bcrypt.hash(update.password, salt);
      update.updatedAt = new Date();
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Instance method to compare password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Instance method to check if account is locked
adminSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Instance method to increment login attempts
adminSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return await this.updateOne(updates);
};

// Instance method to reset login attempts
adminSchema.methods.resetLoginAttempts = async function() {
  return await this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() }
  });
};

// Static method to find admin by credentials
adminSchema.statics.findByCredentials = async function(email, password) {
  const admin = await this.findOne({ email, isActive: true });
  if (!admin) {
    throw new Error('Invalid login credentials');
  }
  
  if (admin.isLocked()) {
    throw new Error('Account is temporarily locked due to too many failed attempts');
  }
  
  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    await admin.incLoginAttempts();
    throw new Error('Invalid login credentials');
  }
  
  await admin.resetLoginAttempts();
  return admin;
};

// Method to get public profile (without sensitive data)
adminSchema.methods.toPublicJSON = function() {
  const admin = this.toObject();
  delete admin.password;
  delete admin.loginAttempts;
  delete admin.lockUntil;
  return admin;
};

module.exports = Cluster_Accounts.model("Admin", adminSchema);
