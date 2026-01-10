const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice/invoiceController');

// Authentication removed - anyone can access invoice routes for now

// Get invoices by order ID
router.get('/order/:orderId', invoiceController.getInvoicesByOrder);

// Get Razorpay invoices for an order (direct Razorpay API integration)
router.get('/order/:orderId/razorpay', invoiceController.getOrderRazorpayInvoices);

// Download all invoices for an order
router.get('/order/:orderId/download', invoiceController.downloadOrderInvoices);

// Get vendor invoices
router.get('/vendor/:vendorId', invoiceController.getVendorInvoices);

// Get university invoices
router.get('/university/:uniId', invoiceController.getUniversityInvoices);

// Get admin invoices
router.get('/admin', invoiceController.getAdminInvoices);

// Get invoice statistics
router.get('/stats', invoiceController.getInvoiceStats);

// Bulk download invoices
router.post('/bulk-download', invoiceController.getInvoicesForBulkDownload);

// Bulk ZIP download with date range filtering
router.post('/bulk-zip-download', invoiceController.bulkZipDownload);

// Generate order invoices
router.post('/generate-order-invoices', invoiceController.generateOrderInvoices);

// IMPORTANT: Place specific routes BEFORE parameterized routes to avoid conflicts
// Download a specific invoice PDF
router.get('/:invoiceId/download', invoiceController.downloadInvoice);

// Get specific invoice from Razorpay API
router.get('/:invoiceId/razorpay', invoiceController.getRazorpayInvoice);

// Get a specific invoice by ID (this should be last to avoid conflicts)
router.get('/:invoiceId', invoiceController.getInvoiceById);

// List Cloudinary links for an order
router.get('/order/:orderId/cloudinary', invoiceController.getOrderCloudinaryLinks);

// Redirect to Cloudinary for a specific invoice
router.get('/:invoiceId/cloudinary', invoiceController.redirectToCloudinary);

module.exports = router;
