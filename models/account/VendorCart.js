const mongoose = require('mongoose');
const { Cluster_Accounts } = require('../../config/db');

const vendorCartItemSchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 1
  },
  kind: {
    type: String,
    enum: ['Retail', 'Produce'],
    required: true
  },
  type: {
    type: String,
    required: true
  },
  isSpecial: {
    type: String,
    enum: ['Y', 'N'],
    default: 'N'
  },
  isAvailable: {
    type: String,
    enum: ['Y', 'N'],
    default: 'Y'
  }
});

const vendorCartSchema = new mongoose.Schema({
  vendorId: {
    type: String,
    required: true,
    unique: true
  },
  items: [vendorCartItemSchema],
  total: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
vendorCartSchema.index({ vendorId: 1 });

// Method to calculate total
vendorCartSchema.methods.calculateTotal = function() {
  this.total = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  return this.total;
};

// Pre-save middleware to update total and lastUpdated
vendorCartSchema.pre('save', function(next) {
  this.calculateTotal();
  this.lastUpdated = new Date();
  next();
});

module.exports = Cluster_Accounts.model('VendorCart', vendorCartSchema); 