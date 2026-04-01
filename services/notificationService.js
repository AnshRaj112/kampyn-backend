// src/services/notificationService.js
const logger = require("../utils/pinoLogger");

// Map to store active vendor connections
// vendorId -> Set of response objects
const vendorConnections = new Map();

/**
 * Register a new SSE connection for a vendor
 * @param {string} vendorId - The vendor ID
 * @param {object} res - Express response object
 */
function registerVendorConnection(vendorId, res) {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*' // Adjust as needed for security
  });

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ eventType: 'connected', timestamp: new Date() })}\n\n`);

  if (!vendorConnections.has(vendorId)) {
    vendorConnections.set(vendorId, new Set());
  }
  
  const connections = vendorConnections.get(vendorId);
  connections.add(res);
  
  logger.info({ vendorId, activeConnections: connections.size }, "New SSE connection registered for vendor");

  // Keep connection alive with heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Remove connection when it closes
  res.on('close', () => {
    clearInterval(heartbeatInterval);
    connections.delete(res);
    if (connections.size === 0) {
      vendorConnections.delete(vendorId);
    }
    logger.info({ vendorId, activeConnections: connections.size }, "SSE connection closed for vendor");
  });
}

/**
 * Send an event to all active connections for a vendor
 * @param {string} vendorId - The vendor ID
 * @param {string} eventType - Type of event (e.g., 'refresh-pending')
 * @param {object} data - Optional data payload
 */
function sendVendorEvent(vendorId, eventType, data = {}) {
  const connections = vendorConnections.get(vendorId);
  if (!connections || connections.size === 0) {
    logger.debug({ vendorId, eventType }, "No active SSE connections for vendor to receive event");
    return;
  }

  const payload = JSON.stringify({ eventType, ...data, timestamp: new Date() });
  const message = `data: ${payload}\n\n`;

  connections.forEach(res => {
    try {
      res.write(message);
    } catch (err) {
      logger.error({ vendorId, eventType, error: err.message }, "Error sending SSE message to connection");
    }
  });

  logger.info({ vendorId, eventType, connectionCount: connections.size }, "SSE event sent to vendor");
}

module.exports = {
  registerVendorConnection,
  sendVendorEvent
};
