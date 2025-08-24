#!/usr/bin/env node

/**
 * Test Download API Endpoints
 * This script tests the invoice download functionality
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5001/api'; // Backend port
const TEST_ORDER_ID = '68a7eabe7070357cae6a51ad'; // Your test order ID

/**
 * Test getting invoices by order ID
 */
async function testGetInvoicesByOrder() {
  try {
    console.log('🔍 Testing: GET /invoices/order/:orderId');
    
    const response = await axios.get(`${BASE_URL}/invoices/order/${TEST_ORDER_ID}`);
    
    console.log('✅ Success!');
    console.log('📊 Response:', {
      status: response.status,
      invoiceCount: response.data.data?.length || 0
    });
    
    // Show invoice details
    if (response.data.data?.length > 0) {
      response.data.data.forEach((invoice, index) => {
        console.log(`\n📄 Invoice ${index + 1}:`);
        console.log(`   ID: ${invoice._id}`);
        console.log(`   Invoice Number: ${invoice.invoiceNumber}`);
        console.log(`   Type: ${invoice.invoiceType}`);
        console.log(`   PDF URL: ${invoice.pdfUrl || 'None'}`);
        console.log(`   Razorpay ID: ${invoice.razorpayInvoiceId || 'None'}`);
        console.log(`   Razorpay URL: ${invoice.razorpayInvoiceUrl || 'None'}`);
        console.log(`   Download URL: ${BASE_URL}/invoices/${invoice._id}/download`);
      });
    }
    
    return response.data.data;
    
  } catch (error) {
    console.error('❌ Failed to get invoices by order:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test downloading a specific invoice
 */
async function testDownloadInvoice(invoiceId, invoiceNumber) {
  if (!invoiceId) {
    console.log('\n⏭️ Skipping download test (no invoice ID available)');
    return;
  }
  
  try {
    console.log(`\n📥 Testing: GET /invoices/${invoiceId}/download`);
    console.log(`📄 Invoice: ${invoiceNumber}`);
    
    const response = await axios.get(`${BASE_URL}/invoices/${invoiceId}/download`, {
      maxRedirects: 0, // Don't follow redirects
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept redirects
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log('✅ Download response received!');
    console.log('📊 Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'content-type': response.headers['content-type'],
        'content-disposition': response.headers['content-disposition'],
        'content-length': response.headers['content-length'],
        'location': response.headers['location']
      }
    });
    
    if (response.status === 302 || response.status === 301) {
      console.log('🔄 Redirect detected!');
      console.log(`🔗 Redirect URL: ${response.headers['location']}`);
      console.log('💡 This means the file is being served from an external service (Cloudinary/Razorpay)');
    } else if (response.headers['content-type'] === 'application/pdf') {
      console.log('📄 PDF file detected!');
      console.log(`📊 File size: ${response.headers['content-length'] || 'Unknown'} bytes`);
      console.log('💡 This means the file is being served directly from your server');
    }
    
    return response;
    
  } catch (error) {
    if (error.response?.status === 302 || error.response?.status === 301) {
      console.log('✅ Success! (Redirect)');
      console.log('🔄 Redirect to:', error.response.headers['location']);
      return error.response;
    } else {
      console.error('❌ Download failed:', error.response?.data || error.message);
      if (error.response?.status === 404) {
        console.log('💡 This might mean:');
        console.log('   - The invoice has no PDF attached');
        console.log('   - The PDF file is missing');
        console.log('   - The Razorpay invoice is not accessible');
      }
    }
    return null;
  }
}

/**
 * Test the download order invoices endpoint
 */
async function testDownloadOrderInvoices() {
  try {
    console.log('\n📥 Testing: GET /invoices/order/:orderId/download');
    
    const response = await axios.get(`${BASE_URL}/invoices/order/${TEST_ORDER_ID}/download`);
    
    console.log('✅ Success!');
    console.log('📊 Response:', {
      status: response.status,
      orderNumber: response.data.data?.orderNumber,
      invoiceCount: response.data.data?.invoices?.length || 0
    });
    
    // Show download links
    if (response.data.data?.invoices) {
      response.data.data.invoices.forEach((invoice, index) => {
        console.log(`\n📄 Invoice ${index + 1}:`);
        console.log(`   Invoice Number: ${invoice.invoiceNumber}`);
        console.log(`   Download URL: ${invoice.downloadUrl}`);
        console.log(`   View URL: ${invoice.viewUrl || 'None'}`);
      });
    }
    
    return response.data.data?.invoices;
    
  } catch (error) {
    console.error('❌ Failed to get download order invoices:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log('🚀 Starting Download API Tests...\n');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`🔑 Test Order ID: ${TEST_ORDER_ID}\n`);
    
    // Test 1: Get invoices for order
    const invoices = await testGetInvoicesByOrder();
    
    // Test 2: Test download order invoices
    await testDownloadOrderInvoices();
    
    // Test 3: Test downloading specific invoices
    if (invoices && invoices.length > 0) {
      console.log('\n🔍 Testing individual invoice downloads...');
      
      for (let i = 0; i < Math.min(2, invoices.length); i++) { // Test first 2 invoices
        const invoice = invoices[i];
        await testDownloadInvoice(invoice._id, invoice.invoiceNumber);
      }
    }
    
    console.log('\n🎉 Download API tests completed!');
    console.log('\n📋 Available Download Endpoints:');
    console.log(`   GET ${BASE_URL}/invoices/order/${TEST_ORDER_ID}/download - Get download links for order`);
    console.log(`   GET ${BASE_URL}/invoices/{invoiceId}/download - Download specific invoice PDF`);
    
    console.log('\n💡 Common Issues & Solutions:');
    console.log('   1. If you get 404: Check if invoice has PDF or Razorpay data');
    console.log('   2. If you get 302: File is being served from external service (normal)');
    console.log('   3. If you get 500: Check server logs for detailed error');
    
  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
