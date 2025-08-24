#!/usr/bin/env node

/**
 * Test PDF Upload Script
 * This script helps debug PDF upload issues with Cloudinary
 */

require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('🔧 Cloudinary configuration loaded');
console.log('☁️ Cloud name:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('🔑 API key:', process.env.CLOUDINARY_API_KEY ? '***' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'Not set');
console.log('🔐 API secret:', process.env.CLOUDINARY_API_SECRET ? '***' + process.env.CLOUDINARY_API_SECRET.slice(-4) : 'Not set');

/**
 * Generate a simple test PDF
 */
function generateTestPDF() {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      
      // Add some content to the PDF
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .text('Test PDF', { align: 'center' });
      
      doc.moveDown(1);
      doc.fontSize(16)
         .font('Helvetica')
         .text('This is a test PDF for Cloudinary upload testing');
      
      doc.moveDown(1);
      doc.fontSize(12)
         .text(`Generated at: ${new Date().toISOString()}`);
      
      doc.moveDown(1);
      doc.text('This PDF is used to test Cloudinary upload functionality and identify any issues.');
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Test basic Cloudinary connectivity
 */
async function testCloudinaryConnectivity() {
  try {
    console.log('\n🔍 Testing Cloudinary connectivity...');
    
    // Test with a simple text file
    const testBuffer = Buffer.from('test');
    const tempPath = path.join(os.tmpdir(), 'connectivity-test.txt');
    fs.writeFileSync(tempPath, testBuffer);
    
    const result = await cloudinary.uploader.upload(tempPath, {
      resource_type: 'raw',
      folder: 'test',
      public_id: 'connectivity-test',
      access_mode: 'public'
    });
    
    fs.unlinkSync(tempPath);
    
    console.log('✅ Connectivity test passed');
    console.log('🔗 Test file URL:', result.secure_url);
    
    return true;
    
  } catch (error) {
    console.error('❌ Connectivity test failed:', error.message);
    return false;
  }
}

/**
 * Test PDF upload with different strategies
 */
async function testPDFUpload(pdfBuffer) {
  const strategies = [
    {
      name: 'Standard PDF upload',
      options: {
        resource_type: 'raw',
        folder: 'test',
        public_id: 'test-pdf',
        format: 'pdf',
        access_mode: 'public'
      }
    },
    {
      name: 'PDF as image upload',
      options: {
        resource_type: 'image',
        folder: 'test',
        public_id: 'test-pdf-image',
        format: 'pdf'
      }
    },
    {
      name: 'PDF with minimal options',
      options: {
        resource_type: 'raw',
        folder: 'test',
        public_id: 'test-pdf-minimal',
        format: 'pdf'
      }
    },
    {
      name: 'PDF without access_mode',
      options: {
        resource_type: 'raw',
        folder: 'test',
        public_id: 'test-pdf-no-access',
        format: 'pdf'
      }
    }
  ];
  
  for (const strategy of strategies) {
    try {
      console.log(`\n🔄 Testing strategy: ${strategy.name}`);
      
      const tempPath = path.join(os.tmpdir(), `test-${strategy.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
      fs.writeFileSync(tempPath, pdfBuffer);
      
      const stats = fs.statSync(tempPath);
      console.log(`📁 Temp file created: ${tempPath} (${stats.size} bytes)`);
      
      const result = await cloudinary.uploader.upload(tempPath, strategy.options);
      
      fs.unlinkSync(tempPath);
      
      console.log(`✅ Strategy "${strategy.name}" successful`);
      console.log(`🔗 Result URL: ${result.secure_url}`);
      
      return { success: true, strategy: strategy.name, url: result.secure_url };
      
    } catch (error) {
      console.error(`❌ Strategy "${strategy.name}" failed:`, error.message);
      
      // Clean up temp file
      try {
        const tempPath = path.join(os.tmpdir(), `test-${strategy.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup temp file:', cleanupError.message);
      }
      
      continue;
    }
  }
  
  return { success: false, message: 'All strategies failed' };
}

/**
 * Main test function
 */
async function runTests() {
  try {
    console.log('🚀 Starting PDF upload tests...\n');
    
    // Test 1: Connectivity
    const connectivityOk = await testCloudinaryConnectivity();
    if (!connectivityOk) {
      console.error('❌ Cannot proceed without basic connectivity');
      process.exit(1);
    }
    
    // Test 2: Generate test PDF
    console.log('\n📄 Generating test PDF...');
    const pdfBuffer = await generateTestPDF();
    console.log(`✅ Test PDF generated (${pdfBuffer.length} bytes)`);
    
    // Test 3: PDF upload
    console.log('\n📤 Testing PDF upload...');
    const uploadResult = await testPDFUpload(pdfBuffer);
    
    if (uploadResult.success) {
      console.log('\n🎉 PDF upload test completed successfully!');
      console.log(`✅ Working strategy: ${uploadResult.strategy}`);
      console.log(`🔗 PDF URL: ${uploadResult.url}`);
    } else {
      console.log('\n❌ PDF upload test failed');
      console.log(`💡 Message: ${uploadResult.message}`);
    }
    
  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests, testPDFUpload, testCloudinaryConnectivity };
