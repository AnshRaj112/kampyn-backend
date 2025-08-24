#!/usr/bin/env node

/**
 * Test Razorpay API Integration
 * This script tests the direct Razorpay API integration endpoints
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:5001/api'; // Backend port
const TEST_ORDER_ID = '68a7eabe7070357cae6a51ad'; // Your test order ID

/**
 * Test getting Razorpay invoices for an order
 */
async function testGetOrderRazorpayInvoices() {
  try {
    console.log('🔍 Testing: GET /invoices/order/:orderId/razorpay');
    
    const response = await axios.get(`${BASE_URL}/invoices/order/${TEST_ORDER_ID}/razorpay`);
    
    console.log('✅ Success!');
    console.log('📊 Response:', {
      status: response.status,
      orderNumber: response.data.data?.orderNumber,
      invoiceCount: response.data.data?.invoices?.length || 0
    });
    
    // Show details of each invoice
    if (response.data.data?.invoices) {
      response.data.data.invoices.forEach((invoice, index) => {
        console.log(`\n📄 Invoice ${index + 1}:`);
        console.log(`   ID: ${invoice._id}`);
        console.log(`   Invoice Number: ${invoice.invoiceNumber}`);
        console.log(`   Type: ${invoice.invoiceType}`);
        console.log(`   Razorpay ID: ${invoice.razorpayInvoiceId || 'None'}`);
        console.log(`   Has Razorpay Data: ${invoice.hasRazorpayData ? '✅ Yes' : '❌ No'}`);
        
        if (invoice.hasRazorpayData) {
          console.log(`   Razorpay Status: ${invoice.razorpayData?.status || 'Unknown'}`);
          console.log(`   Razorpay Amount: ${invoice.razorpayData?.amount || 'Unknown'}`);
          console.log(`   Razorpay Currency: ${invoice.razorpayData?.currency || 'Unknown'}`);
        } else {
          console.log(`   Error: ${invoice.razorpayError || 'No error message'}`);
        }
      });
    }
    
    return response.data.data?.invoices;
    
  } catch (error) {
    console.error('❌ Failed to get Razorpay invoices for order:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test getting a specific invoice from Razorpay
 */
async function testGetSpecificRazorpayInvoice(invoiceId) {
  if (!invoiceId) {
    console.log('\n⏭️ Skipping specific invoice test (no invoice ID available)');
    return;
  }
  
  try {
    console.log(`\n🔍 Testing: GET /invoices/${invoiceId}/razorpay`);
    
    const response = await axios.get(`${BASE_URL}/invoices/${invoiceId}/razorpay`);
    
    console.log('✅ Success!');
    console.log('📊 Response:', {
      status: response.status,
      localInvoice: {
        id: response.data.data?.localInvoice?.id,
        invoiceNumber: response.data.data?.localInvoice?.invoiceNumber,
        type: response.data.data?.localInvoice?.invoiceType,
        status: response.data.data?.localInvoice?.status
      },
      razorpayInvoice: {
        id: response.data.data?.razorpayInvoice?.id,
        status: response.data.data?.razorpayInvoice?.status,
        amount: response.data.data?.razorpayInvoice?.amount,
        currency: response.data.data?.razorpayInvoice?.currency,
        customer: response.data.data?.razorpayInvoice?.customer?.name
      },
      downloadUrl: response.data.data?.downloadUrl
    });
    
  } catch (error) {
    console.error('❌ Failed to get specific Razorpay invoice:', error.response?.data || error.message);
  }
}

/**
 * Test the original Razorpay API directly
 */
async function testDirectRazorpayAPI() {
  try {
    console.log('\n🌐 Testing: Direct Razorpay API call');
    console.log('⚠️ Note: This requires valid Razorpay credentials in your .env file');
    
    // First get invoices to find a Razorpay ID
    const invoicesResponse = await axios.get(`${BASE_URL}/invoices/order/${TEST_ORDER_ID}/razorpay`);
    const invoices = invoicesResponse.data.data?.invoices || [];
    
    const invoiceWithRazorpay = invoices.find(inv => inv.razorpayInvoiceId);
    
    if (!invoiceWithRazorpay) {
      console.log('❌ No invoices with Razorpay IDs found');
      return;
    }
    
    console.log(`\n🔑 Found Razorpay Invoice ID: ${invoiceWithRazorpay.razorpayInvoiceId}`);
    console.log('💡 You can test this directly with:');
    console.log(`   curl -u "${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}" \\`);
    console.log(`        https://api.razorpay.com/v1/invoices/${invoiceWithRazorpay.razorpayInvoiceId}`);
    
  } catch (error) {
    console.error('❌ Failed to test direct Razorpay API:', error.message);
  }
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log('🚀 Starting Razorpay API Integration Tests...\n');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`🔑 Test Order ID: ${TEST_ORDER_ID}\n`);
    
    // Test 1: Get Razorpay invoices for order
    const invoices = await testGetOrderRazorpayInvoices();
    
    // Test 2: Get specific invoice from Razorpay (if available)
    if (invoices && invoices.length > 0) {
      const invoiceWithRazorpay = invoices.find(inv => inv.razorpayInvoiceId);
      if (invoiceWithRazorpay) {
        await testGetSpecificRazorpayInvoice(invoiceWithRazorpay._id);
      }
    }
    
    // Test 3: Test direct Razorpay API
    await testDirectRazorpayAPI();
    
    console.log('\n🎉 Razorpay API integration tests completed!');
    console.log('\n📋 Available Endpoints:');
    console.log(`   GET ${BASE_URL}/invoices/order/${TEST_ORDER_ID}/razorpay - Get Razorpay data for order`);
    console.log(`   GET ${BASE_URL}/invoices/{invoiceId}/razorpay - Get specific invoice from Razorpay`);
    console.log(`   GET https://api.razorpay.com/v1/invoices/{inv_id} - Direct Razorpay API (with auth)`);
    
    console.log('\n💡 To test direct Razorpay API:');
    console.log('   1. Get the razorpayInvoiceId from the response above');
    console.log('   2. Use: curl -u "key_id:key_secret" https://api.razorpay.com/v1/invoices/{inv_id}');
    
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
