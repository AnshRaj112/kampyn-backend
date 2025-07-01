const mongoose = require('mongoose');
const { Cluster_Accounts } = require('../../config/db');

const billingInfoSchema = new mongoose.Schema({
  vendorId: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi'],
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  orderId: {
    type: String,
    required: true
  },
  items: [{
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
      required: true
    },
    kind: {
      type: String,
      enum: ['Retail', 'Produce'],
      required: true
    },
    type: {
      type: String,
      required: true
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending'
  },
  isGuest: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for faster queries
billingInfoSchema.index({ vendorId: 1 });
billingInfoSchema.index({ orderNumber: 1 });
billingInfoSchema.index({ phoneNumber: 1 });
billingInfoSchema.index({ createdAt: -1 });

// Method to get billing history for a vendor
billingInfoSchema.statics.getVendorBillingHistory = function(vendorId, limit = 50) {
  return this.find({ vendorId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Method to get billing history for a customer (by phone number)
billingInfoSchema.statics.getCustomerBillingHistory = function(phoneNumber, limit = 20) {
  return this.find({ phoneNumber })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = Cluster_Accounts.model('BillingInfo', billingInfoSchema); 