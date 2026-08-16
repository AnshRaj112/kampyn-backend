const mongoose = require('mongoose');
const { Cluster_Accounts } = require('../../config/db');

const invoiceExportLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    actorType: { type: String, enum: ['admin', 'uni'], required: true },
    action: {
      type: String,
      enum: ['bulk_zip', 'bulk_metadata'],
      required: true
    },
    jobId: { type: String },
    invoiceCount: { type: Number, default: 0 },
    filters: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

invoiceExportLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

module.exports = Cluster_Accounts.model('InvoiceExportLog', invoiceExportLogSchema);
