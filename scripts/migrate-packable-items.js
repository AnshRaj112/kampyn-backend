const mongoose = require('mongoose');
const { Cluster_Item } = require('../config/db');
const Retail = require('../models/item/Retail');
const Produce = require('../models/item/Produce');

async function migratePackableItems() {
  try {
    console.log('🔄 Starting packable items migration...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kiitbites');
    console.log('✅ Connected to database');
    
    // Update all Produce items to packable = true
    const produceResult = await Produce.updateMany(
      { packable: { $exists: false } }, // Only update items that don't have packable field
      { $set: { packable: true } }
    );
    console.log(`✅ Updated ${produceResult.modifiedCount} Produce items to packable = true`);
    
    // Update all Retail items to packable = false
    const retailResult = await Retail.updateMany(
      { packable: { $exists: false } }, // Only update items that don't have packable field
      { $set: { packable: false } }
    );
    console.log(`✅ Updated ${retailResult.modifiedCount} Retail items to packable = false`);
    
    // Verify the migration
    const produceCount = await Produce.countDocuments({ packable: true });
    const retailCount = await Retail.countDocuments({ packable: false });
    const totalProduce = await Produce.countDocuments();
    const totalRetail = await Retail.countDocuments();
    
    console.log('\n📊 Migration Summary:');
    console.log(`Total Produce items: ${totalProduce}`);
    console.log(`Produce items with packable=true: ${produceCount}`);
    console.log(`Total Retail items: ${totalRetail}`);
    console.log(`Retail items with packable=false: ${retailCount}`);
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migratePackableItems();
}

module.exports = { migratePackableItems }; 