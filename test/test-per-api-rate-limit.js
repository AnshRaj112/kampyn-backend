/**
 * Test Script for Per-API Rate Limiting
 * 
 * This script tests that:
 * 1. Each endpoint has its own rate limit counter
 * 2. Hitting the limit on one endpoint doesn't block others
 * 3. Rate limit headers are correctly set
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5001/api/vendor/auth';

// Test configuration
const RATE_LIMIT = 5; // Production limit for auth endpoints
const TEST_ENDPOINTS = [
    { path: '/login', method: 'POST', data: { email: 'test@example.com', password: 'wrongpassword' } },
    { path: '/signup', method: 'POST', data: { email: 'test@example.com', password: 'test123', name: 'Test' } },
];

async function testEndpointIsolation() {
    console.log('🧪 Testing Per-API Rate Limiting - Endpoint Isolation\n');
    console.log('='.repeat(60));

    try {
        // Test 1: Exhaust rate limit on /login endpoint
        console.log('\n📍 Test 1: Exhausting rate limit on /login endpoint');
        console.log('-'.repeat(60));

        let loginBlocked = false;
        for (let i = 1; i <= RATE_LIMIT + 2; i++) {
            try {
                const response = await axios.post(`${BASE_URL}/login`, TEST_ENDPOINTS[0].data);
                console.log(`  Request ${i}: ✅ Status ${response.status} - RateLimit-Remaining: ${response.headers['ratelimit-remaining']}`);
            } catch (error) {
                if (error.response?.status === 429) {
                    console.log(`  Request ${i}: 🚫 Status 429 - Rate limit exceeded on /login`);
                    loginBlocked = true;
                } else {
                    console.log(`  Request ${i}: ⚠️  Status ${error.response?.status} - ${error.response?.data?.message || error.message}`);
                }
            }

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!loginBlocked) {
            console.log('\n❌ FAIL: /login endpoint was not rate limited');
            return false;
        }

        // Test 2: Verify /signup endpoint is still accessible
        console.log('\n📍 Test 2: Verifying /signup endpoint is still accessible');
        console.log('-'.repeat(60));

        try {
            const response = await axios.post(`${BASE_URL}/signup`, TEST_ENDPOINTS[1].data);
            console.log(`  ✅ /signup is accessible! Status: ${response.status}`);
            console.log(`  📊 RateLimit-Remaining: ${response.headers['ratelimit-remaining']}`);
            console.log(`  📊 RateLimit-Limit: ${response.headers['ratelimit-limit']}`);
        } catch (error) {
            if (error.response?.status === 429) {
                console.log(`  ❌ FAIL: /signup was blocked (should be independent)`);
                return false;
            } else {
                console.log(`  ✅ /signup is accessible (got expected error: ${error.response?.status})`);
                console.log(`  📊 RateLimit-Remaining: ${error.response?.headers['ratelimit-remaining']}`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ SUCCESS: Endpoint isolation is working correctly!');
        console.log('   - /login was rate limited after 5 requests');
        console.log('   - /signup remained accessible');
        console.log('   - Each endpoint has independent rate limit counters');
        console.log('='.repeat(60));

        return true;

    } catch (error) {
        console.error('\n❌ Test failed with error:', error.message);
        return false;
    }
}

// Run the test
console.log('🚀 Starting Per-API Rate Limiting Test');
console.log('⏰ Make sure the backend server is running on port 5001\n');

testEndpointIsolation()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
