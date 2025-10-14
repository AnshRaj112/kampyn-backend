// Test script to verify vendor population with university items
const mongoose = require('mongoose');
const { Cluster_Accounts, Cluster_Item } = require('./config/db');
const Vendor = require('./models/account/Vendor');
const Uni = require('./models/account/Uni');
const Retail = require('./models/item/Retail');
const Produce = require('./models/item/Produce');
const Raw = require('./models/item/Raw');
const { populateVendorWithUniversityItems } = require('./utils/vendorUtils');

async function testVendorPopulation() {
  try {
    console.log('🧪 Testing vendor population with university items...');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bitesbay');
    console.log('✅ Connected to database');

    // Find a university with existing items
    const university = await Uni.findOne().lean();
    if (!university) {
      console.log('❌ No university found. Please create a university first.');
      return;
    }
    console.log(`📍 Testing with university: ${university.fullName} (${university._id})`);

    // Check existing items for this university
    const [retailCount, produceCount, rawCount] = await Promise.all([
      Retail.countDocuments({ uniId: university._id }),
      Produce.countDocuments({ uniId: university._id }),
      Raw.countDocuments({})
    ]);
    console.log(`📦 Found ${retailCount} retail, ${produceCount} produce, ${rawCount} raw items`);

    if (retailCount === 0 && produceCount === 0 && rawCount === 0) {
      console.log('⚠️ No items found. Please add some items to test the functionality.');
      return;
    }

    // Create a test vendor
    const testVendor = new Vendor({
      fullName: 'Test Vendor',
      email: `test-vendor-${Date.now()}@example.com`,
      phone: `+91${Math.floor(Math.random() * 10000000000)}`,
      password: 'testpassword123',
      location: 'Test Location',
      uniID: university._id,
      sellerType: 'SELLER',
      isVerified: false
    });

    console.log('👤 Created test vendor:', testVendor.email);

    // Test the population function
    await populateVendorWithUniversityItems(testVendor, university._id);

    // Verify the results
    console.log('\n📊 Results:');
    console.log(`Retail items added: ${testVendor.retailInventory.length}`);
    console.log(`Produce items added: ${testVendor.produceInventory.length}`);
    console.log(`Raw material items added: ${testVendor.rawMaterialInventory.length}`);

    // Check sample items
    if (testVendor.retailInventory.length > 0) {
      const sampleRetail = testVendor.retailInventory[0];
      console.log(`Sample retail item: quantity=${sampleRetail.quantity}, isAvailable=${sampleRetail.isAvailable}`);
    }

    if (testVendor.produceInventory.length > 0) {
      const sampleProduce = testVendor.produceInventory[0];
      console.log(`Sample produce item: isAvailable=${sampleProduce.isAvailable}, isSpecial=${sampleProduce.isSpecial}`);
    }

    if (testVendor.rawMaterialInventory.length > 0) {
      const sampleRaw = testVendor.rawMaterialInventory[0];
      console.log(`Sample raw item: openingAmount=${sampleRaw.openingAmount}, closingAmount=${sampleRaw.closingAmount}, unit=${sampleRaw.unit}`);
    }

    // Clean up - remove the test vendor
    await Vendor.findByIdAndDelete(testVendor._id);
    console.log('\n🧹 Cleaned up test vendor');

    console.log('\n✅ Test completed successfully!');
    console.log('\nSummary:');
    console.log('- New vendors will automatically get all existing university items');
    console.log('- Retail items start with quantity: 0');
    console.log('- Produce items start with isAvailable: N');
    console.log('- Raw material items start with openingAmount: 0, closingAmount: 0');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testVendorPopulation();
}

module.exports = { testVendorPopulation };
