const logger = require("../utils/pinoLogger");

const vendorClients = new Map();

function addVendorClient(vendorId, res) {
  const key = String(vendorId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  res.write(`event: connected\ndata: {"status":"ok"}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 25000);

  const clients = vendorClients.get(key) || new Set();
  clients.add(res);
  vendorClients.set(key, clients);

  logger.info({ vendorId: key, totalClients: clients.size }, "Vendor SSE client connected");

  res.on("close", () => {
    clearInterval(heartbeat);
    removeVendorClient(key, res);
  });
}

function removeVendorClient(vendorId, res) {
  const key = String(vendorId);
  const clients = vendorClients.get(key);
  if (!clients) return;

  clients.delete(res);
  if (clients.size === 0) {
    vendorClients.delete(key);
  }

  logger.info({ vendorId: key, remainingClients: clients.size }, "Vendor SSE client disconnected");
}

function sendVendorNotification(vendorId, eventName, payload) {
  const key = String(vendorId);
  const clients = vendorClients.get(key);
  if (!clients || clients.size === 0) {
    logger.debug({ vendorId: key, eventName }, "No active SSE clients for vendor");
    return;
  }

  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => {
    try {
      client.write(data);
    } catch (err) {
      logger.warn({ vendorId: key, error: err.message }, "Failed to write SSE payload, removing client");
      removeVendorClient(key, client);
    }
  });
}

module.exports = {
  addVendorClient,
  sendVendorNotification,
};

