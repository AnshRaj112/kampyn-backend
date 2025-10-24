// src/controllers/expressOrderController.js

const {
  initiateExpressOrder,
  getVendorExpressOrders,
  confirmExpressOrder,
} = require("../utils/expressOrderUtils");

/**
 * POST /express-order/initiate
 * Body JSON: { userId, vendorId, orderType, collectorName, collectorPhone, address }
 */
async function handleInitiate(req, res) {
  try {
    const expressOrder = await initiateExpressOrder(req.body);
    return res.status(201).json({ expressOrder });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/**
 * GET /express-order/vendor/:vendorId
 */
async function handleViewVendor(req, res) {
  try {
    const { vendorId } = req.params;
    const expressOrders = await getVendorExpressOrders(vendorId);
    return res.json({ expressOrders });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/**
 * POST /express-order/confirm/:orderId
 */
async function handleConfirm(req, res) {
  console.info("🔔 handleConfirm:", { params: req.params, body: req.body });
  try {
    const { orderId } = req.params;
    const order = await confirmExpressOrder(orderId);
    return res.json({ order });
  } catch (err) {
    console.error("❌ handleConfirm error:", err);
    return res.status(400).json({ error: err.message });
  }
}

module.exports = {
  handleInitiate,
  handleViewVendor,
  handleConfirm,
};
