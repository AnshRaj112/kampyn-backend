/**
 * ISSUE-KMP-005 - billing information authentication and IDOR regression tests.
 * Run: node test/billingInfoAuth.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BillingInfo = require('../models/account/BillingInfo');
const controller = require('../controllers/account/billingInfoController');
const { billingInfoAuthMiddleware } = require('../middleware/auth/billingInfoAuthMiddleware');

function response() {
  const result = {};
  return {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return result; },
    result
  };
}

async function main() {
  // Authentication middleware denies anonymous callers before route handlers run.
  const anonymous = response();
  await billingInfoAuthMiddleware({ headers: {}, cookies: {} }, anonymous, () => {
    throw new Error('anonymous request reached next()');
  });
  assert.equal(anonymous.result.status, 401, 'anonymous billing request must return 401');

  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/billingInfoRoutes.js'), 'utf8');
  assert.match(routeSource, /router\.use\(billingInfoAuthMiddleware\)/,
    'all billing routes must be protected by authentication middleware');
  assert.match(routeSource, /router\.get\('\/customer\/me', getCustomerBillingHistory\)/,
    'customer history must use the authenticated /customer/me endpoint');
  assert.match(routeSource, /status\(410\)/,
    'legacy phone lookup must not be usable for enumeration');

  const originalFindOne = BillingInfo.findOne;
  const originalCustomerHistory = BillingInfo.getCustomerBillingHistory;
  const billing = { vendorId: 'vendor-a', orderNumber: 'ORDER-1', status: 'pending' };
  BillingInfo.findOne = async () => billing;
  BillingInfo.getCustomerBillingHistory = async () => [];

  try {
    // Cross-vendor order access and status tampering are rejected.
    const crossVendor = response();
    await controller.getBillingInfoByOrderNumber({
      params: { orderNumber: 'ORDER-1' }, billingActor: { type: 'vendor', id: 'vendor-b' }
    }, crossVendor);
    assert.equal(crossVendor.result.status, 403, 'a vendor cannot read another vendor billing record');

    const statusTamper = response();
    await controller.updateBillingStatus({
      params: { orderNumber: 'ORDER-1' }, body: { status: 'completed' },
      billingActor: { type: 'vendor', id: 'vendor-b' }
    }, statusTamper);
    assert.equal(statusTamper.result.status, 403, 'a vendor cannot update another vendor billing status');

    // A phone supplied by a caller is ignored; the model receives only the
    // authenticated user's verified phone.
    let queriedPhone;
    BillingInfo.getCustomerBillingHistory = async (phone) => {
      queriedPhone = phone;
      return [];
    };
    const customerHistory = response();
    await controller.getCustomerBillingHistory({
      params: { phoneNumber: '9999999999' }, query: {},
      billingActor: { type: 'user', id: 'user-a', phone: '8888888888' }
    }, customerHistory);
    assert.equal(customerHistory.result.body.success, true, 'a user can view their own history');
    assert.equal(queriedPhone, '8888888888', 'a caller-supplied phone is never queried');
  } finally {
    BillingInfo.findOne = originalFindOne;
    BillingInfo.getCustomerBillingHistory = originalCustomerHistory;
  }

  console.log('PASS: ISSUE-KMP-005 billing authentication and IDOR checks');
  // Model imports initialize Mongoose connections; this is a self-contained
  // regression test and should not wait for those background handles.
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
