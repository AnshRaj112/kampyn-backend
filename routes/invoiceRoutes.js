const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoice/invoiceController');
const { adminAuthMiddleware } = require('../middleware/auth/adminAuthMiddleware');
const { uniOrSuperAdminAuth } = require('../middleware/auth/uniAuthMiddleware');
const jwt = require('jsonwebtoken');
const User = require('../models/account/User');
const Vendor = require('../models/account/Vendor');
const Uni = require('../models/account/Uni');
const Admin = require('../models/account/Admin');
const { checkUserActivity, updateUserActivity } = require('../utils/authUtils');
const logger = require('../utils/pinoLogger');

// ---------------------------------------------------------------------------
// invoiceMultiAuth
// ---------------------------------------------------------------------------
// Accepts a JWT belonging to any of the four actor types that may legitimately
// touch invoice data: platform admin, university staff, vendor, or end-user.
// On success exactly one of req.admin / req.uni / req.vendor / req.user is set.
// On failure a 401 is returned before the route handler runs.
// Tenant isolation is enforced for vendor and university tokens.
// ---------------------------------------------------------------------------
const invoiceMultiAuth = async (req, res, next) => {
  try {
    // --- 1. Extract token --------------------------------------------------
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies) {
      token = (
        req.cookies.adminToken ||
        req.cookies.uniToken ||
        req.cookies.vendorToken ||
        req.cookies.token
      );
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No token provided.'
      });
    }

    // --- 2. Verify JWT signature -------------------------------------------
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message:
          err.name === 'TokenExpiredError'
            ? 'Token expired. Please log in again.'
            : 'Invalid token.'
      });
    }

    const userId = decoded.userId;

    // --- 3. Resolve actor: platform admin (highest privilege) ---------------
    const admin = await Admin.findById(userId).select('-password');
    if (admin && admin.isActive) {
      const { shouldLogout } = await checkUserActivity(userId, 'admin');
      if (shouldLogout) {
        return res.status(401).json({
          success: false,
          message: 'Session expired due to inactivity. Please log in again.'
        });
      }
      await updateUserActivity(userId, 'admin');
      req.admin = {
        adminId: admin._id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      };
      return next();
    }

    // --- 4. Resolve actor: university staff ---------------------------------
    const university = await Uni.findById(userId).select('-password');
    if (university && university.isAvailable === 'Y') {
      // Cross-tenant guard: university token must match active tenant context
      if (req.tenantId && String(university._id) !== String(req.tenantId)) {
        return res.status(403).json({
          success: false,
          message:
            'Access denied. Your session does not belong to the requested university tenant context.'
        });
      }
      const { shouldLogout } = await checkUserActivity(userId, 'uni');
      if (shouldLogout) {
        return res.status(401).json({
          success: false,
          message: 'Session expired due to inactivity. Please log in again.'
        });
      }
      await updateUserActivity(userId, 'uni');
      req.uni = {
        _id: university._id,
        fullName: university.fullName,
        email: university.email
      };
      return next();
    }

    // --- 5. Resolve actor: vendor -------------------------------------------
    const vendor = await Vendor.findById(userId).select('-password').populate('services');
    if (vendor) {
      // Cross-tenant guard: vendor token must match active tenant context
      const vendorTenantId = vendor.tenantId || vendor.uniID;
      if (vendorTenantId && req.tenantId && String(vendorTenantId) !== String(req.tenantId)) {
        return res.status(403).json({
          success: false,
          message:
            'Access denied. Your session does not belong to the requested university tenant context.'
        });
      }
      const { shouldLogout } = await checkUserActivity(userId, 'vendor');
      if (shouldLogout) {
        return res.status(401).json({
          success: false,
          message: 'Session expired due to inactivity. Please log in again.'
        });
      }
      await updateUserActivity(userId, 'vendor');
      req.vendor = {
        _id: vendor._id,
        vendorId: vendor._id,
        email: vendor.email,
        fullName: vendor.fullName,
        uniID: vendor.uniID,
        services: vendor.services
      };
      return next();
    }

    // --- 6. Resolve actor: regular end-user ---------------------------------
    const user = await User.findById(userId);
    if (user) {
      // Cross-tenant guard: user token must match active tenant context
      const userTenantId = user.tenantId || user.uniID;
      if (userTenantId && req.tenantId && String(userTenantId) !== String(req.tenantId)) {
        return res.status(403).json({
          success: false,
          message:
            'Access denied. Your session does not belong to the requested university tenant context.'
        });
      }
      const { shouldLogout } = await checkUserActivity(userId, 'user');
      if (shouldLogout) {
        return res.status(401).json({
          success: false,
          message: 'Session expired due to inactivity. Please log in again.'
        });
      }
      await updateUserActivity(userId, 'user');
      req.user = { userId: user._id, userType: 'user' };
      return next();
    }

    // No actor matched — token decoded but references a deleted / unknown account
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Account not found.'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'invoiceMultiAuth: unexpected error');
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};

// ---------------------------------------------------------------------------
// Routes — user/vendor/uni/admin accessible
// IMPORTANT: Specific string segments (e.g. /admin, /stats) are declared
// BEFORE parameterized routes (e.g. /:invoiceId) to avoid route conflicts.
// ---------------------------------------------------------------------------

// Get invoices by order — order owner, owning vendor, uni staff, admin
router.get('/order/:orderId', invoiceMultiAuth, invoiceController.getInvoicesByOrder);

// Razorpay invoices for an order — same access policy as /order/:orderId
router.get('/order/:orderId/razorpay', invoiceMultiAuth, invoiceController.getOrderRazorpayInvoices);

// Download all invoices for an order as ZIP — same access policy
router.get('/order/:orderId/download', invoiceMultiAuth, invoiceController.downloadOrderInvoices);

// Cloudinary link listing for an order — same access policy
router.get('/order/:orderId/cloudinary', invoiceMultiAuth, invoiceController.getOrderCloudinaryLinks);

// Get vendor invoices — vendor (own only), uni staff, admin
router.get('/vendor/:vendorId', invoiceMultiAuth, invoiceController.getVendorInvoices);

// Get university invoices — uni staff (own uni only), super admin
router.get('/university/:uniId', uniOrSuperAdminAuth, invoiceController.getUniversityInvoices);

// Admin-only: platform invoice listing
router.get('/admin', adminAuthMiddleware, invoiceController.getAdminInvoices);

// Admin/uni-only: invoice statistics and bulk operations (DoS risk — restricted)
router.get('/stats', uniOrSuperAdminAuth, invoiceController.getInvoiceStats);

// Admin/uni-only: bulk download metadata
router.post('/bulk-download', adminAuthMiddleware, invoiceController.getInvoicesForBulkDownload);

// Admin/uni-only: bulk ZIP download with date range (DoS risk — admin only)
router.post('/bulk-zip-download', adminAuthMiddleware, invoiceController.bulkZipDownload);

// Admin/uni: generate invoices for an order
router.post('/generate-order-invoices', uniOrSuperAdminAuth, invoiceController.generateOrderInvoices);

// ---------------------------------------------------------------------------
// Parameterized routes — MUST come after all fixed-path routes above
// ---------------------------------------------------------------------------

// Download a specific invoice PDF — order owner, vendor, uni staff, admin
router.get('/:invoiceId/download', invoiceMultiAuth, invoiceController.downloadInvoice);

// Razorpay data for a specific invoice
router.get('/:invoiceId/razorpay', invoiceMultiAuth, invoiceController.getRazorpayInvoice);

// Cloudinary redirect for a specific invoice
router.get('/:invoiceId/cloudinary', invoiceMultiAuth, invoiceController.redirectToCloudinary);

// Get a specific invoice by ID — must be last among /:invoiceId routes
router.get('/:invoiceId', invoiceMultiAuth, invoiceController.getInvoiceById);

module.exports = router;
