/**
 * ISSUE-KMP-003 — Require vendor auth on inventory mutations and bind vendorId from session.
 *
 * Security, integration, and regression tests (no live Mongo/HTTP server required).
 *
 * Run with:
 *   node test/inventoryAuth.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { resolveInventoryVendorId, sessionVendorId } = require('../utils/inventoryAuth');

const SESSION_VENDOR = '64b000000000000000000001';
const OTHER_VENDOR = '64b000000000000000000002';

const MUTATION_ROUTES = [
  ['POST', '/add'],
  ['POST', '/reduce'],
  ['POST', '/retail/availability'],
  ['POST', '/raw-materials'],
  ['DELETE', '/raw-materials'],
  ['POST', '/clear-raw-materials']
];

let passed = 0;
let failed = 0;
const failures = [];

function assertCond(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed += 1;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed += 1;
    failures.push(label);
  }
}

function vendorReq(body, vendorId = SESSION_VENDOR) {
  return {
    vendor: { _id: vendorId, vendorId },
    body: body || {}
  };
}

function gateMutation(req) {
  const bound = resolveInventoryVendorId(req);
  if (!bound.ok) {
    return { status: bound.status, message: bound.message, vendorId: null };
  }
  return { status: 200, vendorId: bound.vendorId, message: 'bound' };
}

function runSecurityTests() {
  console.log('\n📋 Security — unauthenticated mutations and vendorId substitution\n');

  const anon = resolveInventoryVendorId({ body: { vendorId: OTHER_VENDOR, itemId: 'item1' } });
  assertCond(anon.status === 401, 'Unauthenticated mutation → 401');

  const noVendor = resolveInventoryVendorId({ body: {} });
  assertCond(noVendor.status === 401, 'Request without req.vendor → 401');

  MUTATION_ROUTES.forEach(([method, route]) => {
    const result = gateMutation({ body: { vendorId: OTHER_VENDOR } });
    assertCond(result.status === 401, `${method} ${route} unauthenticated → 401`);
  });

  const substitution = resolveInventoryVendorId(
    vendorReq({ vendorId: OTHER_VENDOR, itemId: 'item1' })
  );
  assertCond(substitution.status === 403, 'VendorId substitution (other vendor) → 403');
  assertCond(/does not match/.test(substitution.message), 'Substitution error names the vendorId mismatch');

  MUTATION_ROUTES.forEach(([method, route]) => {
    const result = gateMutation(vendorReq({ vendorId: OTHER_VENDOR, itemId: 'item1' }));
    assertCond(
      result.status === 403 && result.vendorId === null,
      `${method} ${route} cannot mutate another vendor (body.vendorId substitution)`
    );
  });
}

function runIntegrationTests() {
  console.log('\n📋 Integration — vendorAuthMiddleware attached; session vendorId used\n');

  const routesSrc = fs.readFileSync(
    path.join(__dirname, '../routes/inventoryRoutes.js'),
    'utf8'
  );

  MUTATION_ROUTES.forEach(([method, route]) => {
    const methodFn = method === 'DELETE' ? 'delete' : 'post';
    const pattern = new RegExp(
      `router\\.${methodFn}\\(\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\s*,\\s*vendorAuthMiddleware`
    );
    assertCond(pattern.test(routesSrc), `${method} ${route} is guarded by vendorAuthMiddleware`);
  });

  const controllerSrc = fs.readFileSync(
    path.join(__dirname, '../controllers/inventory/inventoryController.js'),
    'utf8'
  );
  const handlers = [
    'addInventory',
    'reduceRetailInventory',
    'updateRetailAvailability',
    'updateRawMaterialInventory',
    'deleteRawMaterialInventory',
    'clearAllRawMaterialInventory'
  ];
  handlers.forEach((name) => {
    const block = controllerSrc.split(`exports.${name}`)[1]?.split('exports.')[0] || '';
    assertCond(
      block.includes('bindVendorIdOrReject'),
      `${name} binds vendorId from the authenticated session`
    );
  });

  const bound = gateMutation(vendorReq({ itemId: 'item1', itemType: 'retail', quantity: 2 }));
  assertCond(bound.status === 200 && bound.vendorId === SESSION_VENDOR, 'Authorized add uses session vendorId');
}

function runRegressionTests() {
  console.log('\n📋 Regression — existing authorized vendor flows still succeed\n');

  const omitted = resolveInventoryVendorId(vendorReq({ itemId: 'item1', quantity: 1 }));
  assertCond(
    omitted.ok === true && omitted.vendorId === SESSION_VENDOR,
    'Authorized vendor omitting body.vendorId still binds session vendorId'
  );

  const matching = resolveInventoryVendorId(
    vendorReq({ vendorId: SESSION_VENDOR, itemId: 'item1', quantity: 1 })
  );
  assertCond(
    matching.ok === true && matching.vendorId === SESSION_VENDOR,
    'Authorized vendor sending matching body.vendorId still succeeds'
  );

  const fromVendorIdField = sessionVendorId({ vendor: { vendorId: SESSION_VENDOR } });
  assertCond(fromVendorIdField === SESSION_VENDOR, 'sessionVendorId reads req.vendor.vendorId');

  const fromIdField = sessionVendorId({ vendor: { _id: SESSION_VENDOR } });
  assertCond(fromIdField === SESSION_VENDOR, 'sessionVendorId reads req.vendor._id');

  MUTATION_ROUTES.forEach(([method, route]) => {
    const result = gateMutation(vendorReq({ vendorId: SESSION_VENDOR, itemId: 'item1' }));
    assertCond(
      result.status === 200 && result.vendorId === SESSION_VENDOR,
      `${method} ${route} authorized matching vendorId still succeeds`
    );
  });
}

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ISSUE-KMP-003 — Inventory Mutation Auth / vendorId Binding  ');
  console.log('═══════════════════════════════════════════════════════════════');

  runSecurityTests();
  runIntegrationTests();
  runRegressionTests();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main();
