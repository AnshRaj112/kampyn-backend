const Invoice = require('../../models/invoice/Invoice');
const Order = require('../../models/order/Order');
const Vendor = require('../../models/account/Vendor');
const Uni = require('../../models/account/Uni');
const Admin = require('../../models/account/Admin');
const invoiceUtils = require('../../utils/invoiceUtils');
const { isValidCloudinaryUrl, isValidRazorpayUrl, isSafeExternalUrl } = require('../../utils/urlValidation');
const invoiceExportService = require('./invoiceExportService');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const os = require('os'); // Added for os module
const mongoose = require('mongoose');
const logger = require('../../utils/pinoLogger');

// Add fetch for Node.js (if not available)
let fetch;
if (typeof globalThis.fetch === 'undefined') {
  fetch = require('node-fetch');
} else {
  fetch = globalThis.fetch;
}

/**
 * Validates and sanitizes MongoDB ObjectId
 * @param {string} id - The ID to validate
 * @returns {string} - Sanitized ObjectId string
 * @throws {Error} - If ID is invalid
 */
function validateObjectId(id) {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid ID: must be a non-empty string');
  }
  
  // Remove any potentially dangerous characters and validate ObjectId format
  const sanitizedId = id.trim().replace(/[^a-f0-9]/gi, '');
  
  if (sanitizedId.length !== 24) {
    throw new Error('Invalid ObjectId format');
  }
  
  // Validate that it's a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(sanitizedId)) {
    throw new Error('Invalid ObjectId');
  }
  
  return sanitizedId;
}

/**
 * GET /invoices/vendor/:vendorId
 * Get all invoices for a specific vendor
 */
exports.getVendorInvoices = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status } = req.query;

    // --- Authorization ---------------------------------------------------
    // Vendor: may only view their own invoices.
    // University staff: may view vendors within their tenant.
    // Platform admin: unrestricted.
    if (req.vendor) {
      if (String(req.vendor.vendorId) !== String(vendorId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own vendor invoices.'
        });
      }
    } else if (req.uni) {
      // Uni access is scoped to their tenant — enforced via query filter below
    } else if (req.admin) {
      // Platform admin: no ownership constraint
    } else {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    // ---------------------------------------------------------------------

    // Validate vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    // Build query
    const query = { vendorId, recipientType: 'vendor' };

    // University staff: restrict results to their own tenant
    if (req.uni) {
      query.uniId = req.uni._id;
    }
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (status) {
      query.status = status;
    }
    
    // Execute query with pagination
    const skip = (page - 1) * limit;
    const invoices = await Invoice.find(query)
      .populate({ path: 'orderId', select: 'orderNumber status', model: Order })
      .populate({ path: 'uniId', select: 'fullName', model: Uni })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await Invoice.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalInvoices: total,
          hasNext: skip + invoices.length < total,
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting vendor invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor invoices',
      error: error.message
    });
  }
};

/**
 * GET /invoices/admin
 * Get all platform invoices for admin
 */
exports.getAdminInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate, status, vendorId, uniId } = req.query;
    
    // Build query for platform invoices
    const query = { recipientType: 'admin' };
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (status) {
      query.status = status;
    }
    
    if (vendorId) {
      query.vendorId = vendorId;
    }
    
    if (uniId) {
      query.uniId = uniId;
    }
    
    // Execute query with pagination
    const skip = (page - 1) * limit;
    const invoices = await Invoice.find(query)
      .populate({ path: 'orderId', select: 'orderNumber status', model: Order })
      .populate({ path: 'vendorId', select: 'fullName name', model: Vendor })
      .populate({ path: 'uniId', select: 'fullName', model: Uni })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await Invoice.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalInvoices: total,
          hasNext: skip + invoices.length < total,
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting admin invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin invoices',
      error: error.message
    });
  }
};

/**
 * GET /invoices/university/:uniId
 * Get all vendor invoices for a specific university (excludes platform invoices)
 */
exports.getUniversityInvoices = async (req, res) => {
  try {
    const { uniId } = req.params;
    const { page = 1, limit = 10, startDate, endDate, status, vendorId, invoiceType } = req.query;

    // --- Authorization ---------------------------------------------------
    // University staff: may only view their own university's invoices.
    // Platform admin (super_admin): unrestricted.
    if (req.uni) {
      if (String(req.uni._id) !== String(uniId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own university invoices.'
        });
      }
    } else if (req.admin) {
      // Platform admin: no ownership constraint
    } else {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    // ---------------------------------------------------------------------

    // Validate university exists
    const university = await Uni.findById(uniId);
    if (!university) {
      return res.status(404).json({
        success: false,
        message: 'University not found'
      });
    }
    
    // Build query - ONLY vendor invoices, exclude platform invoices
    const query = { 
      uniId,
      invoiceType: 'vendor', // Only show vendor invoices
      recipientType: 'vendor' // Ensure it's vendor recipient type
    };
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (status) {
      query.status = status;
    }
    
    if (vendorId) {
      query.vendorId = vendorId;
    }
    
    // invoiceType is already set to 'vendor', but allow override for filtering
    if (invoiceType && invoiceType !== 'vendor') {
      query.invoiceType = invoiceType;
    }
    
    // Execute query with pagination
    const skip = (page - 1) * limit;
    const invoices = await Invoice.find(query)
      .populate({ path: 'orderId', select: 'orderNumber status', model: Order })
      // Explicitly specify models from Accounts DB to avoid cross-connection registration issues
      .populate({ path: 'vendorId', select: 'fullName name', model: Vendor })
      // recipientId can be Vendor or Admin via refPath; avoid cross-connection populate here
      .sort({ createdAt: -1 }) // Latest reports first
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await Invoice.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        invoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalInvoices: total,
          hasNext: skip + invoices.length < total,
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    logger.error('Error getting university invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch university invoices',
      error: error.message
    });
  }
};

/**
 * GET /invoices/:invoiceId
 * Get a specific invoice by ID
 */
exports.getInvoiceById = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const invoice = await Invoice.findById(invoiceId)
      .populate({ path: 'vendorId', select: 'name fullName', model: Vendor })
      .populate({ path: 'uniId', select: 'fullName', model: Uni })
      .populate({ path: 'orderId', select: 'orderNumber status userId', model: Order })
      .lean();
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // --- Authorization ---------------------------------------------------
    // End-user: must own the order this invoice belongs to.
    // Vendor: must be the fulfilling vendor on this invoice.
    // University staff: invoice must belong to their tenant.
    // Platform admin: unrestricted.
    if (req.admin) {
      // Platform admin: no ownership constraint
    } else if (req.vendor) {
      if (String(invoice.vendorId?._id || invoice.vendorId) !== String(req.vendor.vendorId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This invoice does not belong to your vendor account.'
        });
      }
    } else if (req.uni) {
      if (String(invoice.uniId?._id || invoice.uniId) !== String(req.uni._id)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This invoice is outside your university tenant.'
        });
      }
    } else if (req.user) {
      const orderOwner = invoice.orderId?.userId;
      if (!orderOwner || String(orderOwner) !== String(req.user.userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not own this invoice.'
        });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    // ---------------------------------------------------------------------

    res.json({
      success: true,
      data: invoice
    });
    
  } catch (error) {
    logger.error('Error getting invoice by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message
    });
  }
};

/**
 * GET /invoices/order/:orderId
 * Get all invoices for a specific order
 */
exports.getInvoicesByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Validate order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // --- Authorization ---------------------------------------------------
    // End-user: must own the order.
    // Vendor: must be the fulfilling vendor on the order.
    // University staff: order must belong to their tenant.
    // Platform admin: unrestricted.
    if (req.admin) {
      // Platform admin: no ownership constraint
    } else if (req.user) {
      if (String(order.userId) !== String(req.user.userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not own this order.'
        });
      }
    } else if (req.vendor) {
      if (String(order.vendorId) !== String(req.vendor.vendorId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This order does not belong to your vendor account.'
        });
      }
    } else if (req.uni) {
      if (order.tenantId && String(order.tenantId) !== String(req.uni._id)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This order is outside your university tenant.'
        });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    // ---------------------------------------------------------------------

    const invoices = await Invoice.find({ orderId })
      // Explicitly specify models from Accounts DB to avoid cross-connection registration issues
      .populate({ path: 'vendorId', select: 'fullName name', model: Vendor })
      .populate({ path: 'uniId', select: 'fullName', model: Uni })
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      data: invoices
    });
    
  } catch (error) {
    logger.error('Error getting invoices by order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order invoices',
      error: error.message
    });
  }
};

/**
 * GET /invoices/:invoiceId/razorpay
 * Get invoice details directly from Razorpay API
 */
exports.getRazorpayInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    // Find the invoice in your database
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found in database'
      });
    }
    
    // Check if we have a Razorpay invoice ID
    if (!invoice.razorpayInvoiceId) {
      return res.status(404).json({
        success: false,
        message: 'No Razorpay invoice ID found for this invoice',
        invoice: {
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status
        }
      });
    }
    
    // Make request to Razorpay API
    const razorpayResponse = await fetch(`https://api.razorpay.com/v1/invoices/${invoice.razorpayInvoiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!razorpayResponse.ok) {
      const errorData = await razorpayResponse.json();
      return res.status(razorpayResponse.status).json({
        success: false,
        message: 'Failed to fetch from Razorpay API',
        razorpayError: errorData,
        invoice: {
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          razorpayInvoiceId: invoice.razorpayInvoiceId
        }
      });
    }
    
    const razorpayData = await razorpayResponse.json();
    
    res.json({
      success: true,
      data: {
        localInvoice: {
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceType: invoice.invoiceType,
          status: invoice.status,
          totalAmount: invoice.totalAmount
        },
        razorpayInvoice: razorpayData,
        downloadUrl: invoice.razorpayInvoiceUrl || invoice.pdfUrl
      }
    });
    
  } catch (error) {
    logger.error('Error fetching Razorpay invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Razorpay invoice',
      error: error.message
    });
  }
};

/**
 * GET /invoices/order/:orderId/razorpay
 * Get all Razorpay invoices for an order
 */
exports.getOrderRazorpayInvoices = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Validate order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Get all invoices for the order
    const invoices = await Invoice.find({ orderId })
      .populate({ path: 'vendorId', select: 'name fullName', model: Vendor })
      .populate({ path: 'uniId', select: 'fullName', model: Uni })
      .sort({ createdAt: -1 })
      .lean();
    
    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No invoices found for this order'
      });
    }
    
    // Fetch Razorpay data for each invoice that has a Razorpay ID
    const invoicesWithRazorpay = [];
    
    for (const invoice of invoices) {
      if (invoice.razorpayInvoiceId) {
        try {
          const razorpayResponse = await fetch(`https://api.razorpay.com/v1/invoices/${invoice.razorpayInvoiceId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (razorpayResponse.ok) {
            const razorpayData = await razorpayResponse.json();
            invoicesWithRazorpay.push({
              ...invoice,
              razorpayData,
              hasRazorpayData: true
            });
          } else {
            invoicesWithRazorpay.push({
              ...invoice,
              hasRazorpayData: false,
              razorpayError: 'Failed to fetch from Razorpay'
            });
          }
        } catch (error) {
          invoicesWithRazorpay.push({
            ...invoice,
            hasRazorpayData: false,
            razorpayError: error.message
          });
        }
      } else {
        invoicesWithRazorpay.push({
          ...invoice,
          hasRazorpayData: false,
          razorpayError: 'No Razorpay invoice ID'
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        orderId: order._id,
        invoices: invoicesWithRazorpay,
        message: 'Invoices with Razorpay data fetched successfully'
      }
    });
    
  } catch (error) {
    logger.error('Error getting order Razorpay invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order Razorpay invoices',
      error: error.message
    });
  }
};

/**
 * GET /invoices/:invoiceId/download
 * Download a specific invoice PDF
 */
exports.downloadInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    logger.info(`📥 Download request for invoice: ${invoiceId}`);
    
    // Find the invoice (include orderId.userId for ownership check)
    const invoice = await Invoice.findById(invoiceId)
      .populate({ path: 'orderId', select: 'userId', model: Order })
      .lean();
    if (!invoice) {
      logger.info(`❌ Invoice not found: ${invoiceId}`);
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    logger.info(`📄 Found invoice: ${invoice.invoiceNumber} (${invoice.invoiceType})`);

    // --- Authorization ---------------------------------------------------
    // Mirrors getInvoiceById: end-user owns order, vendor owns invoice,
    // uni staff within their tenant, admin unrestricted.
    if (req.admin) {
      // Platform admin: no ownership constraint
    } else if (req.vendor) {
      if (String(invoice.vendorId) !== String(req.vendor.vendorId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This invoice does not belong to your vendor account.'
        });
      }
    } else if (req.uni) {
      if (String(invoice.uniId) !== String(req.uni._id)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This invoice is outside your university tenant.'
        });
      }
    } else if (req.user) {
      const orderOwner = invoice.orderId?.userId;
      if (!orderOwner || String(orderOwner) !== String(req.user.userId)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not own this invoice.'
        });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    // ---------------------------------------------------------------------
    
    // Check if PDF URL exists
    if (!invoice.pdfUrl && !invoice.razorpayInvoiceUrl) {
      logger.info(`❌ No PDF or Razorpay URL found for invoice: ${invoiceId}`);
      return res.status(404).json({
        success: false,
        message: 'PDF not available for this invoice',
        invoice: {
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceType: invoice.invoiceType,
          status: invoice.status
        }
      });
    }
    
    // Priority 1: Try local file first
    if (invoice.pdfUrl && invoice.pdfUrl.startsWith('/uploads/')) {
      logger.info(`💾 Attempting local file download: ${invoice.pdfUrl}`);
      
      const filePath = path.join(process.cwd(), invoice.pdfUrl);
      logger.info(`📁 Full file path: ${filePath}`);
      
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        logger.info(`✅ Local file found: ${stats.size} bytes`);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice_${invoice.invoiceNumber}.pdf"`);
        res.setHeader('Content-Length', stats.size);
        
        return res.sendFile(filePath);
      } 
        logger.info(`❌ Local file not found: ${filePath}`);
      
    }
    
    // Priority 2: Try Cloudinary URL
    if (invoice.pdfUrl && isValidCloudinaryUrl(invoice.pdfUrl)) {
      logger.info(`☁️ Redirecting to Cloudinary: ${invoice.pdfUrl}`);
      return res.redirect(invoice.pdfUrl);
    }
    
    // Priority 3: Try Razorpay URL
    if (invoice.razorpayInvoiceUrl && isValidRazorpayUrl(invoice.razorpayInvoiceUrl)) {
      logger.info(`💳 Redirecting to Razorpay: ${invoice.razorpayInvoiceUrl}`);
      return res.redirect(invoice.razorpayInvoiceUrl);
    }
    
    // Priority 4: Try Razorpay API to get download URL
    if (invoice.razorpayInvoiceId) {
      logger.info(`🔑 Attempting Razorpay API download for: ${invoice.razorpayInvoiceId}`);
      
      try {
        const razorpayResponse = await fetch(`https://api.razorpay.com/v1/invoices/${invoice.razorpayInvoiceId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (razorpayResponse.ok) {
          const razorpayData = await razorpayResponse.json();
          logger.info(`✅ Razorpay data fetched: ${razorpayData.status}`);
          
          if (razorpayData.short_url) {
            logger.info(`🔗 Redirecting to Razorpay short URL: ${razorpayData.short_url}`);
            return res.redirect(razorpayData.short_url);
          }
        } else {
          logger.info(`❌ Razorpay API failed: ${razorpayResponse.status}`);
        }
      } catch (apiError) {
        logger.info(`❌ Razorpay API error: ${apiError.message}`);
      }
    }
    
    // If we get here, no download method worked
    logger.info(`❌ All download methods failed for invoice: ${invoiceId}`);
    res.status(404).json({
      success: false,
      message: 'No downloadable PDF available',
      invoice: {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        pdfUrl: invoice.pdfUrl,
        razorpayInvoiceId: invoice.razorpayInvoiceId,
        razorpayInvoiceUrl: invoice.razorpayInvoiceUrl
      }
    });
    
  } catch (error) {
    logger.error('❌ Error downloading invoice:', req.params.invoiceId, error);
    res.status(500).json({
      success: false,
      message: 'Failed to download invoice',
      error: error.message
    });
  }
};

/**
 * GET /invoices/order/:orderId/download
 * Download all invoices for an order as a ZIP file
 */
exports.downloadOrderInvoices = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    logger.info(`📦 ZIP download request for order: ${orderId}`);
    
    // Validate and sanitize orderId to prevent path injection
    const sanitizedOrderId = validateObjectId(orderId);
    
    // Validate order exists
    const order = await Order.findById(sanitizedOrderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Get all invoices for the order
    const invoices = await Invoice.find({ orderId: sanitizedOrderId })
      .populate({ path: 'vendorId', select: 'name', model: Vendor })
      .populate({ path: 'uniId', select: 'fullName', model: Uni })
      .sort({ createdAt: -1 })
      .lean();
    
    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No invoices found for this order'
      });
    }
    
    logger.info(`📄 Found ${invoices.length} invoices for order ${order.orderNumber}`);
    
    // Create secure temporary directory using sanitized orderId and timestamp
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const tempDir = path.join(os.tmpdir(), `invoices_${sanitizedOrderId}_${timestamp}_${randomSuffix}`);
    
    // Resolve tempDir and ensure it's within os.tmpdir()
    const resolvedTempDir = path.resolve(tempDir);
    const tempRoot = path.resolve(os.tmpdir());
    if (!resolvedTempDir.startsWith(tempRoot + path.sep)) {
      logger.error('Security violation: tempDir path escapes temp root:', resolvedTempDir);
      return res.status(400).json({
        success: false,
        message: 'Invalid path for invoice download.'
      });
    }

    // Ensure the directory is created safely
    if (!fs.existsSync(resolvedTempDir)) {
      fs.mkdirSync(resolvedTempDir, { recursive: true, mode: 0o700 });
    }
    
    const zipPath = path.join(tempDir, `invoices_${order.orderNumber}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
    
    // Listen for archive events
    archive.on('error', (err) => {
      logger.error('❌ ZIP creation error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to create ZIP file',
        error: err.message
      });
    });
    
    output.on('close', () => {
      logger.info(`✅ ZIP created successfully: ${archive.pointer()} bytes`);
      
      // Set response headers for ZIP download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="invoices_${order.orderNumber}.zip"`);
      res.setHeader('Content-Length', archive.pointer());
      
      // Send the ZIP file
      res.sendFile(zipPath, (err) => {
        if (err) {
          logger.error('❌ Error sending ZIP file:', err);
        }
        
        // Clean up temporary files
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          logger.info('🧹 Temporary files cleaned up');
        } catch (cleanupError) {
          logger.warn('⚠️ Failed to cleanup temp files:', cleanupError.message);
        }
      });
    });
    
    // Pipe archive data to the file
    archive.pipe(output);
    
    // Add invoices to the ZIP
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const invoice of invoices) {
      try {
        let pdfBuffer = null;
        let filename = `invoice_${invoice.invoiceNumber}_${invoice.invoiceType}.pdf`;
        
        // Priority 1: Try Cloudinary URL
        if (invoice.pdfUrl && isValidCloudinaryUrl(invoice.pdfUrl)) {
          logger.info(`☁️ Downloading from Cloudinary: ${invoice.invoiceNumber}`);
          
          try {
            const cloudinaryResponse = await fetch(invoice.pdfUrl);
            if (cloudinaryResponse.ok) {
              pdfBuffer = Buffer.from(await cloudinaryResponse.arrayBuffer());
              logger.info(`✅ Downloaded from Cloudinary: ${pdfBuffer.length} bytes`);
            } else {
              logger.info(`❌ Cloudinary download failed: ${cloudinaryResponse.status}`);
            }
          } catch (cloudinaryError) {
            logger.info(`❌ Cloudinary error: ${cloudinaryError.message}`);
          }
        }
        
        // Priority 2: Try Razorpay URL
        if (!pdfBuffer && invoice.razorpayInvoiceUrl && isValidRazorpayUrl(invoice.razorpayInvoiceUrl)) {
          logger.info(`💳 Downloading from Razorpay: ${invoice.invoiceNumber}`);
          
          try {
            const razorpayResponse = await fetch(invoice.razorpayInvoiceUrl);
            if (razorpayResponse.ok) {
              pdfBuffer = Buffer.from(await razorpayResponse.arrayBuffer());
              logger.info(`✅ Downloaded from Razorpay: ${pdfBuffer.length} bytes`);
            } else {
              logger.info(`❌ Razorpay download failed: ${razorpayResponse.status}`);
            }
          } catch (razorpayError) {
            logger.info(`❌ Razorpay error: ${razorpayError.message}`);
          }
        }
        
        // Priority 3: Try Razorpay API
        if (!pdfBuffer && invoice.razorpayInvoiceId) {
          logger.info(`🔑 Downloading from Razorpay API: ${invoice.invoiceNumber}`);
          
          try {
            const razorpayResponse = await fetch(`https://api.razorpay.com/v1/invoices/${invoice.razorpayInvoiceId}`, {
              method: 'GET',
              headers: {
                'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (razorpayResponse.ok) {
              const razorpayData = await razorpayResponse.json();
              if (razorpayData.short_url) {
                const pdfResponse = await fetch(razorpayData.short_url);
                if (pdfResponse.ok) {
                  pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
                  logger.info(`✅ Downloaded from Razorpay API: ${pdfBuffer.length} bytes`);
                }
              }
            }
          } catch (apiError) {
            logger.info(`❌ Razorpay API error: ${apiError.message}`);
          }
        }
        
        // Priority 4: Try local file
        if (!pdfBuffer && invoice.pdfUrl && invoice.pdfUrl.startsWith('/uploads/')) {
          logger.info(`💾 Reading local file: ${invoice.invoiceNumber}`);
          
          const filePath = path.join(process.cwd(), invoice.pdfUrl);
          if (fs.existsSync(filePath)) {
            pdfBuffer = fs.readFileSync(filePath);
            logger.info(`✅ Read local file: ${pdfBuffer.length} bytes`);
          }
        }
        
        // Add to ZIP if we have a PDF
        if (pdfBuffer) {
          archive.append(pdfBuffer, { name: filename });
          addedCount++;
          logger.info(`✅ Added to ZIP: ${filename}`);
        } else {
          skippedCount++;
          logger.info(`⏭️ Skipped (no PDF available): ${invoice.invoiceNumber}`);
          
          // Add a placeholder text file explaining why this invoice was skipped
          const placeholderContent = `Invoice ${invoice.invoiceNumber} (${invoice.invoiceType})
          
Status: ${invoice.status}
Total Amount: ${invoice.totalAmount}
Created: ${invoice.createdAt}

This invoice could not be included in the ZIP because:
- No PDF URL available
- Cloudinary/Razorpay download failed
- Local file not found

Please contact support for assistance.`;
          
          archive.append(placeholderContent, { name: `invoice_${invoice.invoiceNumber}_${invoice.invoiceType}_NOT_AVAILABLE.txt` });
        }
        
      } catch (invoiceError) {
        logger.error('❌ Error processing invoice:', invoice.invoiceNumber, invoiceError.message);
        skippedCount++;
        
        // Add error placeholder
        const errorContent = `Invoice ${invoice.invoiceNumber} (${invoice.invoiceType})
        
Error: ${invoiceError.message}
Status: ${invoice.status}
Total Amount: ${invoice.totalAmount}
Created: ${invoice.createdAt}

This invoice encountered an error during processing.`;
        
        archive.append(errorContent, { name: `invoice_${invoice.invoiceNumber}_${invoice.invoiceType}_ERROR.txt` });
      }
    }
    
    logger.info(`📊 ZIP Summary: ${addedCount} invoices added, ${skippedCount} skipped`);
    
    // Finalize the archive
    await archive.finalize();
    
  } catch (error) {
    logger.error('❌ Error creating ZIP for order:', req.params.orderId, error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ZIP file',
      error: error.message
    });
  }
};

/**
 * POST /invoices/bulk-download
 * Metadata listing for a capped date range. Auth, caps, rate limit, audit.
 */
exports.getInvoicesForBulkDownload = async (req, res) => {
  try {
    const result = await invoiceExportService.requestBulkMetadataExport(req);
    if (result.status === 429 && result.body.retryAfterSeconds) {
      res.set('Retry-After', String(result.body.retryAfterSeconds));
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error('Error getting invoices for bulk download:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices for bulk download'
    });
  }
};

/**
 * POST /invoices/bulk-zip-download
 * Enqueue an async ZIP export. Never builds the archive on the HTTP thread.
 */
exports.bulkZipDownload = async (req, res) => {
  try {
    const result = await invoiceExportService.requestBulkZipExport(req);
    if (result.status === 429 && result.body.retryAfterSeconds) {
      res.set('Retry-After', String(result.body.retryAfterSeconds));
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error('Error queueing bulk ZIP export:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to queue bulk ZIP export'
    });
  }
};

/**
 * GET /invoices/bulk-zip-jobs/:jobId
 * Poll async ZIP job status for the owning admin/uni actor.
 */
exports.getBulkZipJobStatus = async (req, res) => {
  try {
    const result = invoiceExportService.getExportJobForActor(req);
    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error('Error reading bulk ZIP job status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to read export job status'
    });
  }
};

/**
 * GET /invoices/bulk-zip-jobs/:jobId/file
 * Download a completed ZIP. 409 while the worker is still running.
 */
exports.downloadBulkZipFile = async (req, res) => {
  try {
    const result = invoiceExportService.getExportJobForActor(req);
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }

    const job = result.job;
    if (job.status === 'queued' || job.status === 'processing') {
      return res.status(409).json({
        success: false,
        message: 'Export is not ready yet',
        data: invoiceExportService.exportQueue.publicView(job)
      });
    }
    if (job.status !== 'completed' || !job.zipPath || !fs.existsSync(job.zipPath)) {
      return res.status(404).json({
        success: false,
        message: job.error || 'Export file is no longer available'
      });
    }

    invoiceExportService.exportQueue.markDownloaded(job);
    return res.download(job.zipPath, job.filename || path.basename(job.zipPath));
  } catch (error) {
    logger.error('Error sending bulk ZIP file:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to download export file'
      });
    }
  }
};

/**
 * POST /invoices/generate-order-invoices
 * Manually generate invoices for an order (admin only)
 */
exports.generateOrderInvoices = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }
    
    // Get order details
    const order = await Order.findById(orderId)
      .populate('items.itemId', 'name price priceExcludingTax gstPercentage sgstPercentage cgstPercentage hsnCode packable unit')
      .populate({ path: 'vendorId', select: 'name uniID', model: Vendor })
      .lean();
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Check if invoices already exist
    const existingInvoices = await Invoice.find({ orderId });
    if (existingInvoices.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invoices already exist for this order'
      });
    }
    
    // Prepare order data for invoice generation
    const orderData = {
      orderId: order._id,
      orderNumber: order.orderNumber,
      vendorId: order.vendorId._id,
      total: order.total,
      orderType: order.orderType,
      collectorName: order.collectorName,
      collectorPhone: order.collectorPhone,
      address: order.address,
      items: order.items.map(item => ({
        name: item.itemId?.name || 'Unknown Item',
        price: item.itemId?.price || 0,
        quantity: item.quantity,
        kind: item.kind,
        gstPercentage: item.itemId?.gstPercentage || 0,
        sgstPercentage: item.itemId?.sgstPercentage || 0,
        cgstPercentage: item.itemId?.cgstPercentage || 0,
        hsnCode: item.itemId?.hsnCode || 'N/A',
        packable: item.itemId?.packable || false,
        unit: item.itemId?.unit || 'piece'
      })),
      packagingCharge: 0, // Will be calculated based on university settings
      deliveryCharge: 0 // Will be calculated based on university settings
    };
    
    logger.info('🔍 Admin controller - prepared order data:', {
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      orderType: orderData.orderType,
      itemsCount: orderData.items.length,
      sampleItem: orderData.items[0] || 'No items',
      allItems: orderData.items.map(item => ({
        name: item.name,
        hsnCode: item.hsnCode,
        gstPercentage: item.gstPercentage,
        packable: item.packable
      }))
    });
    
    // Generate invoices
    const invoiceResults = await invoiceUtils.generateOrderInvoices(orderData);
    
    res.json({
      success: true,
      message: 'Invoices generated successfully',
      data: invoiceResults
    });
    
  } catch (error) {
    logger.error('Error generating order invoices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate invoices',
      error: error.message
    });
  }
};

/**
 * GET /invoices/stats
 * Get invoice statistics
 */
exports.getInvoiceStats = async (req, res) => {
  try {
    const { startDate, endDate, uniId } = req.query;
    
    const query = {};
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (uniId) {
      query.uniId = uniId;
    }
    
    // Get counts by type
    const vendorInvoiceCount = await Invoice.countDocuments({
      ...query,
      invoiceType: 'vendor'
    });
    
    const platformInvoiceCount = await Invoice.countDocuments({
      ...query,
      invoiceType: 'platform'
    });
    
    // Get total amounts
    const vendorTotal = await Invoice.aggregate([
      { $match: { ...query, invoiceType: 'vendor' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    const platformTotal = await Invoice.aggregate([
      { $match: { ...query, invoiceType: 'platform' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    // Get status distribution
    const statusStats = await Invoice.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      data: {
        counts: {
          vendor: vendorInvoiceCount,
          platform: platformInvoiceCount,
          total: vendorInvoiceCount + platformInvoiceCount
        },
        amounts: {
          vendor: vendorTotal[0]?.total || 0,
          platform: platformTotal[0]?.total || 0,
          total: (vendorTotal[0]?.total || 0) + (platformTotal[0]?.total || 0)
        },
        statusDistribution: statusStats
      }
    });
    
  } catch (error) {
    logger.error('Error getting invoice stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice statistics',
      error: error.message
    });
  }
};

/**
 * GET /invoices/:invoiceId/cloudinary
 * Redirect to Cloudinary PDF if available
 */
exports.redirectToCloudinary = async (req, res) => {
	try {
		const { invoiceId } = req.params;
		const invoice = await Invoice.findById(invoiceId).lean();
		if (!invoice) {
			return res.status(404).json({ success: false, message: 'Invoice not found' });
		}
		if (invoice.pdfUrl && isValidCloudinaryUrl(invoice.pdfUrl)) {
			return res.redirect(invoice.pdfUrl);
		}
		return res.status(404).json({ success: false, message: 'Cloudinary PDF not available for this invoice' });
	} catch (error) {
		logger.error('Error redirecting to Cloudinary:', error);
		return res.status(500).json({ success: false, message: 'Failed to redirect to Cloudinary', error: error.message });
	}
};

/**
 * GET /invoices/order/:orderId/cloudinary
 * Return Cloudinary links for all invoices in an order
 */
exports.getOrderCloudinaryLinks = async (req, res) => {
	try {
		const { orderId } = req.params;
		const order = await Order.findById(orderId).lean();
		if (!order) {
			return res.status(404).json({ success: false, message: 'Order not found' });
		}
		const invoices = await Invoice.find({ orderId }).select('invoiceNumber invoiceType pdfUrl').lean();
		const cloudinaryInvoices = invoices
			.filter(inv => inv.pdfUrl && isValidCloudinaryUrl(inv.pdfUrl))
			.map(inv => ({
				id: inv._id,
				invoiceNumber: inv.invoiceNumber,
				invoiceType: inv.invoiceType,
				cloudinaryUrl: inv.pdfUrl,
				downloadUrl: `/api/invoices/${inv._id}/cloudinary`
			}));
		return res.json({ success: true, data: { orderNumber: order.orderNumber, count: cloudinaryInvoices.length, invoices: cloudinaryInvoices } });
	} catch (error) {
		logger.error('Error getting order Cloudinary links:', error);
		return res.status(500).json({ success: false, message: 'Failed to get Cloudinary links', error: error.message });
	}
};
