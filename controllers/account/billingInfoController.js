const BillingInfo = require('../../models/account/BillingInfo');
const Vendor = require('../../models/account/Vendor');
const Order = require('../../models/order/Order');
const logger = require('../../utils/pinoLogger');

const MAX_LIMIT = 100;

function requestedLimit(value, fallback) {
  const limit = Number.parseInt(value, 10);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : fallback;
}

async function canAccessBillingInfo(actor, billingInfo) {
  if (actor.type === 'admin') return true;
  if (actor.type === 'vendor') return String(actor.id) === String(billingInfo.vendorId);

  if (actor.type === 'user') {
    const order = await Order.findOne({ orderNumber: billingInfo.orderNumber }).select('userId');
    return !!order && String(order.userId) === String(actor.id);
  }

  if (actor.type === 'uni') {
    const vendor = await Vendor.findById(billingInfo.vendorId).select('tenantId uniID');
    return !!vendor && String(vendor.tenantId || vendor.uniID) === String(actor.tenantId);
  }

  return false;
}

// Save billing information
const saveBillingInfo = async (req, res) => {
  try {
    const {
      vendorId: requestedVendorId,
      customerName,
      phoneNumber,
      paymentMethod,
      totalAmount,
      orderNumber,
      orderId,
      items,
      isGuest = true
    } = req.body;

    if (!customerName || !phoneNumber || !paymentMethod || !totalAmount || !orderNumber || !orderId || !items) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    if (req.billingActor.type !== 'vendor') {
      return res.status(403).json({ success: false, message: 'Only the owning vendor can create billing information.' });
    }
    if (requestedVendorId && String(requestedVendorId) !== String(req.billingActor.id)) {
      return res.status(403).json({ success: false, message: 'Vendor identity must match the authenticated account.' });
    }

    // Do not let a vendor create a billing record for another vendor's order.
    const order = await Order.findOne({ orderNumber, vendorId: req.billingActor.id }).select('_id');
    if (!order || (orderId && String(order._id) !== String(orderId))) {
      return res.status(403).json({ success: false, message: 'You can only create billing information for your own order.' });
    }

    const billingInfo = new BillingInfo({
      vendorId: String(req.billingActor.id),
      customerName,
      phoneNumber,
      paymentMethod,
      totalAmount,
      orderNumber,
      orderId,
      items,
      isGuest
    });

    await billingInfo.save();

    res.json({
      success: true,
      data: billingInfo,
      message: 'Billing information saved successfully'
    });
  } catch (error) {
    logger.error('Error saving billing info:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get vendor billing history
const getVendorBillingHistory = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const limit = requestedLimit(req.query.limit, 50);

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }

    const actor = req.billingActor;
    if (actor.type === 'vendor' && String(actor.id) !== String(vendorId)) {
      return res.status(403).json({ success: false, message: 'You can only view your own billing history.' });
    }
    if (actor.type === 'user') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (actor.type === 'uni') {
      const vendor = await Vendor.findById(vendorId).select('tenantId uniID');
      if (!vendor || String(vendor.tenantId || vendor.uniID) !== String(actor.tenantId)) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    const billingHistory = await BillingInfo.getVendorBillingHistory(vendorId, limit);

    res.json({
      success: true,
      data: billingHistory,
      count: billingHistory.length
    });
  } catch (error) {
    logger.error('Error getting vendor billing history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get customer billing history
const getCustomerBillingHistory = async (req, res) => {
  try {
    const limit = requestedLimit(req.query.limit, 20);

    // Never use a URL/body phone number as authority. Customer history is
    // always resolved from the authenticated user's verified account record.
    if (req.billingActor.type !== 'user' || !req.billingActor.phone) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const billingHistory = await BillingInfo.getCustomerBillingHistory(req.billingActor.phone, limit);

    res.json({
      success: true,
      data: billingHistory,
      count: billingHistory.length
    });
  } catch (error) {
    logger.error('Error getting customer billing history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get specific billing info by order number
const getBillingInfoByOrderNumber = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    if (!orderNumber) {
      return res.status(400).json({
        success: false,
        message: 'Order number is required'
      });
    }

    const billingInfo = await BillingInfo.findOne({ orderNumber });

    if (!billingInfo) {
      return res.status(404).json({
        success: false,
        message: 'Billing information not found'
      });
    }

    if (!(await canAccessBillingInfo(req.billingActor, billingInfo))) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    res.json({
      success: true,
      data: billingInfo
    });
  } catch (error) {
    logger.error('Error getting billing info by order number:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update billing status
const updateBillingStatus = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { status } = req.body;

    if (!orderNumber || !status) {
      return res.status(400).json({
        success: false,
        message: 'Order number and status are required'
      });
    }

    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be pending, completed, or cancelled'
      });
    }

    const billingInfo = await BillingInfo.findOne({ orderNumber });

    if (!billingInfo) {
      return res.status(404).json({
        success: false,
        message: 'Billing information not found'
      });
    }

    if (req.billingActor.type === 'user' || !(await canAccessBillingInfo(req.billingActor, billingInfo))) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    billingInfo.status = status;
    await billingInfo.save();

    res.json({
      success: true,
      data: billingInfo,
      message: 'Billing status updated successfully'
    });
  } catch (error) {
    logger.error('Error updating billing status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  saveBillingInfo,
  getVendorBillingHistory,
  getCustomerBillingHistory,
  getBillingInfoByOrderNumber,
  updateBillingStatus
}; 
