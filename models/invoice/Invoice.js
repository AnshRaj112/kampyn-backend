const mongoose = require("mongoose");
const { Cluster_Order } = require("../../config/db");

const invoiceSchema = new mongoose.Schema({
  // Invoice identification
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    required: true
  },
  orderNumber: {
    type: String,
    required: true
  },
  
  // Invoice type and recipient
  invoiceType: {
    type: String,
    enum: ["vendor", "platform"],
    required: true
  },
  recipientType: {
    type: String,
    enum: ["vendor", "admin"],
    required: true
  },
  
  // Recipient details
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "recipientModel",
    required: true
  },
  recipientModel: {
    type: String,
    enum: ["Vendor", "Admin"],
    required: true
  },
  
  // Order details
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: true
  },
  vendorName: {
    type: String,
    required: true
  },
  vendorLocation: {
    type: String,
    required: true
  },
  uniId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Uni",
    required: true
  },
  uniName: {
    type: String,
    required: true
  },
  
  // GST Information
  gstNumber: {
    type: String,
    required: true
  },
  gstNumberType: {
    type: String,
    enum: ["vendor", "university"],
    required: true
  },
  
  // Customer details
  customerName: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  customerAddress: {
    type: String
  },
  
  // Financial details
  subtotal: {
    type: Number,
    required: true
  },
  subtotalBeforeGst: {
    type: Number,
    required: true
  },
  platformFee: {
    type: Number,
    required: true
  },
  gstAmount: {
    type: Number,
    required: true
  },
  cgstAmount: {
    type: Number,
    required: true
  },
  sgstAmount: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: "INR"
  },
  
  // Items breakdown with detailed GST information
  items: [{
    name: String,
    quantity: Number,
    unitPrice: Number,
    priceBeforeGst: Number,
    totalPrice: Number,
    hsnCode: String,
    gstPercentage: Number,
    cgstPercentage: Number,
    sgstPercentage: Number,
    cgstAmount: Number,
    sgstAmount: Number,
    gstAmount: Number,
    totalAfterGst: Number,
    kind: {
      type: String,
      enum: ["Retail", "Produce"]
    }
  }],
  
  // Additional charges
  packagingCharge: {
    type: Number,
    default: 0
  },
  deliveryCharge: {
    type: Number,
    default: 0
  },
  
  // Razorpay integration
  razorpayInvoiceId: {
    type: String
  },
  razorpayInvoiceUrl: {
    type: String
  },
  
  // PDF storage
  pdfUrl: {
    type: String
  },
  cloudinaryPublicId: {
    type: String
  },
  
  // Status and metadata
  status: {
    type: String,
    enum: ["draft", "sent", "paid", "cancelled"],
    default: "draft"
  },
  dueDate: {
    type: Date
  },
  paidAt: {
    type: Date
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
invoiceSchema.index({ orderId: 1, invoiceType: 1 });
invoiceSchema.index({ vendorId: 1, createdAt: -1 });
invoiceSchema.index({ uniId: 1, createdAt: -1 });
invoiceSchema.index({ recipientId: 1, recipientModel: 1 });
invoiceSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ invoiceNumber: 1 });

// Pre-save middleware to update updatedAt
invoiceSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to generate invoice number
invoiceSchema.statics.generateInvoiceNumber = async function(invoiceType, uniId) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  // Get count of invoices for this month
  const startOfMonth = new Date(year, date.getMonth(), 1);
  const endOfMonth = new Date(year, date.getMonth() + 1, 0);
  
  const count = await this.countDocuments({
    createdAt: { $gte: startOfMonth, $lte: endOfMonth },
    uniId: uniId
  });
  
  const sequence = String(count + 1).padStart(4, '0');
  const typePrefix = invoiceType === 'vendor' ? 'V' : 'P';
  
  return `${typePrefix}${year}${month}${sequence}`;
};

module.exports = Cluster_Order.model("Invoice", invoiceSchema);
