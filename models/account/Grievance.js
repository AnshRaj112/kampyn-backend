const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../../config/db");

const grievanceSchema = new mongoose.Schema(
  {
    // Basic Information
    title: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 200
    },
    description: { 
      type: String, 
      required: true,
      trim: true,
      maxlength: 1000
    },
    
    // Severity Level
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
      default: "medium"
    },
    
    // Status and Progress
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed", "rejected"],
      default: "open"
    },
    
    // Category for better organization
    category: {
      type: String,
      enum: [
        "order_issue",
        "payment_issue", 
        "delivery_issue",
        "food_quality",
        "service_issue",
        "technical_issue",
        "billing_issue",
        "something_broken",
        "something_required",
        "things_too",
        "other"
      ],
      required: true
    },
    
    // Who raised the grievance
    raisedBy: {
      type: {
        type: String,
        enum: ["vendor", "university"],
        required: true
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
        // refPath: "raisedBy.type" // Temporarily disabled due to schema registration issues
      }
    },
    
    // University context (required for all grievances)
    uniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Uni",
      required: true
    },
    
    // Related entities (optional)
    relatedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      // ref: "Order", // Temporarily disabled due to schema registration issues
      default: null
    },
    
    // Progress tracking
    progress: [{
      status: {
        type: String,
        enum: ["open", "in_progress", "resolved", "closed", "rejected"],
        required: true
      },
      note: {
        type: String,
        trim: true,
        maxlength: 500
      },
      updatedBy: {
        type: {
          type: String,
          enum: ["vendor", "university", "admin"],
          required: true
        },
        id: {
          type: mongoose.Schema.Types.ObjectId,
          required: true
        }
      },
      updatedAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Resolution details
    resolution: {
      note: {
        type: String,
        trim: true,
        maxlength: 1000
      },
      resolvedBy: {
        type: {
          type: String,
          enum: ["vendor", "university", "admin"],
          required: false
        },
        id: {
          type: mongoose.Schema.Types.ObjectId,
          required: false
        }
      },
      resolvedAt: {
        type: Date,
        default: null
      }
    },
    
    // Priority based on severity and age
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium"
    },
    
    // Tags for better categorization
    tags: [{
      type: String,
      trim: true,
      maxlength: 50
    }],
    
    // Attachments (file URLs)
    attachments: [{
      url: { type: String, required: true },
      filename: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now }
    }],
    
    // Auto-escalation settings
    escalationLevel: {
      type: Number,
      default: 0,
      min: 0,
      max: 3
    },
    
    // SLA tracking
    slaDeadline: {
      type: Date,
      default: null
    },
    
    // Response tracking
    lastResponseAt: {
      type: Date,
      default: Date.now
    },
    
    // Internal notes (visible only to university/admin)
    internalNotes: [{
      note: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
      },
      addedBy: {
        type: {
          type: String,
          enum: ["university", "admin"],
          required: true
        },
        id: {
          type: mongoose.Schema.Types.ObjectId,
          required: true
        }
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better query performance
grievanceSchema.index({ uniId: 1, status: 1 });
grievanceSchema.index({ "raisedBy.type": 1, "raisedBy.id": 1 });
grievanceSchema.index({ severity: 1, status: 1 });
grievanceSchema.index({ category: 1 });
grievanceSchema.index({ createdAt: -1 });
grievanceSchema.index({ slaDeadline: 1 });

// Virtual for age in days
grievanceSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for isOverdue
grievanceSchema.virtual('isOverdue').get(function() {
  if (!this.slaDeadline) return false;
  return new Date() > this.slaDeadline && this.status !== 'resolved' && this.status !== 'closed';
});

// Pre-save middleware to set SLA deadline based on severity
grievanceSchema.pre('save', function(next) {
  if (this.isNew) {
    const now = new Date();
    let slaHours = 72; // Default 3 days
    
    switch (this.severity) {
      case 'critical':
        slaHours = 4; // 4 hours
        break;
      case 'high':
        slaHours = 24; // 1 day
        break;
      case 'medium':
        slaHours = 48; // 2 days
        break;
      case 'low':
        slaHours = 72; // 3 days
        break;
    }
    
    this.slaDeadline = new Date(now.getTime() + (slaHours * 60 * 60 * 1000));
    
    // Set priority based on severity
    switch (this.severity) {
      case 'critical':
        this.priority = 'urgent';
        break;
      case 'high':
        this.priority = 'high';
        break;
      case 'medium':
        this.priority = 'medium';
        break;
      case 'low':
        this.priority = 'low';
        break;
    }
  }
  next();
});

// Method to add progress update
grievanceSchema.methods.addProgressUpdate = function(status, note, updatedBy) {
  this.progress.push({
    status,
    note,
    updatedBy,
    updatedAt: new Date()
  });
  
  this.status = status;
  this.lastResponseAt = new Date();
  
  return this.save();
};

// Method to add internal note
grievanceSchema.methods.addInternalNote = function(note, addedBy) {
  this.internalNotes.push({
    note,
    addedBy,
    addedAt: new Date()
  });
  
  return this.save();
};

// Static method to get grievances by university
grievanceSchema.statics.getByUniversity = function(uniId, filters = {}) {
  return this.find({ uniId, ...filters })
    .populate('raisedBy.id', 'fullName email')
    .populate('relatedOrderId', 'orderNumber status')
    .sort({ createdAt: -1 });
};

// Static method to get grievances by vendor
grievanceSchema.statics.getByVendor = function(vendorId, uniId, filters = {}) {
  return this.find({ 
    uniId,
    'raisedBy.type': 'vendor',
    'raisedBy.id': vendorId,
    ...filters 
  })
    .populate('raisedBy.id', 'fullName email')
    .populate('relatedOrderId', 'orderNumber status')
    .sort({ createdAt: -1 });
};

module.exports = Cluster_Accounts.model("Grievance", grievanceSchema);
