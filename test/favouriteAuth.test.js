/**
 * ISSUE-KMP-004 — authentication and BOLA coverage for favourites routes.
 * Run with: node test/favouriteAuth.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateUserAccess } = require('../middleware/auth/validateUserAccess');

const USER_A = '64b000000000000000000001';
const USER_B = '64b000000000000000000002';
const routes = [
  ['get', '/:userId'],
  ['get', '/:userId/:uniId'],
  ['get', '/:userId/:uniId/:vendorId'],
  ['patch', '/:userId/:itemId/:kind/:vendorId']
];

function runGuard(req) {
  let result;
  validateUserAccess(req, { status: (status) => ({ json: (body) => { result = { status, body }; } }) }, () => {
    result = { status: 200, userId: req.authenticatedUserId };
  });
  return result;
}

function check(condition, message) {
  assert.ok(condition, message);
  console.log(`PASS: ${message}`);
}

function main() {
  // Security: no auth context is rejected before a controller can use :userId.
  check(runGuard({ params: { userId: USER_A } }).status === 401, 'unauthenticated request returns 401');
  check(runGuard({ user: { userId: USER_A }, params: { userId: USER_B } }).status === 403,
    'User A cannot access User B favourites');

  // Regression: the authenticated owner proceeds and becomes the controller source.
  const self = runGuard({ user: { userId: USER_A }, params: { userId: USER_A } });
  check(self.status === 200 && self.userId === USER_A, 'self-access remains functional');

  const routeSource = fs.readFileSync(path.join(__dirname, '../routes/favouriteRoutes.js'), 'utf8');
  for (const [method, route] of routes) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`router\\.${method}\\(\\s*["']${escaped}["']\\s*,\\s*authMiddleware\\s*,\\s*validateUserAccess`);
    check(pattern.test(routeSource), `${method.toUpperCase()} ${route} has auth and BOLA middleware`);
  }
}

main();
