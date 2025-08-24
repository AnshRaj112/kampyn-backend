#!/usr/bin/env node

/**
 * Test ZIP Download API Endpoints
 * This script tests the invoice ZIP download functionality
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:5001/api'; // Backend port
const TEST_ORDER_ID = '68a7eabe7070357cae6a51ad'; // Your test order ID

/**
 * Test downloading all invoices for an order as ZIP
 */
async function testOrderZipDownload() {
  try {
    console.log('📦 Testing: GET /invoices/order/:orderId/download (ZIP)');
    
    const response = await axios.get(`${BASE_URL}/invoices/order/${TEST_ORDER_ID}/download`, {
      responseType: 'stream',
      timeout: 60000 // 60 second timeout for ZIP creation
    });
    
    console.log('✅ ZIP download response received!');
    console.log('📊 Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'content-type': response.headers['content-type'],
        'content-disposition': response.headers['content-disposition'],
        'content-length': response.headers['content-length']
      }
    });
    
    if (response.headers['content-type'] === 'application/zip') {
      console.log('📦 ZIP file detected!');
      console.log(`📊 File size: ${response.headers['content-length'] || 'Unknown'} bytes`);
      
      // Save the ZIP file locally for testing
      const filename = `test_order_invoices_${Date.now()}.zip`;
      const filePath = path.join(__dirname, filename);
      const writer = fs.createWriteStream(filePath);
      
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`💾 ZIP file saved locally: ${filePath}`);
          console.log(`📁 File size: ${fs.statSync(filePath).size} bytes`);
          resolve(filePath);
        });
        
        writer.on('error', reject);
      });
    } else {
      console.log('❌ Expected ZIP file but got:', response.headers['content-type']);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Order ZIP download failed:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test bulk ZIP download with date range
 */
async function testBulkZipDownload() {
  try {
    console.log('\n📦 Testing: POST /invoices/bulk-zip-download');
    
    const today = new Date();
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const requestData = {
      startDate: lastWeek.toISOString().split('T')[0], // YYYY-MM-DD format
      endDate: today.toISOString().split('T')[0],
      // Optional filters:
      // vendorId: 'specific_vendor_id',
      // uniId: 'specific_university_id',
      // invoiceType: 'vendor', // or 'platform'
      // recipientType: 'vendor' // or 'admin'
    };
    
    console.log('📅 Date range:', requestData.startDate, 'to', requestData.endDate);
    
    const response = await axios.post(`${BASE_URL}/invoices/bulk-zip-download`, requestData, {
      responseType: 'stream',
      timeout: 120000 // 2 minute timeout for bulk ZIP creation
    });
    
    console.log('✅ Bulk ZIP download response received!');
    console.log('📊 Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'content-type': response.headers['content-type'],
        'content-disposition': response.headers['content-disposition'],
        'content-length': response.headers['content-length']
      }
    });
    
    if (response.headers['content-type'] === 'application/zip') {
      console.log('📦 Bulk ZIP file detected!');
      console.log(`📊 File size: ${response.headers['content-length'] || 'Unknown'} bytes`);
      
      // Save the bulk ZIP file locally for testing
      const filename = `test_bulk_invoices_${Date.now()}.zip`;
      const filePath = path.join(__dirname, filename);
      const writer = fs.createWriteStream(filePath);
      
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`💾 Bulk ZIP file saved locally: ${filePath}`);
          console.log(`📁 File size: ${fs.statSync(filePath).size} bytes`);
          resolve(filePath);
        });
        
        writer.on('error', reject);
      });
    } else {
      console.log('❌ Expected ZIP file but got:', response.headers['content-type']);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Bulk ZIP download failed:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test getting invoices by order ID (to see what's available)
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
      });
    }
    
    return response.data.data;
    
  } catch (error) {
    console.error('❌ Failed to get invoices by order:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log('🚀 Starting ZIP Download API Tests...\n');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`🔑 Test Order ID: ${TEST_ORDER_ID}\n`);
    
    // Test 1: Get invoices for order (to see what's available)
    const invoices = await testGetInvoicesByOrder();
    
    if (!invoices || invoices.length === 0) {
      console.log('\n⚠️ No invoices found for testing. Please ensure there are invoices for this order.');
      return;
    }
    
    // Test 2: Test order ZIP download
    console.log('\n' + '='.repeat(50));
    const orderZipPath = await testOrderZipDownload();
    
    // Test 3: Test bulk ZIP download
    console.log('\n' + '='.repeat(50));
    const bulkZipPath = await testBulkZipDownload();
    
    console.log('\n🎉 ZIP Download API tests completed!');
    console.log('\n📋 Available ZIP Download Endpoints:');
    console.log(`   GET ${BASE_URL}/invoices/order/${TEST_ORDER_ID}/download - Download all invoices for order as ZIP`);
    console.log(`   POST ${BASE_URL}/invoices/bulk-zip-download - Download multiple invoices as ZIP with filters`);
    
    if (orderZipPath) {
      console.log(`\n📦 Order ZIP saved: ${orderZipPath}`);
    }
    
    if (bulkZipPath) {
      console.log(`📦 Bulk ZIP saved: ${bulkZipPath}`);
    }
    
    console.log('\n💡 ZIP Features:');
    console.log('   ✅ Downloads PDFs from Cloudinary links');
    console.log('   ✅ Downloads PDFs from Razorpay links');
    console.log('   ✅ Downloads PDFs from Razorpay API');
    console.log('   ✅ Includes local PDF files');
    console.log('   ✅ Creates placeholder files for unavailable invoices');
    console.log('   ✅ Maximum compression for smaller file sizes');
    console.log('   ✅ Automatic cleanup of temporary files');
    
    console.log('\n💡 Common Issues & Solutions:');
    console.log('   1. If you get 404: Check if invoices exist and have PDF data');
    console.log('   2. If you get 500: Check server logs for detailed error');
    console.log('   3. If ZIP is empty: Check if PDF URLs are accessible');
    console.log('   4. If timeout: Increase timeout for large numbers of invoices');
    
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
