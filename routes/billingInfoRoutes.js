const express = require('express');
const router = express.Router();
const {
  saveBillingInfo,
  getVendorBillingHistory,
  getCustomerBillingHistory,
  getBillingInfoByOrderNumber,
  updateBillingStatus
} = require('../controllers/billingInfoController');

// Save billing information
router.post('/', saveBillingInfo);

// Get vendor billing history
router.get('/vendor/:vendorId', getVendorBillingHistory);

// Get customer billing history
router.get('/customer/:phoneNumber', getCustomerBillingHistory);

// Get specific billing info by order number
router.get('/order/:orderNumber', getBillingInfoByOrderNumber);

// Update billing status
router.put('/order/:orderNumber/status', updateBillingStatus);

module.exports = router; 