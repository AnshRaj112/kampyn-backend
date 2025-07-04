const mongoose = require('mongoose');
require('dotenv').config();

const Uni = require('../models/account/Uni');

async function migrateUniversityCharges() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find all universities that don't have packingCharge or deliveryCharge set
    const universities = await Uni.find({
      $or: [
        { packingCharge: { $exists: false } },
        { deliveryCharge: { $exists: false } }
      ]
    });

    console.log(`📊 Found ${universities.length} universities to update`);

    if (universities.length === 0) {
      console.log('✅ All universities already have charges configured');
      return;
    }

    // Update each university with default charges
    const updatePromises = universities.map(async (uni) => {
      const updateData = {};
      
      if (!uni.packingCharge) {
        updateData.packingCharge = 5; // Default ₹5 per produce item
      }
      
      if (!uni.deliveryCharge) {
        updateData.deliveryCharge = 50; // Default ₹50 for delivery
      }

      if (Object.keys(updateData).length > 0) {
        await Uni.findByIdAndUpdate(uni._id, updateData);
        console.log(`✅ Updated ${uni.fullName} with charges:`, updateData);
      }
    });

    await Promise.all(updatePromises);
    console.log('✅ Migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateUniversityCharges();
}

module.exports = migrateUniversityCharges; 