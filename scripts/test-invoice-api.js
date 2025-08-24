#!/usr/bin/env node

/**
 * Test Invoice API Endpoints
 * This script tests the invoice API endpoints to ensure they work correctly
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5001/api'; // Adjust port if needed
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
      invoiceCount: response.data.data?.length || 0,
      invoices: response.data.data?.map(inv => ({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        type: inv.invoiceType,
        pdfUrl: inv.pdfUrl ? 'Available' : 'Not available',
        razorpayUrl: inv.razorpayInvoiceUrl ? 'Available' : 'Not available'
      }))
    });
    
    return response.data.data;
    
  } catch (error) {
    console.error('❌ Failed to get invoices by order:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test downloading order invoices
 */
async function testDownloadOrderInvoices() {
  try {
    console.log('\n📥 Testing: GET /invoices/order/:orderId/download');
    
    const response = await axios.get(`${BASE_URL}/invoices/order/${TEST_ORDER_ID}/download`);
    
    console.log('✅ Success!');
    console.log('📊 Response:', {
      status: response.status,
      orderNumber: response.data.data?.orderNumber,
      invoiceCount: response.data.data?.invoices?.length || 0,
      downloadLinks: response.data.data?.invoices?.map(inv => ({
        invoiceNumber: inv.invoiceNumber,
        downloadUrl: inv.downloadUrl,
        viewUrl: inv.viewUrl ? 'Available' : 'Not available'
      }))
    });
    
    return response.data.data?.invoices;
    
  } catch (error) {
    console.error('❌ Failed to download order invoices:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test getting a specific invoice by ID
 */
async function testGetInvoiceById(invoiceId) {
  if (!invoiceId) {
    console.log('\n⏭️ Skipping invoice by ID test (no invoice ID available)');
    return;
  }
  
  try {
    console.log(`\n🔍 Testing: GET /invoices/${invoiceId}`);
    
    const response = await axios.get(`${BASE_URL}/invoices/${invoiceId}`);
    
    console.log('✅ Success!');
    console.log('📊 Response:', {
      status: response.status,
      invoiceNumber: response.data.data?.invoiceNumber,
      type: response.data.data?.invoiceType,
      pdfUrl: response.data.data?.pdfUrl ? 'Available' : 'Not available',
      razorpayUrl: response.data.data?.razorpayInvoiceUrl ? 'Available' : 'Not available'
    });
    
  } catch (error) {
    console.error('❌ Failed to get invoice by ID:', error.response?.data || error.message);
  }
}

/**
 * Test downloading a specific invoice
 */
async function testDownloadInvoice(invoiceId) {
  if (!invoiceId) {
    console.log('\n⏭️ Skipping invoice download test (no invoice ID available)');
    return;
  }
  
  try {
    console.log(`\n📥 Testing: GET /invoices/${invoiceId}/download`);
    
    const response = await axios.get(`${BASE_URL}/invoices/${invoiceId}/download`, {
      maxRedirects: 0, // Don't follow redirects
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept redirects
      }
    });
    
    console.log('✅ Success!');
    console.log('📊 Response:', {
      status: response.status,
      headers: {
        'content-type': response.headers['content-type'],
        'content-disposition': response.headers['content-disposition'],
        'location': response.headers['location']
      }
    });
    
    if (response.status === 302 || response.status === 301) {
      console.log('🔄 Redirect detected to:', response.headers['location']);
    }
    
  } catch (error) {
    if (error.response?.status === 302 || error.response?.status === 301) {
      console.log('✅ Success! (Redirect)');
      console.log('🔄 Redirect to:', error.response.headers['location']);
    } else {
      console.error('❌ Failed to download invoice:', error.response?.data || error.message);
    }
  }
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log('🚀 Starting Invoice API Tests...\n');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`🔑 Test Order ID: ${TEST_ORDER_ID}\n`);
    
    // Test 1: Get invoices by order
    const invoices = await testGetInvoicesByOrder();
    
    // Test 2: Download order invoices
    const orderInvoices = await testDownloadOrderInvoices();
    
    // Test 3: Get specific invoice (if available)
    if (invoices && invoices.length > 0) {
      const firstInvoiceId = invoices[0]._id;
      await testGetInvoiceById(firstInvoiceId);
      await testDownloadInvoice(firstInvoiceId);
    }
    
    console.log('\n🎉 Invoice API tests completed!');
    console.log('\n📋 Available Endpoints:');
    console.log(`   GET ${BASE_URL}/invoices/order/${TEST_ORDER_ID} - Get invoices for order`);
    console.log(`   GET ${BASE_URL}/invoices/order/${TEST_ORDER_ID}/download - Download order invoices`);
    console.log(`   GET ${BASE_URL}/invoices/{invoiceId} - Get specific invoice`);
    console.log(`   GET ${BASE_URL}/invoices/{invoiceId}/download - Download specific invoice PDF`);
    
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
