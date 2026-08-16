/**
 * Integration & Security Test Suite — ISSUE-KMP-001
 * Re-enable Authentication & Authorization on Invoice APIs
 *
 * Run with:
 *   node test/invoiceAuth.test.js
 *
 * Requires the dev server to be running on the port set in BACKEND_URL (default: http://localhost:5001)
 * and the following env vars:
 *   BACKEND_URL            — base URL of the API server
 *   TEST_USER_TOKEN        — valid JWT for a regular end-user
 *   TEST_VENDOR_TOKEN      — valid JWT for a vendor
 *   TEST_OTHER_VENDOR_TOKEN— valid JWT for a DIFFERENT vendor (cross-vendor test)
 *   TEST_ADMIN_TOKEN       — valid JWT for a platform admin
 *   TEST_UNI_TOKEN         — valid JWT for a university staff account
 *   TEST_ORDER_ID          — MongoDB ObjectId of an order owned by the test user
 *   TEST_OTHER_ORDER_ID    — MongoDB ObjectId of an order owned by ANOTHER user
 *   TEST_VENDOR_ID         — MongoDB ObjectId matching TEST_VENDOR_TOKEN's vendor
 *   TEST_OTHER_VENDOR_ID   — MongoDB ObjectId of a DIFFERENT vendor
 *   TEST_UNI_ID            — MongoDB ObjectId matching TEST_UNI_TOKEN's university
 *   TEST_OTHER_UNI_ID      — MongoDB ObjectId of a DIFFERENT university
 *   TEST_INVOICE_ID        — MongoDB ObjectId of an invoice for TEST_ORDER_ID
 */

require('dotenv').config();

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5001';

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
    failures.push(label);
  }
}

async function request(method, path, { token, body } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  try {
    const res = await fetch(url, options);
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json };
  } catch (err) {
    console.error(`  ⚠️  Network error for ${method} ${url}: ${err.message}`);
    return { status: -1, body: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment validation
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  'TEST_USER_TOKEN',
  'TEST_VENDOR_TOKEN',
  'TEST_OTHER_VENDOR_TOKEN',
  'TEST_ADMIN_TOKEN',
  'TEST_UNI_TOKEN',
  'TEST_ORDER_ID',
  'TEST_OTHER_ORDER_ID',
  'TEST_VENDOR_ID',
  'TEST_OTHER_VENDOR_ID',
  'TEST_UNI_ID',
  'TEST_OTHER_UNI_ID',
  'TEST_INVOICE_ID',
];

const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error('\n❌ Missing required environment variables:\n  ' + missingEnv.join('\n  '));
  console.error('\nSet these in your .env or export them before running this script.');
  process.exit(1);
}

const ENV = {
  userToken:        process.env.TEST_USER_TOKEN,
  vendorToken:      process.env.TEST_VENDOR_TOKEN,
  otherVendorToken: process.env.TEST_OTHER_VENDOR_TOKEN,
  adminToken:       process.env.TEST_ADMIN_TOKEN,
  uniToken:         process.env.TEST_UNI_TOKEN,
  orderId:          process.env.TEST_ORDER_ID,
  otherOrderId:     process.env.TEST_OTHER_ORDER_ID,
  vendorId:         process.env.TEST_VENDOR_ID,
  otherVendorId:    process.env.TEST_OTHER_VENDOR_ID,
  uniId:            process.env.TEST_UNI_ID,
  otherUniId:       process.env.TEST_OTHER_UNI_ID,
  invoiceId:        process.env.TEST_INVOICE_ID,
};

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

async function runAnonymousAccessTests() {
  console.log('\n📋 Suite 1 — Anonymous / Unauthenticated access (all must return 401)\n');

  const endpoints = [
    ['GET',  `/api/invoices/order/${ENV.orderId}`],
    ['GET',  `/api/invoices/${ENV.invoiceId}`],
    ['GET',  `/api/invoices/${ENV.invoiceId}/download`],
    ['GET',  `/api/invoices/vendor/${ENV.vendorId}`],
    ['GET',  `/api/invoices/university/${ENV.uniId}`],
    ['GET',  `/api/invoices/admin`],
    ['GET',  `/api/invoices/stats`],
    ['POST', `/api/invoices/bulk-download`],
    ['POST', `/api/invoices/bulk-zip-download`],
    ['GET',  `/api/invoices/bulk-zip-jobs/00000000-0000-0000-0000-000000000000`],
  ];

  for (const [method, path] of endpoints) {
    const r = await request(method, path);
    assert(r.status === 401, `${method} ${path} → 401 without token`);
  }
}

async function runUserOwnershipTests() {
  console.log('\n📋 Suite 2 — End-user ownership checks\n');

  // Owner can access their own order's invoices
  const r1 = await request('GET', `/api/invoices/order/${ENV.orderId}`, { token: ENV.userToken });
  assert(r1.status === 200, `User → GET /order/:ownOrderId → 200`);

  // Owner can access their own invoice by ID
  const r2 = await request('GET', `/api/invoices/${ENV.invoiceId}`, { token: ENV.userToken });
  assert(r2.status === 200, `User → GET /:ownInvoiceId → 200`);

  // Owner can download their own invoice
  const r3 = await request('GET', `/api/invoices/${ENV.invoiceId}/download`, { token: ENV.userToken });
  assert([200, 302, 404].includes(r3.status), `User → GET /:ownInvoiceId/download → 200|302|404 (not 401/403)`);

  // Owner cannot access another user's order
  const r4 = await request('GET', `/api/invoices/order/${ENV.otherOrderId}`, { token: ENV.userToken });
  assert(r4.status === 403, `User → GET /order/:otherOrderId → 403`);

  // Regular user cannot access /admin endpoint
  const r5 = await request('GET', `/api/invoices/admin`, { token: ENV.userToken });
  assert([401, 403].includes(r5.status), `User token → GET /admin → 401 or 403`);

  // Regular user cannot access /stats endpoint
  const r6 = await request('GET', `/api/invoices/stats`, { token: ENV.userToken });
  assert([401, 403].includes(r6.status), `User token → GET /stats → 401 or 403`);
}

async function runVendorAuthorizationTests() {
  console.log('\n📋 Suite 3 — Vendor authorization checks\n');

  // Vendor can access their own invoices
  const r1 = await request('GET', `/api/invoices/vendor/${ENV.vendorId}`, { token: ENV.vendorToken });
  assert(r1.status === 200, `Vendor → GET /vendor/:ownVendorId → 200`);

  // Vendor cannot access another vendor's invoices
  const r2 = await request('GET', `/api/invoices/vendor/${ENV.otherVendorId}`, { token: ENV.vendorToken });
  assert(r2.status === 403, `Vendor → GET /vendor/:otherVendorId → 403`);

  // Vendor cannot access admin endpoint
  const r3 = await request('GET', `/api/invoices/admin`, { token: ENV.vendorToken });
  assert([401, 403].includes(r3.status), `Vendor token → GET /admin → 401 or 403`);

  // Vendor cannot use bulk-zip-download (admin only)
  const r4 = await request('POST', `/api/invoices/bulk-zip-download`, {
    token: ENV.vendorToken,
    body: { startDate: '2024-01-01', endDate: '2024-12-31' }
  });
  assert([401, 403].includes(r4.status), `Vendor token → POST /bulk-zip-download → 401 or 403`);
}

async function runAdminAuthorizationTests() {
  console.log('\n📋 Suite 4 — Platform admin authorization\n');

  // Admin can access /admin endpoint
  const r1 = await request('GET', `/api/invoices/admin`, { token: ENV.adminToken });
  assert(r1.status === 200, `Admin → GET /admin → 200`);

  // Admin can access any order's invoices (cross-ownership)
  const r2 = await request('GET', `/api/invoices/order/${ENV.orderId}`, { token: ENV.adminToken });
  assert(r2.status === 200, `Admin → GET /order/:orderId → 200 (unrestricted)`);

  // Admin can access any vendor's invoices
  const r3 = await request('GET', `/api/invoices/vendor/${ENV.vendorId}`, { token: ENV.adminToken });
  assert(r3.status === 200, `Admin → GET /vendor/:vendorId → 200 (unrestricted)`);

  // Admin can access any invoice by ID
  const r4 = await request('GET', `/api/invoices/${ENV.invoiceId}`, { token: ENV.adminToken });
  assert(r4.status === 200, `Admin → GET /:invoiceId → 200 (unrestricted)`);

  // Admin can access bulk-download
  const r5 = await request('POST', `/api/invoices/bulk-download`, {
    token: ENV.adminToken,
    body: { startDate: '2024-01-01', endDate: '2024-01-15' }
  });
  assert([200, 400, 404].includes(r5.status), `Admin → POST /bulk-download → 200, 400, or 404 (not 401/403)`);
}

async function runUniversityStaffTests() {
  console.log('\n📋 Suite 5 — University staff authorization\n');

  // Uni staff can access their own university's invoices
  const r1 = await request('GET', `/api/invoices/university/${ENV.uniId}`, { token: ENV.uniToken });
  assert(r1.status === 200, `Uni staff → GET /university/:ownUniId → 200`);

  // Uni staff cannot access a different university's invoices (IDOR / cross-tenant)
  const r2 = await request('GET', `/api/invoices/university/${ENV.otherUniId}`, { token: ENV.uniToken });
  assert([403, 404].includes(r2.status), `Uni staff → GET /university/:otherUniId → 403 or 404`);

  // Uni staff cannot access /admin
  const r3 = await request('GET', `/api/invoices/admin`, { token: ENV.uniToken });
  assert([401, 403].includes(r3.status), `Uni token → GET /admin → 401 or 403`);
}

async function runCrossTenantTests() {
  console.log('\n📋 Suite 6 — Cross-tenant IDOR prevention\n');

  // Vendor from a different tenant accessing orders/invoices of another tenant
  // (This relies on tenantMiddleware rejecting or invoiceMultiAuth's tenant check)
  const r1 = await request('GET', `/api/invoices/vendor/${ENV.otherVendorId}`, {
    token: ENV.otherVendorToken
  });
  assert(r1.status === 200, `Other vendor → GET /vendor/:ownVendorId (using otherVendorToken) → 200`);

  // Other vendor cannot access first vendor's invoices
  const r2 = await request('GET', `/api/invoices/vendor/${ENV.vendorId}`, {
    token: ENV.otherVendorToken
  });
  assert(r2.status === 403, `Other vendor → GET /vendor/:firstVendorId → 403`);
}

async function runInvalidTokenTests() {
  console.log('\n📋 Suite 7 — Invalid / malformed token rejection\n');

  // Completely invalid token string
  const r1 = await request('GET', `/api/invoices/admin`, { token: 'this.is.not.a.jwt' });
  assert(r1.status === 401, `Malformed token → GET /admin → 401`);

  // Empty bearer header
  const url = `${BASE_URL}/api/invoices/admin`;
  const res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ', 'Content-Type': 'application/json' }
  });
  assert(res.status === 401, `Empty bearer value → GET /admin → 401`);

  // Missing bearer prefix
  const res2 = await fetch(url, {
    headers: { 'Authorization': ENV.adminToken, 'Content-Type': 'application/json' }
  });
  // This may 401 because the token isn't prefixed with "Bearer "
  assert([401, 403].includes(res2.status), `Missing 'Bearer ' prefix → GET /admin → 401 or 403`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ISSUE-KMP-001 — Invoice API Auth/Authz Integration Tests     ');
  console.log(`  Server: ${BASE_URL}                                           `);
  console.log('═══════════════════════════════════════════════════════════════');

  await runAnonymousAccessTests();
  await runUserOwnershipTests();
  await runVendorAuthorizationTests();
  await runAdminAuthorizationTests();
  await runUniversityStaffTests();
  await runCrossTenantTests();
  await runInvalidTokenTests();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach(f => console.log(`    • ${f}`));
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Unexpected test runner error:', err);
  process.exit(1);
});
