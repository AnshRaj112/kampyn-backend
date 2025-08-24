#!/usr/bin/env node

/**
 * Simple Download Test
 * This script tests basic invoice download functionality
 */

require('dotenv').config();

async function testSimpleDownload() {
  try {
    console.log('🔍 Testing basic invoice download functionality...');
    
    // Test database connection
    const { Cluster_Order, Cluster_Accounts } = require('../config/db');
    
    console.log('📊 Database Connection Status:');
    console.log(`   Orders: ${Cluster_Order.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   Accounts: ${Cluster_Accounts.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    
    // Wait for connections
    if (Cluster_Order.readyState !== 1 || Cluster_Accounts.readyState !== 1) {
      console.log('⏳ Waiting for database connections...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Test model loading
    console.log('\n🔍 Testing model loading...');
    
    try {
      const Invoice = require('../models/invoice/Invoice');
      console.log('✅ Invoice model loaded successfully');
      
      const Order = require('../models/order/Order');
      console.log('✅ Order model loaded successfully');
      
      // Test finding an invoice
      console.log('\n🔍 Testing invoice lookup...');
      const testOrderId = '68a7eabe7070357cae6a51ad';
      
      const order = await Order.findById(testOrderId);
      if (order) {
        console.log(`✅ Order found: ${order.orderNumber}`);
        
        const invoices = await Invoice.find({ orderId: testOrderId }).limit(1);
        if (invoices.length > 0) {
          const invoice = invoices[0];
          console.log(`✅ Invoice found: ${invoice.invoiceNumber}`);
          console.log(`   Type: ${invoice.invoiceType}`);
          console.log(`   PDF URL: ${invoice.pdfUrl || 'None'}`);
          console.log(`   Razorpay ID: ${invoice.razorpayInvoiceId || 'None'}`);
          console.log(`   Razorpay URL: ${invoice.razorpayInvoiceUrl || 'None'}`);
          
          // Test the download logic
          console.log('\n🔍 Testing download logic...');
          
          if (invoice.pdfUrl && invoice.pdfUrl.includes('cloudinary.com')) {
            console.log('☁️ Cloudinary URL detected');
          } else if (invoice.razorpayInvoiceUrl) {
            console.log('💳 Razorpay URL detected');
          } else if (invoice.razorpayInvoiceId) {
            console.log('🔑 Razorpay ID detected');
          } else if (invoice.pdfUrl && invoice.pdfUrl.startsWith('/uploads/')) {
            console.log('💾 Local file path detected');
          } else {
            console.log('❌ No download source available');
          }
          
        } else {
          console.log('❌ No invoices found for this order');
        }
      } else {
        console.log('❌ Order not found');
      }
      
    } catch (modelError) {
      console.error('❌ Model loading failed:', modelError.message);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testSimpleDownload().then(success => {
    if (success) {
      console.log('\n✅ Simple download test completed successfully!');
      process.exit(0);
    } else {
      console.log('\n❌ Simple download test failed!');
      process.exit(1);
    }
  });
}

module.exports = { testSimpleDownload };
