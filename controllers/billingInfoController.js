const BillingInfo = require('../models/account/BillingInfo');
const logger = require('../utils/pinoLogger');

// Save billing information
const saveBillingInfo = async (req, res) => {
  try {
    const {
      vendorId,
      customerName,
      phoneNumber,
      paymentMethod,
      totalAmount,
      orderNumber,
      orderId,
      items,
      isGuest = true
    } = req.body;

    if (!vendorId || !customerName || !phoneNumber || !paymentMethod || !totalAmount || !orderNumber || !orderId || !items) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    const billingInfo = new BillingInfo({
      vendorId,
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
    const { limit = 50 } = req.query;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }

    const billingHistory = await BillingInfo.getVendorBillingHistory(vendorId, parseInt(limit));

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
    const { phoneNumber } = req.params;
    const { limit = 20 } = req.query;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    const billingHistory = await BillingInfo.getCustomerBillingHistory(phoneNumber, parseInt(limit));

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

    const billingInfo = await BillingInfo.findOneAndUpdate(
      { orderNumber },
      { status },
      { new: true }
    );

    if (!billingInfo) {
      return res.status(404).json({
        success: false,
        message: 'Billing information not found'
      });
    }

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