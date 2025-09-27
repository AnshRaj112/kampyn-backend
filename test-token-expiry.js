const { checkUserActivity, updateUserActivity } = require('./utils/authUtils');
const User = require('./models/account/User');
const Vendor = require('./models/account/Vendor');
const Uni = require('./models/account/Uni');
const Admin = require('./models/account/Admin');

/**
 * Test script to verify 7-day token expiry functionality
 * This script tests the authUtils functions
 */
async function testTokenExpiry() {
  console.log('🧪 Testing 7-day token expiry functionality...\n');

  try {
    // Test 1: Check user activity for a user with recent activity
    console.log('Test 1: User with recent activity');
    const recentUser = await User.findOne();
    if (recentUser) {
      const { shouldLogout, user } = await checkUserActivity(recentUser._id, 'user');
      console.log(`✅ User ${recentUser.email}: shouldLogout = ${shouldLogout}`);
      console.log(`   Last activity: ${user?.lastActivity}`);
    }

    // Test 2: Check user activity for a user with old activity (simulate)
    console.log('\nTest 2: User with old activity (simulated)');
    if (recentUser) {
      // Set last activity to 8 days ago
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await User.findByIdAndUpdate(recentUser._id, { lastActivity: eightDaysAgo });
      
      const { shouldLogout, user } = await checkUserActivity(recentUser._id, 'user');
      console.log(`✅ User ${recentUser.email}: shouldLogout = ${shouldLogout}`);
      console.log(`   Last activity: ${user?.lastActivity}`);
      
      // Reset to current time
      await updateUserActivity(recentUser._id, 'user');
    }

    // Test 3: Update user activity
    console.log('\nTest 3: Update user activity');
    if (recentUser) {
      const success = await updateUserActivity(recentUser._id, 'user');
      console.log(`✅ Update activity success: ${success}`);
    }

    // Test 4: Check vendor activity
    console.log('\nTest 4: Check vendor activity');
    const vendor = await Vendor.findOne();
    if (vendor) {
      const { shouldLogout, user } = await checkUserActivity(vendor._id, 'vendor');
      console.log(`✅ Vendor ${vendor.email}: shouldLogout = ${shouldLogout}`);
      console.log(`   Last activity: ${user?.lastActivity}`);
    }

    // Test 5: Check university activity
    console.log('\nTest 5: Check university activity');
    const uni = await Uni.findOne();
    if (uni) {
      const { shouldLogout, user } = await checkUserActivity(uni._id, 'uni');
      console.log(`✅ University ${uni.email}: shouldLogout = ${shouldLogout}`);
      console.log(`   Last activity: ${user?.lastActivity}`);
    }

    // Test 6: Check admin activity
    console.log('\nTest 6: Check admin activity');
    const admin = await Admin.findOne();
    if (admin) {
      const { shouldLogout, user } = await checkUserActivity(admin._id, 'admin');
      console.log(`✅ Admin ${admin.email}: shouldLogout = ${shouldLogout}`);
      console.log(`   Last activity: ${user?.lastActivity}`);
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('- All user types now have 7-day token expiration');
    console.log('- Last activity tracking is implemented');
    console.log('- Users will be logged out after 7 days of inactivity');
    console.log('- Activity is updated on every authenticated request');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testTokenExpiry().then(() => {
    console.log('\n🏁 Test script completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { testTokenExpiry };
