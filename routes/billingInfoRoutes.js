const express = require('express');
const router = express.Router();
const {
  saveBillingInfo,
  getVendorBillingHistory,
  getCustomerBillingHistory,
  getBillingInfoByOrderNumber,
  updateBillingStatus
} = require('../controllers/account/billingInfoController');
const { billingInfoAuthMiddleware } = require('../middleware/auth/billingInfoAuthMiddleware');

// Billing records contain PII and must never be publicly accessible.
router.use(billingInfoAuthMiddleware);

router.post('/', saveBillingInfo);
router.get('/vendor/:vendorId', getVendorBillingHistory);
router.get('/customer/me', getCustomerBillingHistory);
// Keep the legacy path behind auth so anonymous callers still receive 401,
// but never accept a caller-supplied phone number as a record lookup key.
router.get('/customer/:phoneNumber', (req, res) => res.status(410).json({
  success: false,
  message: 'Customer history is available only at /billinginfo/customer/me.'
}));
router.get('/order/:orderNumber', getBillingInfoByOrderNumber);
router.put('/order/:orderNumber/status', updateBillingStatus);

module.exports = router; 
