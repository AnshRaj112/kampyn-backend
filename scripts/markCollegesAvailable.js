const { Cluster_Accounts } = require('../config/db');
const Uni = require('../models/account/Uni');

// Wait for database connection
const waitForConnection = async () => {
  return new Promise((resolve, reject) => {
    if (Cluster_Accounts.readyState === 1) {
      resolve();
    } else {
      Cluster_Accounts.once('connected', resolve);
      Cluster_Accounts.once('error', reject);
    }
  });
};

// Mark all colleges as available
const markCollegesAvailable = async () => {
  try {
    console.log('🔵 Starting to mark all colleges as available...');
    
    // Uni model is already imported
    
    // Update all universities to set isAvailable to 'Y'
    const result = await Uni.updateMany(
      {}, // Empty filter to match all documents
      { 
        $set: { isAvailable: 'Y' }
      }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} colleges to available status`);
    console.log(`📊 Matched ${result.matchedCount} colleges total`);
    
    // Verify the update
    const availableCount = await Uni.countDocuments({ isAvailable: 'Y' });
    const unavailableCount = await Uni.countDocuments({ isAvailable: 'N' });
    
    console.log(`📈 Current status:`);
    console.log(`   - Available colleges: ${availableCount}`);
    console.log(`   - Unavailable colleges: ${unavailableCount}`);
    
  } catch (error) {
    console.error('❌ Error marking colleges as available:', error);
  }
};

// Run the migration
const runMigration = async () => {
  await waitForConnection();
  await markCollegesAvailable();
  console.log('🎉 Migration completed successfully');
  process.exit(0);
};

runMigration();
