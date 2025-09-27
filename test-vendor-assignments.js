// Simple test script for vendor assignments API
const fetch = require('node-fetch');

async function testVendorAssignments() {
  try {
    // Replace with an actual vendor ID from your database
    const vendorId = "6834622e10d75a5ba7b7740d"; // This is the hardcoded ID from the frontend
    const baseUrl = "http://localhost:5001";
    
    console.log(`Testing vendor assignments API for vendor: ${vendorId}`);
    
    const response = await fetch(`${baseUrl}/api/vendor/${vendorId}/assignments`);
    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log(`✅ Vendor ${data.data.vendor.fullName} has ${data.data.services.length} services assigned`);
      data.data.services.forEach(service => {
        console.log(`  - ${service.name} (Feature: ${service.feature.name})`);
      });
    } else {
      console.log('❌ API call failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testVendorAssignments();
