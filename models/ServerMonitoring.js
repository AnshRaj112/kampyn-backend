const mongoose = require('mongoose');
const { Cluster_Cache_Analytics } = require('../config/db');

const serverMonitoringSchema = new mongoose.Schema({
  // Server status events (start, stop, crash)
  eventType: {
    type: String,
    enum: ['start', 'stop', 'crash', 'idle', 'active'],
    required: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  error: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// API hit tracking schema
const apiHitSchema = new mongoose.Schema({
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true,
    index: true
  },
  month: {
    type: String, // Format: YYYY-MM
    required: true,
    index: true
  },
  year: {
    type: String, // Format: YYYY
    required: true,
    index: true
  },
  hour: {
    type: Number, // 0-23
    required: true
  },
  minute: {
    type: Number, // 0-59
    required: true
  },
  endpoint: {
    type: String,
    required: true,
    index: true
  },
  method: {
    type: String,
    required: true
  },
  statusCode: {
    type: Number,
    required: true,
    index: true
  },
  responseTime: {
    type: Number, // in milliseconds
    default: 0
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  userId: {
    type: String,
    default: null,
    index: true
  },
  isAuthEndpoint: {
    type: Boolean,
    default: false,
    index: true
  },
  endpointCategory: {
    type: String, // e.g., 'auth', 'order', 'item', 'payment', etc.
    default: 'other',
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Daily aggregation schema for faster queries
const dailyApiStatsSchema = new mongoose.Schema({
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true,
    unique: true,
    index: true
  },
  totalHits: {
    type: Number,
    default: 0
  },
  hitsByHour: {
    type: Map,
    of: Number,
    default: {}
  },
  hitsByEndpoint: {
    type: Map,
    of: Number,
    default: {}
  },
  hitsByMethod: {
    type: Map,
    of: Number,
    default: {}
  },
  hitsByStatusCode: {
    type: Map,
    of: Number,
    default: {}
  },
  averageResponseTime: {
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

// Create indexes for better query performance
apiHitSchema.index({ date: 1, hour: 1 });
apiHitSchema.index({ month: 1 });
apiHitSchema.index({ year: 1 });
apiHitSchema.index({ timestamp: -1 });
apiHitSchema.index({ endpoint: 1 });
apiHitSchema.index({ endpointCategory: 1, timestamp: -1 });
apiHitSchema.index({ isAuthEndpoint: 1, timestamp: -1 });
apiHitSchema.index({ statusCode: 1, timestamp: -1 });

serverMonitoringSchema.index({ eventType: 1, timestamp: -1 });
serverMonitoringSchema.index({ timestamp: -1 });

const ServerEvent = Cluster_Cache_Analytics.model('ServerEvent', serverMonitoringSchema);
const ApiHit = Cluster_Cache_Analytics.model('ApiHit', apiHitSchema);
const DailyApiStats = Cluster_Cache_Analytics.model('DailyApiStats', dailyApiStatsSchema);

module.exports = {
  ServerEvent,
  ApiHit,
  DailyApiStats
};

