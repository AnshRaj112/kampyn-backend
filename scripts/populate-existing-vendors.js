// Script to populate existing vendors with university items
const mongoose = require('mongoose');
const { Cluster_Accounts, Cluster_Item } = require('../config/db');
const Vendor = require('../models/account/Vendor');
const Uni = require('../models/account/Uni');
const Retail = require('../models/item/Retail');
const Produce = require('../models/item/Produce');
const Raw = require('../models/item/Raw');
const { populateVendorWithUniversityItems } = require('../utils/vendorUtils');

async function populateExistingVendors() {
  try {
    console.log('🚀 Starting population of existing vendors with university items...');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bitesbay');
    console.log('✅ Connected to database');

    // Find all vendors
    const vendors = await Vendor.find({}).lean();
    console.log(`👥 Found ${vendors.length} vendors`);

    if (vendors.length === 0) {
      console.log('ℹ️ No vendors found. Nothing to populate.');
      return;
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const vendor of vendors) {
      try {
        console.log(`\n📋 Processing vendor: ${vendor.fullName} (${vendor._id})`);

        // Check if vendor already has items
        const hasRetailItems = vendor.retailInventory && vendor.retailInventory.length > 0;
        const hasProduceItems = vendor.produceInventory && vendor.produceInventory.length > 0;
        const hasRawItems = vendor.rawMaterialInventory && vendor.rawMaterialInventory.length > 0;

        if (hasRetailItems || hasProduceItems || hasRawItems) {
          console.log(`⏭️ Skipping vendor - already has items (retail: ${vendor.retailInventory?.length || 0}, produce: ${vendor.produceInventory?.length || 0}, raw: ${vendor.rawMaterialInventory?.length || 0})`);
          skipped++;
          continue;
        }

        // Check if vendor has a university
        if (!vendor.uniID) {
          console.log(`⚠️ Skipping vendor - no university assigned`);
          skipped++;
          continue;
        }

        // Check if university has items
        const [retailCount, produceCount, rawCount] = await Promise.all([
          Retail.countDocuments({ uniId: vendor.uniID }),
          Produce.countDocuments({ uniId: vendor.uniID }),
          Raw.countDocuments({})
        ]);

        if (retailCount === 0 && produceCount === 0 && rawCount === 0) {
          console.log(`⏭️ Skipping vendor - university has no items`);
          skipped++;
          continue;
        }

        console.log(`📦 University has ${retailCount} retail, ${produceCount} produce, ${rawCount} raw items`);

        // Load the vendor document (not lean) for modification
        const vendorDoc = await Vendor.findById(vendor._id);
        
        // Populate vendor with university items
        await populateVendorWithUniversityItems(vendorDoc, vendor.uniID);
        
        console.log(`✅ Successfully populated vendor with university items`);
        processed++;

      } catch (error) {
        console.error(`❌ Error processing vendor ${vendor._id}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Successfully processed: ${processed} vendors`);
    console.log(`⏭️ Skipped: ${skipped} vendors`);
    console.log(`❌ Errors: ${errors} vendors`);

    if (processed > 0) {
      console.log('\n🎉 Existing vendors have been populated with university items!');
      console.log('- Retail items: quantity = 0');
      console.log('- Produce items: isAvailable = N');
      console.log('- Raw material items: openingAmount = 0, closingAmount = 0');
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script if this file is executed directly
if (require.main === module) {
  populateExistingVendors();
}

module.exports = { populateExistingVendors };
