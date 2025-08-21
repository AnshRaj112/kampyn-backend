const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const Invoice = require('../models/invoice/Invoice');

const ANYAPI_BASE_URL = 'https://anyapi.io/api/v1/invoice/generate';
const ANYAPI_KEY = 'qv51u7l99bghdni3fdligvj66ug6ivsgnl9gj5f0v4u18qiostrqg';

// Cloudinary configuration
cloudinary.config({
  cloud_name: 'dt45pu5mx',
  api_key: process.env.CLOUDINARY_API_KEY || 'your_cloudinary_api_key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'your_cloudinary_api_secret'
});

// Fake GST numbers for different entities
const GST_NUMBERS = {
  KIIT_HOSPITALITY: '22AAAAA0000A1Z5', // Fake GST for KIIT Hospitality
  KAMPYN: '27BBBBB0000B1Z6', // Fake GST for KAMPYN platform
};

/**
 * Save invoice record to database
 */
async function saveInvoiceToDatabase(invoiceData, orderData) {
  try {
    const invoice = new Invoice({
      orderNumber: invoiceData.invoiceNumber,
      orderId: orderData.orderId,
      vendorId: orderData.vendorId,
      uniId: orderData.uniId,
      invoiceType: invoiceData.type,
      cloudinaryUrl: invoiceData.cloudinaryUrl,
      downloadUrl: invoiceData.downloadUrl,
      publicId: invoiceData.publicId,
      fileSize: invoiceData.size,
      status: 'uploaded',
      uploadedAt: new Date(),
      metadata: {
        totalAmount: orderData.total,
        gstAmount: orderData.total * 0.18, // Approximate GST
        collectorName: orderData.collectorName,
        collectorPhone: orderData.collectorPhone,
        orderType: orderData.orderType,
        paymentMethod: orderData.paymentMethod
      }
    });

    await invoice.save();
    console.log(`💾 Invoice saved to database: ${invoice._id}`);
    return invoice;

  } catch (error) {
    console.error('❌ Error saving invoice to database:', error.message);
    throw error;
  }
}

/**
 * Upload invoice to Cloudinary and return PDF download URL
 */
async function uploadInvoiceToCloudinary(invoiceUrl, orderNumber, invoiceType) {
  try {
    console.log(`☁️ Uploading ${invoiceType} invoice to Cloudinary for order: ${orderNumber}`);
    
    // Download the invoice from AnyAPI
    const response = await axios.get(invoiceUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    // Upload to Cloudinary with specific folder structure
    const uploadResult = await cloudinary.uploader.upload_stream(
      {
        folder: `invoices/${orderNumber}`,
        public_id: `${invoiceType}_${orderNumber}`,
        format: 'pdf',
        resource_type: 'raw',
        tags: ['invoice', invoiceType, orderNumber]
      },
      (error, result) => {
        if (error) {
          console.error(`❌ Cloudinary upload failed for ${invoiceType}:`, error);
          throw error;
        }
        return result;
      }
    ).end(response.data);

    // Wait for upload to complete
    const result = await new Promise((resolve, reject) => {
      uploadResult.on('end', resolve);
      uploadResult.on('error', reject);
    });

    console.log(`✅ ${invoiceType} invoice uploaded to Cloudinary:`, result.secure_url);
    
    return {
      cloudinaryUrl: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      size: result.bytes
    };

  } catch (error) {
    console.error(`❌ Error uploading ${invoiceType} invoice to Cloudinary:`, error.message);
    throw error;
  }
}

/**
 * Generate invoice for food items (excluding platform fee)
 */
async function generateFoodItemsInvoice(orderData) {
  try {
    const {
      orderNumber,
      items,
      total,
      collectorName,
      collectorPhone,
      address,
      orderType,
      vendorName = 'KIIT Hospitality',
      createdAt,
      orderId,
      vendorId,
      uniId
    } = orderData;

    // Calculate totals excluding platform fee
    const itemTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const packaging = orderType !== 'dinein' ? items.filter(item => item.packable || item.kind === 'Produce').reduce((sum, item) => sum + (item.packagingCharge || 0) * item.quantity, 0) : 0;
    const delivery = orderType === 'delivery' ? (orderData.deliveryCharge || 0) : 0;
    const subtotal = itemTotal + packaging + delivery;

    // Calculate GST breakdown
    let totalGST = 0;
    let totalCGST = 0;
    let totalSGST = 0;

    const invoiceItems = items.map(item => {
      const itemTotal = item.price * item.quantity;
      const itemGST = item.gstPercentage || 0;
      const itemCGST = itemGST / 2;
      const itemSGST = itemGST / 2;
      
      totalGST += (itemTotal * itemGST) / 100;
      totalCGST += (itemTotal * itemCGST) / 100;
      totalSGST += (itemTotal * itemSGST) / 100;

      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.kind === 'Produce' ? (item.unit || 'kg') : 'piece',
        price: item.price,
        total: itemTotal,
        gst: itemGST,
        cgst: itemCGST,
        sgst: itemSGST
      };
    });

    // Add packaging and delivery as separate line items
    if (packaging > 0) {
      invoiceItems.push({
        name: 'Packaging Charges',
        quantity: 1,
        unit: 'service',
        price: packaging,
        total: packaging,
        gst: 0,
        cgst: 0,
        sgst: 0
      });
    }

    if (delivery > 0) {
      invoiceItems.push({
        name: 'Delivery Charges',
        quantity: 1,
        unit: 'service',
        price: delivery,
        total: delivery,
        gst: 0,
        cgst: 0,
        sgst: 0
      });
    }

    const currentTime = new Date(createdAt);
    const invoicePayload = {
      apiKey: ANYAPI_KEY,
      invoice: {
        invoiceNumber: orderNumber,
        date: currentTime.toISOString().split('T')[0],
        time: currentTime.toTimeString().split(' ')[0], // Include time HH:MM:SS
        dueDate: currentTime.toISOString().split('T')[0],
        currency: 'INR',
        from: {
          name: vendorName,
          address: 'KIIT University Campus, Bhubaneswar, Odisha',
          city: 'Bhubaneswar',
          state: 'Odisha',
          country: 'India',
          zipCode: '751024',
          phone: '+91-674-2725113',
          email: 'hospitality@kiit.ac.in',
          gstNumber: GST_NUMBERS.KIIT_HOSPITALITY
        },
        to: {
          name: collectorName,
          phone: collectorPhone,
          address: address || 'KIIT University Campus',
          city: 'Bhubaneswar',
          state: 'Odisha',
          country: 'India',
          zipCode: '751024'
        },
        items: invoiceItems.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          total: item.total,
          gst: item.gst,
          cgst: item.cgst,
          sgst: item.sgst
        })),
        subtotal: subtotal,
        totalGST: totalGST,
        totalCGST: totalCGST,
        totalSGST: totalSGST,
        total: subtotal + totalGST,
        notes: `Order Type: ${orderType.toUpperCase()}\nPayment Method: ${orderData.paymentMethod || 'Online'}\nOrder Time: ${currentTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        terms: 'Payment due on delivery. No returns on food items.'
      }
    };

    console.log('🍕 Generating food items invoice for order:', orderNumber);
    
    const response = await axios.post(ANYAPI_BASE_URL, invoicePayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.data && response.data.success) {
      console.log('✅ Food items invoice generated successfully:', response.data.invoiceUrl);
      
      // Upload to Cloudinary
      const cloudinaryResult = await uploadInvoiceToCloudinary(
        response.data.invoiceUrl, 
        orderNumber, 
        'food_items'
      );

      const invoiceData = {
        success: true,
        invoiceUrl: response.data.invoiceUrl,
        cloudinaryUrl: cloudinaryResult.cloudinaryUrl,
        downloadUrl: cloudinaryResult.cloudinaryUrl.replace('/upload/', '/upload/fl_attachment/'),
        invoiceNumber: orderNumber,
        type: 'food_items',
        publicId: cloudinaryResult.publicId,
        size: cloudinaryResult.size
      };

      // Save to database if we have the required IDs
      if (orderId && vendorId && uniId) {
        try {
          await saveInvoiceToDatabase(invoiceData, {
            ...orderData,
            orderId,
            vendorId,
            uniId
          });
        } catch (dbError) {
          console.warn('⚠️ Failed to save invoice to database:', dbError.message);
          // Don't fail the invoice generation if database save fails
        }
      }

      return invoiceData;
    } else {
      throw new Error('Invoice generation failed: ' + JSON.stringify(response.data));
    }

  } catch (error) {
    console.error('❌ Error generating food items invoice:', error.message);
    return {
      success: false,
      error: error.message,
      type: 'food_items'
    };
  }
}

/**
 * Generate separate invoice for platform fees
 */
async function generatePlatformFeeInvoice(orderData) {
  try {
    const {
      orderNumber,
      collectorName,
      collectorPhone,
      address,
      createdAt,
      orderId,
      vendorId,
      uniId
    } = orderData;

    const platformFee = 2; // Fixed platform fee
    const platformFeeGST = 0.36; // 18% GST on platform fee
    const platformFeeCGST = platformFeeGST / 2;
    const platformFeeSGST = platformFeeGST / 2;

    const currentTime = new Date(createdAt);
    const invoicePayload = {
      apiKey: ANYAPI_KEY,
      invoice: {
        invoiceNumber: `${orderNumber}-PF`, // Platform Fee invoice
        date: currentTime.toISOString().split('T')[0],
        time: currentTime.toTimeString().split(' ')[0], // Include time HH:MM:SS
        dueDate: currentTime.toISOString().split('T')[0],
        currency: 'INR',
        from: {
          name: 'KAMPYN',
          address: 'Tech Park, Bangalore, Karnataka',
          city: 'Bangalore',
          state: 'Karnataka',
          country: 'India',
          zipCode: '560001',
          phone: '+91-80-12345678',
          email: 'billing@kampyn.com',
          gstNumber: GST_NUMBERS.KAMPYN,
          logo: 'https://res.cloudinary.com/dt45pu5mx/image/upload/v1754770229/FullLogo_Transparent_NoBuffer_1_fg1iux.png'
        },
        to: {
          name: 'KIIT Hospitality',
          address: 'KIIT University Campus, Bhubaneswar, Odisha',
          city: 'Bhubaneswar',
          state: 'Odisha',
          country: 'India',
          zipCode: '751024',
          phone: '+91-674-2725113',
          email: 'hospitality@kiit.ac.in'
        },
        items: [{
          name: 'Platform Service Fee',
          quantity: 1,
          unit: 'service',
          price: platformFee,
          total: platformFee,
          gst: 18, // 18% GST
          cgst: 9,
          sgst: 9
        }],
        subtotal: platformFee,
        totalGST: platformFeeGST,
        totalCGST: platformFeeCGST,
        totalSGST: platformFeeSGST,
        total: platformFee + platformFeeGST,
        notes: `Platform service fee for order processing and management\nOrder Time: ${currentTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        terms: 'Platform fee is non-refundable and covers service costs.'
      }
    };

    console.log('💳 Generating platform fee invoice for order:', orderNumber);
    
    const response = await axios.post(ANYAPI_BASE_URL, invoicePayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.data && response.data.success) {
      console.log('✅ Platform fee invoice generated successfully:', response.data.invoiceUrl);
      
      // Upload to Cloudinary
      const cloudinaryResult = await uploadInvoiceToCloudinary(
        response.data.invoiceUrl, 
        orderNumber, 
        'platform_fee'
      );

      const invoiceData = {
        success: true,
        invoiceUrl: response.data.invoiceUrl,
        cloudinaryUrl: cloudinaryResult.cloudinaryUrl,
        downloadUrl: cloudinaryResult.cloudinaryUrl.replace('/upload/', '/upload/fl_attachment/'),
        invoiceNumber: `${orderNumber}-PF`,
        type: 'platform_fee',
        publicId: cloudinaryResult.publicId,
        size: cloudinaryResult.size
      };

      // Save to database if we have the required IDs
      if (orderId && vendorId && uniId) {
        try {
          await saveInvoiceToDatabase(invoiceData, {
            ...orderData,
            orderId,
            vendorId,
            uniId
          });
        } catch (dbError) {
          console.warn('⚠️ Failed to save platform fee invoice to database:', dbError.message);
          // Don't fail the invoice generation if database save fails
        }
      }

      return invoiceData;
    } else {
      throw new Error('Platform fee invoice generation failed: ' + JSON.stringify(response.data));
    }

  } catch (error) {
    console.error('❌ Error generating platform fee invoice:', error.message);
    return {
      success: false,
      error: error.message,
      type: 'platform_fee'
    };
  }
}

/**
 * Generate both invoices for an order
 */
async function generateOrderInvoices(orderData) {
  try {
    console.log('📄 Starting invoice generation for order:', orderData.orderNumber);

    // Generate food items invoice (excluding platform fee)
    const foodInvoice = await generateFoodItemsInvoice(orderData);
    
    // Generate platform fee invoice
    const platformInvoice = await generatePlatformFeeInvoice(orderData);

    const results = {
      foodInvoice,
      platformInvoice,
      orderNumber: orderData.orderNumber,
      timestamp: new Date().toISOString()
    };

    if (foodInvoice.success && platformInvoice.success) {
      console.log('✅ Both invoices generated successfully for order:', orderData.orderNumber);
    } else {
      console.warn('⚠️ Some invoices failed to generate for order:', orderData.orderNumber);
    }

    return results;

  } catch (error) {
    console.error('❌ Error in generateOrderInvoices:', error.message);
    return {
      success: false,
      error: error.message,
      orderNumber: orderData.orderNumber,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get invoice download URLs for a specific order
 */
async function getInvoiceDownloadUrls(orderNumber) {
  try {
    // First try to get from database
    const dbInvoices = await Invoice.find({ orderNumber }).sort({ createdAt: -1 }).lean();
    
    if (dbInvoices.length > 0) {
      console.log(`📄 Found ${dbInvoices.length} invoices in database for order: ${orderNumber}`);
      return {
        success: true,
        orderNumber,
        invoices: dbInvoices.map(invoice => ({
          type: invoice.invoiceType,
          downloadUrl: invoice.downloadUrl,
          cloudinaryUrl: invoice.cloudinaryUrl,
          publicId: invoice.publicId,
          size: invoice.fileSize,
          createdAt: invoice.createdAt,
          status: invoice.status
        }))
      };
    }

    // Fallback to Cloudinary search if not in database
    console.log(`🔍 Searching Cloudinary for invoices for order: ${orderNumber}`);
    const searchResult = await cloudinary.search
      .expression(`folder:invoices/${orderNumber}`)
      .sort_by('created_at', 'desc')
      .max_results(10)
      .execute();

    const invoices = searchResult.resources.map(resource => ({
      type: resource.public_id.includes('food_items') ? 'food_items' : 'platform_fee',
      downloadUrl: resource.secure_url.replace('/upload/', '/upload/fl_attachment/'),
      cloudinaryUrl: resource.secure_url,
      publicId: resource.public_id,
      size: resource.bytes,
      createdAt: resource.created_at
    }));

    return {
      success: true,
      orderNumber,
      invoices
    };

  } catch (error) {
    console.error('❌ Error getting invoice download URLs:', error.message);
    return {
      success: false,
      error: error.message,
      orderNumber
    };
  }
}

module.exports = {
  generateFoodItemsInvoice,
  generatePlatformFeeInvoice,
  generateOrderInvoices,
  getInvoiceDownloadUrls,
  GST_NUMBERS
};
