const Razorpay = require('razorpay');
const cloudinary = require('cloudinary').v2;
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Invoice = require('../models/invoice/Invoice');
const Vendor = require('../models/account/Vendor');
const Uni = require('../models/account/Uni');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Configuration for invoice generation
const INVOICE_CONFIG = {
  // Set to false to completely disable Razorpay invoice creation
  enableRazorpayInvoices: process.env.ENABLE_RAZORPAY_INVOICES !== 'false',
  // Set to true to skip Razorpay for orders with insufficient customer data
  skipRazorpayForIncompleteData: process.env.SKIP_RAZORPAY_FOR_INCOMPLETE_DATA === 'true',
  // Minimum customer data quality score (0-100) to proceed with Razorpay
  minCustomerDataQuality: parseInt(process.env.MIN_CUSTOMER_DATA_QUALITY) || 70
};

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary trust configuration
const CLOUDINARY_CONFIG = {
  enableTrustCheck: process.env.CLOUDINARY_ENABLE_TRUST_CHECK !== 'false',
  maxRetries: parseInt(process.env.CLOUDINARY_MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.CLOUDINARY_RETRY_DELAY) || 1000,
  enableFallback: process.env.CLOUDINARY_ENABLE_FALLBACK !== 'false'
};


/**
 * Generate invoices for an order
 * Creates two invoices: one for vendor (total - platform fee) and one for platform fee
 */
exports.generateOrderInvoices = async (orderData) => {
  try {
    
    // Get vendor and university details
    const vendor = await Vendor.findById(orderData.vendorId);
    const university = await Uni.findById(vendor.uniID);
    
    // Populate order items with full details from Retail/Produce models
    const populatedItems = await Promise.all(
      orderData.items.map(async (item) => {
        try {
          let itemDetails = null;
          
          // Always populate items that have itemId references
          if (item.itemId) {
            
            if (item.kind === "Retail") {
              const Retail = require("../models/item/Retail");
              itemDetails = await Retail.findById(item.itemId);
            } else if (item.kind === "Produce") {
              const Produce = require("../models/item/Produce");
              itemDetails = await Produce.findById(item.itemId);
            }
            
            if (!itemDetails) {
              console.warn(`⚠️ Item details not found for ${item.kind} item: ${item.itemId}`);
              return {
                ...item,
                name: item.name || "Unknown Item",
                price: item.price || 0,
                hsnCode: "N/A",
                gstPercentage: 0,
                sgstPercentage: 0,
                cgstPercentage: 0,
                packable: item.packable || false
              };
            }
            
            
                         return {
               ...item,
               name: itemDetails.name,
               price: itemDetails.price,
               priceExcludingTax: itemDetails.priceExcludingTax, // Use the existing price before GST
               hsnCode: itemDetails.hsnCode,
               gstPercentage: itemDetails.gstPercentage,
               sgstPercentage: itemDetails.sgstPercentage,
               cgstPercentage: itemDetails.cgstPercentage,
               packable: itemDetails.packable
             };
          } 
            // Item already has all required data
            return {
              ...item,
              packable: item.packable || (item.kind === "Produce")
            };
          
        } catch (err) {
          console.error(`❌ Error populating item ${item.itemId || item.name}:`, err);
          return {
            ...item,
            name: item.name || "Unknown Item",
            price: item.price || 0,
            hsnCode: "N/A",
            gstPercentage: 0,
            sgstPercentage: 0,
            cgstPercentage: 0,
            packable: item.packable || false
          };
        }
      })
    );
    
    // Update orderData with populated items
    const populatedOrderData = {
      ...orderData,
      items: populatedItems
    };
    
    
    if (!vendor || !university) {
      throw new Error('Required entities not found for invoice generation');
    }
    
    
    // Determine which GST number to use
    const effectiveGstNumber = vendor.useUniGstNumber ? university.gstNumber : (vendor.gstNumber || university.gstNumber);
    const gstNumberType = vendor.useUniGstNumber ? 'university' : 'vendor';
    
    
    // Calculate amounts first
    const platformFee = university.platformFee || 2; // University-specific platform fee, default ₹2
    // For platform fee total including GST: base amount = platformFee/1.18, GST = platformFee - base
    const platformFeeBase = Math.round((platformFee / 1.18) * 100) / 100;
    const platformFeeGST = Math.round((platformFee - platformFeeBase) * 100) / 100;
    
    // Get reference values for packing and delivery charges from university
    // These are used for display purposes only - the actual charges are already included in orderData.total
    const packingCharge = university.packingCharge || 5; // Default ₹5 if not set
    const deliveryCharge = university.deliveryCharge || 50; // Default ₹50 if not set
    
    // Calculate item total (excluding charges)
    const itemTotal = populatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Calculate reference packing charges for packable items (takeaway and delivery)
    // These are for display purposes only - actual charges are already in order total
    // Packing charge = Rs. 5 per packable item × quantity of each packable item
    const packableItems = populatedItems.filter(item => 
      item.kind === "Produce" || item.packable === true
    );
    const packingTotal = (orderData.orderType !== "dinein") ? 
      packableItems.reduce((sum, item) => sum + (packingCharge * item.quantity), 0) : 0;
    
    // Calculate reference delivery charge (only for delivery orders)
    // This is for display purposes only - actual charge is already in order total
    const deliveryTotal = (orderData.orderType === "delivery") ? deliveryCharge : 0;
    
    
    // Calculate vendor amount (total - platform fee)
    const vendorAmount = orderData.total - platformFee;
    
    
        // Generate vendor invoice
    const vendorInvoice = await generateVendorInvoice({
      orderData: populatedOrderData,
      vendor,
      university,
      amount: vendorAmount,
      platformFee: 0,
      effectiveGstNumber,
      gstNumberType,
      packingTotal,
      deliveryTotal,
      orderType: orderData.orderType,
      itemTotal: itemTotal
    });

    // Generate platform invoice
    const platformInvoice = await generatePlatformInvoice({
      orderData: populatedOrderData,
      vendor,
      university,
      amount: platformFee, // Total amount is ₹2
      platformFee: platformFeeBase, // Base amount is ₹1.69
      gstAmount: platformFeeGST, // GST amount is ₹0.31
      effectiveGstNumber,
      gstNumberType
    });
    
    
    return {
      vendorInvoice: vendorInvoice._id,
      platformInvoice: platformInvoice._id,
      vendorInvoiceNumber: vendorInvoice.invoiceNumber,
      platformInvoiceNumber: platformInvoice.invoiceNumber
    };
    
  } catch (error) {
    console.error('❌ Error generating invoices:', error);
    throw error;
  }
};

/**
 * Generate vendor invoice (total - platform fee)
 */
async function generateVendorInvoice({ orderData, vendor, university, amount, platformFee, effectiveGstNumber, gstNumberType, packingTotal, deliveryTotal, orderType, itemTotal }) {
  try {
    // Generate invoice number
    const invoiceNumber = await Invoice.generateInvoiceNumber('vendor', university._id);
    
    // Calculate detailed GST breakdown for items
    const itemsWithGst = orderData.items.map(item => {
      
                    // Use individual SGST and CGST percentages if available, otherwise calculate from total GST
        const sgstPercentage = item.sgstPercentage || ((item.gstPercentage || 0) / 2);
        const cgstPercentage = item.cgstPercentage || ((item.gstPercentage || 0) / 2);
        const totalGstPercentage = item.gstPercentage || (sgstPercentage + cgstPercentage);
        
        // Use priceExcludingTax if available, otherwise calculate from final price
        const priceBeforeGst = item.priceExcludingTax || (item.price / (1 + (totalGstPercentage / 100)));
        
        // Calculate GST amounts based on price before GST
        const gstAmount = priceBeforeGst * (totalGstPercentage / 100);
        const cgstAmount = priceBeforeGst * (cgstPercentage / 100);
        const sgstAmount = priceBeforeGst * (sgstPercentage / 100);
        
        const totalAfterGst = priceBeforeGst + gstAmount;
      
      const processedItem = {
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        priceBeforeGst: Math.round(priceBeforeGst * 100) / 100,
        totalPrice: item.price * item.quantity,
        hsnCode: item.hsnCode || 'N/A',
        gstPercentage: totalGstPercentage,
        cgstPercentage: cgstPercentage,
        sgstPercentage: sgstPercentage,
        cgstAmount: Math.round(cgstAmount * 100) / 100,
        sgstAmount: Math.round(sgstAmount * 100) / 100,
        gstAmount: Math.round(gstAmount * 100) / 100,
        totalAfterGst: Math.round(totalAfterGst * 100) / 100,
        kind: item.kind
      };
      
      
      return processedItem;
    });
    
    // Calculate total GST amounts
    const totalGstAmount = itemsWithGst.reduce((sum, item) => sum + item.gstAmount, 0);
    const totalCgstAmount = itemsWithGst.reduce((sum, item) => sum + item.cgstAmount, 0);
    const totalSgstAmount = itemsWithGst.reduce((sum, item) => sum + item.sgstAmount, 0);
    const subtotalBeforeGst = itemsWithGst.reduce((sum, item) => sum + item.priceBeforeGst, 0);
    
     
    
    // Create Razorpay invoice (with fallback)
     let razorpayInvoice = null;
     
     // Check if Razorpay invoices are enabled
     if (!INVOICE_CONFIG.enableRazorpayInvoices) {
     } else {
       try {
       // Validate and sanitize customer data for Razorpay
       const customerName = orderData.collectorName?.trim();
       const customerPhone = orderData.collectorPhone?.trim();
       
       
       // Check if we have valid customer data
       let finalCustomerName, finalCustomerPhone, shouldCreateRazorpayInvoice;
       
       if (customerName && customerPhone && 
           customerName.length > 0 && customerPhone.length > 0 &&
           customerPhone !== '0000000000' && customerPhone !== '9999999999' &&
           customerName !== 'Customer' && customerName !== 'Test Customer') {
         
         // We have real customer data, proceed with Razorpay
         shouldCreateRazorpayInvoice = true;
         
         // Ensure customer name is valid (remove special characters, limit length)
         const sanitizedName = customerName
           .replace(/[^\w\s\-_]/g, '') // Remove special characters except spaces, hyphens, and underscores
           .replace(/\s+/g, ' ') // Replace multiple spaces with single space
           .trim()
           .substring(0, 50); // Limit to 50 characters
         
         finalCustomerName = sanitizedName || customerName.substring(0, 50);
         finalCustomerPhone = customerPhone;
         
       } else {
         // No valid customer data, skip Razorpay invoice creation
         shouldCreateRazorpayInvoice = false;
         finalCustomerName = customerName || 'Customer';
         finalCustomerPhone = customerPhone || '0000000000';
         
       }
       
       
       if (shouldCreateRazorpayInvoice) {
         // Only create Razorpay invoice if we have valid customer data
         razorpayInvoice = await createRazorpayInvoice({
           type: 'invoice',
           description: `Invoice for order ${orderData.orderNumber} - ${vendor.fullName || 'Vendor'}`,
           customer: {
             name: finalCustomerName,
             contact: finalCustomerPhone,
             billing_address: {
               line1: orderData.address || 'Customer Address',
               city: 'Mumbai',
               state: 'Maharashtra',
               country: 'in'
             }
           },
           line_items: [
             ...orderData.items.map(item => ({
               name: item.name,
               description: `${item.kind} item`,
               amount: Math.round((item.price * item.quantity) * 100), // Convert to paise
               currency: 'INR',
               quantity: item.quantity
             })),
             ...(packingTotal > 0 ? [{
               name: 'Packaging Charge',
               description: `Packaging charge for packable items`,
               amount: Math.round(packingTotal * 100), // Convert to paise
               currency: 'INR',
               quantity: 1
             }] : []),
             ...(deliveryTotal > 0 ? [{
               name: 'Delivery Charge',
               description: 'Delivery service charge',
               amount: Math.round(deliveryTotal * 100), // Convert to paise
               currency: 'INR',
               quantity: 1
             }] : [])
           ],
           currency: 'INR',
           expire_by: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
           notes: {
             order_number: orderData.orderNumber,
             vendor_id: vendor._id.toString(),
             university: university.fullName
           }
         });
       } else {
       }
       } catch (razorpayError) {
         // Check if it's a trust issue
         const isTrustIssue = razorpayError.message?.includes('untrusted') || 
                             razorpayError.message?.includes('trust') ||
                             razorpayError.message?.includes('suspicious') ||
                             razorpayError.message?.includes('Invalid phone number') ||
                             razorpayError.message?.includes('Invalid billing address');
         
         if (isTrustIssue) {
           console.warn('🚫 Razorpay invoice creation failed due to trust/validation issues:', {
             error: razorpayError.message,
             orderNumber: orderData.orderNumber,
             vendorId: vendor._id,
             customerName: orderData.collectorName,
             reason: 'Customer data flagged as untrusted by Razorpay'
           });
         } else {
           console.warn('⚠️ Razorpay invoice creation failed for other reasons:', {
             error: razorpayError.message,
             orderNumber: orderData.orderNumber,
             vendorId: vendor._id,
             customerName: orderData.collectorName
           });
         }
         
         // Continue without Razorpay invoice
         razorpayInvoice = null;
       }
     }
    
         // Create invoice document
     const invoice = new Invoice({
       invoiceNumber,
       orderId: orderData.orderId,
       orderNumber: orderData.orderNumber,
       invoiceType: 'vendor',
       recipientType: 'vendor',
       recipientId: vendor._id,
       recipientModel: 'Vendor',
       vendorId: vendor._id,
       vendorName: vendor.fullName || 'Vendor',
       vendorLocation: vendor.location || 'Location not specified',
       uniId: university._id,
       uniName: university.fullName,
       gstNumber: effectiveGstNumber,
       gstNumberType: gstNumberType,
       customerName: orderData.collectorName || 'Customer',
       customerPhone: orderData.collectorPhone || '0000000000',
       customerAddress: orderData.address || '...',
       subtotal: itemTotal, // Only the item total, not including charges
       subtotalBeforeGst: Math.round(subtotalBeforeGst * 100) / 100, // Only items before GST, not including charges
       platformFee: platformFee,
       gstAmount: Math.round(totalGstAmount * 100) / 100,
       cgstAmount: Math.round(totalCgstAmount * 100) / 100,
       sgstAmount: Math.round(totalSgstAmount * 100) / 100,
       totalAmount: amount, // amount already includes packing and delivery charges
       items: itemsWithGst,
       packagingCharge: packingTotal, // Reference value for display - already included in totalAmount
       deliveryCharge: deliveryTotal, // Reference value for display - already included in totalAmount
       razorpayInvoiceId: razorpayInvoice?.id || null,
       razorpayInvoiceUrl: razorpayInvoice?.short_url || null,
       status: 'sent'
     });
    
    await invoice.save();
    
    
    // Generate and upload PDF
    const pdfBuffer = await generateInvoicePDF(invoice, 'vendor');
    const pdfUrl = await uploadPDFToCloudinary(pdfBuffer, `invoice_${invoiceNumber}.pdf`);
    
    // Update invoice with PDF URL
    invoice.pdfUrl = pdfUrl;
    await invoice.save();
    
    return invoice;
    
  } catch (error) {
    console.error('❌ Error generating vendor invoice:', error);
    throw error;
  }
}

/**
 * Generate platform invoice (platform fee + GST)
 */
async function generatePlatformInvoice({ orderData, vendor, university, amount, platformFee, gstAmount, effectiveGstNumber, gstNumberType }) {
  try {
    // Generate invoice number
    const invoiceNumber = await Invoice.generateInvoiceNumber('platform', university._id);
    
    // Create Razorpay invoice (with fallback)
    let razorpayInvoice = null;
    try {
      razorpayInvoice = await createRazorpayInvoice({
      type: 'invoice',
      description: `Platform fee invoice for order ${orderData.orderNumber}`,
             customer: {
         name: 'KAMPYN Platform',
         contact: '9999999999',
         email: 'platform@bitesbay.com',
         billing_address: {
           line1: 'KAMPYN Platform',
           city: 'Mumbai',
           state: 'Maharashtra',
           country: 'in'
         }
       },
             line_items: [{
         name: 'Platform Service Fee',
         description: 'Platform service charge for order processing',
         amount: Math.round(amount * 100), // Convert to paise (₹2.00 * 100 = 200 paise)
         currency: 'INR',
         quantity: 1
       }],
      currency: 'INR',
      expire_by: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
      notes: {
        order_number: orderData.orderNumber,
        vendor_id: vendor._id.toString(),
        university: university.fullName,
        platform_fee: platformFee,
        gst_amount: gstAmount
      }
    });
  } catch (razorpayError) {
    console.warn('⚠️ Razorpay invoice creation failed, proceeding with local invoice only:', {
      error: razorpayError.message,
      orderNumber: orderData.orderNumber,
      vendorId: vendor._id,
      invoiceType: 'platform'
    });
    // Continue without Razorpay invoice
  }
    
    // Create invoice document
    const invoice = new Invoice({
      invoiceNumber,
      orderId: orderData.orderId,
      orderNumber: orderData.orderNumber,
      invoiceType: 'platform',
      recipientType: 'admin',
      recipientId: '000000000000000000000000', // Default platform ID
      recipientModel: 'Admin',
      vendorId: vendor._id,
      vendorName: 'KAMPYN',
      vendorLocation: 'Platform',
      uniId: university._id,
      uniName: university.fullName,
      gstNumber: effectiveGstNumber,
      gstNumberType: gstNumberType,
      customerName: 'KAMPYN Platform',
      customerPhone: '0000000000',
             customerAddress: '...',
             subtotal: amount, // Total amount is ₹2.00
       subtotalBeforeGst: platformFee, // Base amount is ₹1.69
       platformFee: platformFee, // Base amount is ₹1.69
       gstAmount: gstAmount, // GST amount is ₹0.31
       cgstAmount: Math.round(gstAmount / 2 * 100) / 100, // CGST is half of GST
       sgstAmount: Math.round(gstAmount / 2 * 100) / 100, // SGST is half of GST
       totalAmount: amount, // Total amount is ₹2.00
             items: [{
         name: 'Platform Service Fee',
         quantity: 1,
         unitPrice: amount, // Total amount is ₹2.00
         priceBeforeGst: platformFee, // Base amount is ₹1.69
         totalPrice: amount, // Total amount is ₹2.00
         hsnCode: 'N/A',
         gstPercentage: 18, // 18% GST
         cgstPercentage: 9, // 9% CGST
         sgstPercentage: 9, // 9% SGST
         cgstAmount: Math.round(gstAmount / 2 * 100) / 100,
         sgstAmount: Math.round(gstAmount / 2 * 100) / 100,
         gstAmount: gstAmount,
         totalAfterGst: amount,
         kind: 'Retail'
       }],
      packagingCharge: 0,
      deliveryCharge: 0,
      razorpayInvoiceId: razorpayInvoice?.id || null,
      razorpayInvoiceUrl: razorpayInvoice?.short_url || null,
      status: 'sent'
    });
    
    await invoice.save();
    
    // Generate and upload PDF
    const pdfBuffer = await generateInvoicePDF(invoice, 'platform');
    const pdfUrl = await uploadPDFToCloudinary(pdfBuffer, `invoice_${invoiceNumber}.pdf`);
    
    // Update invoice with PDF URL
    invoice.pdfUrl = pdfUrl;
    await invoice.save();
    
    return invoice;
    
  } catch (error) {
    console.error('❌ Error generating platform invoice:', error);
    throw error;
  }
}

/**
 * Sanitize customer name for Razorpay
 * @param {string} customerName - The original customer name
 * @returns {string} - The sanitized customer name
 */
function sanitizeCustomerName(customerName) {
  if (!customerName) return 'Customer';
  
  const trimmed = customerName.toString().trim();
  if (trimmed.length === 0) return 'Customer';
  
  // Remove special characters except spaces, hyphens, and underscores
  const sanitized = trimmed
    .replace(/[^\w\s\-_]/g, '') // Remove special characters except spaces, hyphens, and underscores
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .substring(0, 50); // Limit to 50 characters
  
  return sanitized || 'Customer';
}

/**
 * Create Razorpay invoice
 */
async function createRazorpayInvoice(invoiceData) {
  try {
    // Validate required fields before sending to Razorpay
    if (!invoiceData.customer?.name || invoiceData.customer.name.trim().length === 0) {
      throw new Error('Customer name is required and cannot be empty');
    }
    
    if (!invoiceData.customer?.contact || invoiceData.customer.contact.trim().length === 0) {
      throw new Error('Customer contact is required and cannot be empty');
    }
    
    // Ensure customer name doesn't exceed Razorpay limits
    if (invoiceData.customer.name.length > 50) {
      throw new Error('Customer name cannot exceed 50 characters');
    }
    
    // Additional validation to prevent untrusted customer issues
    if (invoiceData.customer.name.toLowerCase().includes('test') || 
        invoiceData.customer.name.toLowerCase().includes('customer') ||
        invoiceData.customer.name.toLowerCase().includes('demo') ||
        invoiceData.customer.name.toLowerCase().includes('sample')) {
      throw new Error('Customer name contains suspicious patterns that may trigger trust issues');
    }
    
    // Validate phone number format (basic Indian mobile validation)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(invoiceData.customer.contact)) {
      throw new Error('Invalid phone number format. Must be a valid 10-digit Indian mobile number');
    }
    
    // Validate billing address
    if (!invoiceData.customer.billing_address?.line1 || 
        invoiceData.customer.billing_address.line1.toLowerCase().includes('test')) {
      throw new Error('Invalid billing address. Must be a real address without test patterns');
    }
    
    const invoice = await razorpay.invoices.create(invoiceData);
    return invoice;
  } catch (error) {
    console.error('❌ Error creating Razorpay invoice:', error);
    throw error;
  }
}

/**
 * Generate PDF invoice
 */
async function generateInvoicePDF(invoice, type) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      
      // Header
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .text('KAMPYN', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(16)
         .font('Helvetica')
         .text(`${type === 'vendor' ? 'Vendor' : 'Platform'} Invoice`, { align: 'center' });
      
      doc.moveDown(1);
      
      // Invoice details
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text(`Invoice Number: ${invoice.invoiceNumber}`);
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Order Number: ${invoice.orderNumber}`);
      doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString()} ${new Date(invoice.createdAt).toLocaleTimeString()}`);
      
      doc.moveDown(1);
      
      // GST Information
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('GST Information:');
      doc.fontSize(10)
         .font('Helvetica')
         .text(`GST Number: ${invoice.gstNumber} (${invoice.gstNumberType === 'vendor' ? 'Vendor' : 'University'})`);
      
      doc.moveDown(1);
      
      // Vendor and University details
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Vendor Details:');
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Name: ${invoice.vendorName}`);
      doc.text(invoice.vendorLocation);
      
      doc.moveDown(0.5);
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('University:');
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Name: ${invoice.uniName}`);
      
      doc.moveDown(1);
      
      // Recipient details
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Bill To:');
      doc.fontSize(10)
         .font('Helvetica')
         .text(invoice.customerName);
      doc.text(invoice.customerPhone);
      if (invoice.customerAddress) {
        doc.text(invoice.customerAddress);
      }
      
      doc.moveDown(1);
      
      // Items table with detailed GST information
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Items:');
      
      doc.moveDown(0.5);
      
      // Table header
      const tableTop = doc.y;
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .text('Item', 50, tableTop)
         .text('HSN', 150, tableTop)
         .text('Qty', 200, tableTop)
         .text('Price', 230, tableTop)
         .text('Before GST', 280, tableTop)
         .text('GST%', 340, tableTop)
         .text('CGST', 380, tableTop)
         .text('SGST', 420, tableTop)
         .text('Total', 460, tableTop);
      
      doc.moveDown(0.5);
      
             // Table rows
       let currentY = doc.y;
       invoice.items.forEach(item => {
         doc.fontSize(8)
            .font('Helvetica')
            .text(item.name.substring(0, 12), 50, currentY)
            .text(item.hsnCode || 'N/A', 150, currentY)
            .text(item.quantity.toString(), 200, currentY)
            .text(`Rs. ${item.unitPrice}`, 230, currentY)
            .text(`Rs. ${item.priceBeforeGst}`, 280, currentY)
            .text(`${item.gstPercentage}%`, 340, currentY)
            .text(`Rs. ${item.cgstAmount}`, 380, currentY)
            .text(`Rs. ${item.sgstAmount}`, 420, currentY)
            .text(`Rs. ${item.totalPrice}`, 460, currentY);
         
         currentY += 20;
       });
      
      doc.moveDown(1);
      
       // Add packing charge summary for transparency
       if (invoice.packagingCharge > 0) {
         const packableItems = invoice.items.filter(item => 
           item.kind === "Produce" || item.packable === true
         );
         const packableItemsCount = packableItems.reduce((sum, item) => sum + item.quantity, 0);
         
         doc.fontSize(9)
            .font('Helvetica-Bold')
            .text('Packing Charge Summary:', 50, doc.y);
         
         doc.fontSize(8)
            .font('Helvetica')
            .text(`Total packable items: ${packableItemsCount}`, 50, doc.y + 15)
            .text(`Packing charge per item: Rs. 5`, 50, doc.y + 30)
            .text(`Total packing charge: Rs. ${invoice.packagingCharge}`, 50, doc.y + 45);
         
         doc.moveDown(1);
       }
       
       // Totals breakdown
        const totalsY = doc.y;
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Subtotal (Before GST):', 280, totalsY)
           .text(`Rs. ${invoice.subtotalBeforeGst}`, 460, totalsY);
        
        if (invoice.cgstAmount > 0) {
          doc.text('CGST:', 280, totalsY + 20)
             .text(`Rs. ${invoice.cgstAmount}`, 460, totalsY + 20);
        }
        
        if (invoice.sgstAmount > 0) {
          doc.text('SGST:', 280, totalsY + 40)
             .text(`Rs. ${invoice.sgstAmount}`, 460, totalsY + 40);
        }
        
        if (invoice.gstAmount > 0) {
          doc.text('Total GST:', 280, totalsY + 60)
             .text(`Rs. ${invoice.gstAmount}`, 460, totalsY + 60);
        }
        
        // Add subtotal after GST (items + GST, before charges)
        doc.text('Subtotal (After GST):', 280, totalsY + 80)
           .text(`Rs. ${invoice.subtotal}`, 460, totalsY + 80);
        
        // Show packaging and delivery charges for transparency (they're already included in total)
        if (invoice.packagingCharge > 0) {
          // Calculate packable items count for display
          const packableItemsCount = invoice.items.filter(item => 
            item.kind === "Produce" || item.packable === true
          ).reduce((sum, item) => sum + item.quantity, 0);
          
          doc.text('Packaging Charge:', 280, totalsY + 100)
             .text(`Rs. ${invoice.packagingCharge}`, 460, totalsY + 100);
          
          // Add detail about packing charge calculation
          doc.fontSize(7)
             .font('Helvetica')
             .text(`(${packableItemsCount} packable items × Rs. 5 per item)`, 280, totalsY + 115);
        }
        
        if (invoice.deliveryCharge > 0) {
          doc.text('Delivery Charge:', 280, totalsY + 130)
             .text(`Rs. ${invoice.deliveryCharge}`, 460, totalsY + 130);
        }
        
        // Note: These charges are already included in the Grand Total
        // so we don't add them again to avoid double counting
        
        // Add a note about included charges
        if (invoice.packagingCharge > 0 || invoice.deliveryCharge > 0) {
          doc.fontSize(8)
             .font('Helvetica')
             .text('* All charges are included in the Grand Total above', 280, totalsY + 150);
        }
        
        doc.moveDown(1);
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text(`Grand Total = Rs. ${invoice.totalAmount}`, { align: 'right' });
      
      // Footer
      doc.moveDown(2);
      doc.fontSize(8)
         .font('Helvetica')
         .text('Thank you for your business!', { align: 'center' });
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Check Cloudinary account status and trust level
 */
async function checkCloudinaryAccountStatus() {
  try {
    // Test upload with a small file to verify account status
    const testBuffer = Buffer.from('test');
    const testResult = await cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'test',
        public_id: 'account-test',
        access_mode: 'public'
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary account test failed:', error);
          return false;
        }
        return true;
      }
    ).end(testBuffer);
    
    return true;
  } catch (error) {
    console.error('❌ Error checking Cloudinary account status:', error);
    return false;
  }
}

/**
 * Upload with retry mechanism
 */
async function uploadWithRetry(pdfBuffer, filename, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      
      // Create temporary file for this attempt
      const tempPath = path.join(os.tmpdir(), `attempt_${attempt}_${filename}`);
      fs.writeFileSync(tempPath, pdfBuffer);
      
      // Verify file was created and has content
      const stats = fs.statSync(tempPath);
      
      // Try different upload strategies based on attempt number
      let uploadOptions = {
        resource_type: 'raw',
        folder: 'invoices',
        public_id: filename.replace('.pdf', ''),
        format: 'pdf',
        access_mode: 'public',
        use_filename: false,
        unique_filename: true,
        context: {
          custom: {
            source: 'bitesbay-invoice-system',
            type: 'invoice-pdf',
            attempt: attempt
          }
        }
      };
      
      // On later attempts, try different strategies
      if (attempt > 1) {
        uploadOptions.folder = `invoices/retry_${attempt}`;
        uploadOptions.public_id = `retry_${attempt}_${filename.replace('.pdf', '')}`;
        // Try without access_mode restriction on retry
        delete uploadOptions.access_mode;
      }
      
      
      const result = await cloudinary.uploader.upload(tempPath, uploadOptions);
      
      // Clean up temporary file
      fs.unlinkSync(tempPath);
      
      return result.secure_url;
      
    } catch (error) {
      console.error(`❌ Upload attempt ${attempt} failed:`, error.message);
      console.error(`🔍 Full error details:`, error);
      
      // Clean up temporary file if it exists
      try {
        const tempPath = path.join(os.tmpdir(), `attempt_${attempt}_${filename}`);
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup temp file:', cleanupError.message);
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, CLOUDINARY_CONFIG.retryDelay * attempt));
    }
  }
}

/**
 * Fallback upload method using different Cloudinary settings
 */
async function fallbackUpload(pdfBuffer, filename) {
  try {
    
    const tempPath = path.join(os.tmpdir(), `fallback_${filename}`);
    fs.writeFileSync(tempPath, pdfBuffer);
    
    // Try with different upload parameters
    const result = await cloudinary.uploader.upload(tempPath, {
      resource_type: 'raw',
      folder: 'invoices/fallback',
      public_id: `fallback_${filename.replace('.pdf', '')}`,
      format: 'pdf',
      // Try without access_mode restriction
      use_filename: true,
      unique_filename: false,
      // Add more metadata
      context: {
        custom: {
          source: 'bitesbay-invoice-system-fallback',
          type: 'invoice-pdf',
          method: 'fallback'
        }
      }
    });
    
    // Clean up
    fs.unlinkSync(tempPath);
    
    return result.secure_url;
    
  } catch (error) {
    console.error('❌ Fallback upload failed:', error.message);
    throw error;
  }
}

/**
 * Specialized PDF upload method with enhanced error handling
 */
async function uploadPDFWithEnhancedHandling(pdfBuffer, filename) {
  try {
    
    const tempPath = path.join(os.tmpdir(), `enhanced_${filename}`);
    fs.writeFileSync(tempPath, pdfBuffer);
    
    // Try multiple PDF upload strategies
    const strategies = [
      {
        name: 'Standard PDF upload',
        options: {
          resource_type: 'raw',
          folder: 'invoices/enhanced',
          public_id: `enhanced_${filename.replace('.pdf', '')}`,
          format: 'pdf',
          access_mode: 'public'
        }
      },
      {
        name: 'PDF as image upload',
        options: {
          resource_type: 'image',
          folder: 'invoices/enhanced',
          public_id: `enhanced_${filename.replace('.pdf', '')}`,
          format: 'pdf',
          transformation: [{ quality: 'auto' }]
        }
      },
      {
        name: 'PDF with minimal options',
        options: {
          resource_type: 'raw',
          folder: 'invoices/enhanced',
          public_id: `enhanced_${filename.replace('.pdf', '')}`,
          format: 'pdf'
        }
      }
    ];
    
    for (const strategy of strategies) {
      try {
        
        const result = await cloudinary.uploader.upload(tempPath, strategy.options);
        
        // Clean up
        fs.unlinkSync(tempPath);
        
        return result.secure_url;
        
      } catch (strategyError) {
        console.warn(`⚠️ Strategy "${strategy.name}" failed:`, strategyError.message);
        continue;
      }
    }
    
    // If all strategies fail, clean up and throw error
    fs.unlinkSync(tempPath);
    throw new Error('All enhanced PDF upload strategies failed');
    
  } catch (error) {
    console.error('❌ Enhanced PDF upload failed:', error.message);
    throw error;
  }
}

/**
 * Upload PDF to Cloudinary
 */
async function uploadPDFToCloudinary(pdfBuffer, filename) {
  try {
    // Check Cloudinary account status first if enabled
    if (CLOUDINARY_CONFIG.enableTrustCheck) {
      const accountStatus = await checkCloudinaryAccountStatus();
      if (!accountStatus) {
        console.warn('⚠️ Cloudinary account verification failed, proceeding with upload...');
      }
    }
    
    // Use retry mechanism for upload (it handles temporary file creation)
    const pdfUrl = await uploadWithRetry(pdfBuffer, filename, CLOUDINARY_CONFIG.maxRetries);
    
    return pdfUrl;
    
  } catch (error) {
    console.error('❌ Error uploading PDF to Cloudinary:', error);
    
    // Handle specific Cloudinary trust issues
    if (error.message && error.message.includes('untrusted')) {
      console.error('🔒 Cloudinary trust issue detected. Please check your account settings.');
      console.error('💡 Solutions:');
      console.error('   1. Verify your Cloudinary account is verified');
      console.error('   2. Check if your account has any restrictions');
      console.error('   3. Contact Cloudinary support if the issue persists');
      console.error('   4. Ensure your API keys are correct and have proper permissions');
    }
    
    // If fallback is enabled, try alternative approaches
    if (CLOUDINARY_CONFIG.enableFallback) {
      console.info('🔄 Attempting fallback upload methods...');
      
      // Try enhanced PDF upload first
      try {
        console.info('🔄 Trying enhanced PDF upload method...');
        const enhancedUrl = await uploadPDFWithEnhancedHandling(pdfBuffer, filename);
        console.info('✅ Enhanced PDF upload successful:', enhancedUrl);
        return enhancedUrl;
      } catch (enhancedError) {
        console.warn('⚠️ Enhanced PDF upload failed, trying standard fallback...');
      }
      
      // Try standard fallback upload
      try {
        const fallbackUrl = await fallbackUpload(pdfBuffer, filename);
        console.info('✅ Standard fallback upload successful:', fallbackUrl);
        return fallbackUrl;
      } catch (fallbackError) {
        console.error('❌ All fallback upload methods failed');
      }
    }
    
    throw error;
  }
}

/**
 * Get invoices by date range for bulk download
 */
exports.getInvoicesByDateRange = async (filters) => {
  try {
    const { startDate, endDate, vendorId, uniId, invoiceType, recipientType } = filters;
    
    const query = {};
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (vendorId) query.vendorId = vendorId;
    if (uniId) query.uniId = uniId;
    if (invoiceType) query.invoiceType = invoiceType;
    if (recipientType) query.recipientType = recipientType;
    
    const invoices = await Invoice.find(query)
      .populate({ path: 'vendorId', select: 'name', model: Vendor })
      .populate({ path: 'uniId', select: 'fullName', model: Uni })
      .sort({ createdAt: -1 })
      .lean();
    
    return invoices;
    
  } catch (error) {
    console.error('❌ Error getting invoices by date range:', error);
    throw error;
  }
};

/**
 * Generate ZIP file with multiple invoices
 */
exports.generateInvoicesZip = async (invoices) => {
  try {
    // This would require a ZIP library like 'archiver'
    // For now, return the invoice data for frontend processing
    return invoices.map(invoice => ({
      id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: invoice.orderNumber,
      vendorName: invoice.vendorName,
      uniName: invoice.uniName,
      totalAmount: invoice.totalAmount,
      createdAt: invoice.createdAt,
      pdfUrl: invoice.pdfUrl,
      razorpayInvoiceUrl: invoice.razorpayInvoiceUrl
    }));
  } catch (error) {
    console.error('❌ Error generating invoices ZIP:', error);
    throw error;
  }
};
