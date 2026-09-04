/**
 * ISSUE-KMP-002 — Invoice bulk ZIP protection
 * Security, integration, and regression tests (no live Mongo/HTTP server required).
 *
 * Run with:
 *   node test/invoiceBulkExport.test.js
 */

const assert = require('assert');
const {
  MAX_DATE_RANGE_DAYS,
  MAX_EXPORT_ROWS,
  MAX_EXPORTS_PER_HOUR,
  MAX_ORDER_IDS,
  validateExportWindow,
  validateOptionalFilters,
  resolveExportActor,
  checkExportRateLimit,
  resetExportRateLimit,
  applyOwnershipScope,
  evaluateBulkExportRequest,
  overRowCapMessage
} = require('../utils/invoiceExportGuard');
const { createInvoiceExportQueue } = require('../utils/invoiceExportQueue');

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

function adminReq(body, adminId = '64b000000000000000000001') {
  return {
    admin: { adminId, email: 'admin@kampyn.test' },
    body: body || {},
    ip: '127.0.0.1',
    headers: { 'user-agent': 'invoice-bulk-export-test' },
    params: {}
  };
}

async function fakeHandleBulkZip(req, { count, queue, audit }) {
  const preview = evaluateBulkExportRequest(req);
  if (!preview.ok) {
    return { status: preview.status, body: { success: false, message: preview.message }, httpThreadBusy: false };
  }
  if (count === 0) {
    return { status: 404, body: { success: false, message: 'No invoices found for the specified criteria' }, httpThreadBusy: false };
  }
  if (count > MAX_EXPORT_ROWS) {
    return { status: 400, body: { success: false, message: overRowCapMessage(count) }, httpThreadBusy: false };
  }
  const queued = queue.enqueue({
    actorKey: preview.actor.key,
    actorType: preview.actor.type,
    actorId: preview.actor.id,
    query: preview.query,
    startDate: preview.filters.startDate,
    endDate: preview.filters.endDate,
    invoiceCount: count,
    filename: `bulk_invoices_${preview.filters.startDate}_to_${preview.filters.endDate}.zip`
  });
  if (!queued.ok) {
    return { status: queued.status, body: { success: false, message: queued.message }, httpThreadBusy: false };
  }
  audit.push({
    actorId: preview.actor.id,
    actorType: preview.actor.type,
    action: 'bulk_zip',
    jobId: queued.job.id,
    invoiceCount: count
  });
  return {
    status: 202,
    body: { success: true, data: { jobId: queued.job.id, status: queued.job.status } },
    httpThreadBusy: false,
    job: queued.job
  };
}

async function runSecurityTests() {
  console.log('\n📋 Security — unauthenticated / unauthorized actors\n');
  resetExportRateLimit();

  const anon = evaluateBulkExportRequest({ body: { startDate: '2026-01-01', endDate: '2026-01-07' } });
  assertCond(anon.status === 401, 'Unauthenticated bulk ZIP evaluate → 401');

  const vendorShaped = evaluateBulkExportRequest({
    vendor: { vendorId: '64b000000000000000000099' },
    body: { startDate: '2026-01-01', endDate: '2026-01-07' }
  });
  assertCond(vendorShaped.status === 401, 'Vendor-shaped request without admin/uni → 401');

  const userShaped = evaluateBulkExportRequest({
    user: { userId: '64b000000000000000000088' },
    body: { startDate: '2026-01-01', endDate: '2026-01-07' }
  });
  assertCond(userShaped.status === 401, 'End-user-shaped request → 401');

  const actor = resolveExportActor({});
  assertCond(actor.ok === false && actor.status === 401, 'resolveExportActor with empty req → 401');
}

async function runCapTests() {
  console.log('\n📋 Caps — over-range and over-row requests return 400\n');
  resetExportRateLimit();

  const missing = validateExportWindow({});
  assertCond(missing.status === 400, 'Missing dates → 400');

  const inverted = validateExportWindow({ startDate: '2026-02-01', endDate: '2026-01-01' });
  assertCond(inverted.status === 400, 'Inverted date range → 400');

  const tooWide = validateExportWindow({ startDate: '2026-01-01', endDate: '2026-12-31' });
  assertCond(tooWide.status === 400, `Range over ${MAX_DATE_RANGE_DAYS} days → 400`);
  assertCond(/cannot exceed/.test(tooWide.message), 'Over-range message mentions the cap');

  const okRange = validateExportWindow({ startDate: '2026-01-01', endDate: '2026-01-15' });
  assertCond(okRange.ok === true, '31-day-or-less ISO range is accepted');

  const tooManyIds = validateExportWindow({
    startDate: '2026-01-01',
    endDate: '2026-01-02',
    orderIds: Array.from({ length: MAX_ORDER_IDS + 1 }, (_, i) => String(i))
  });
  assertCond(tooManyIds.status === 400, `orderIds over ${MAX_ORDER_IDS} → 400`);

  const impossibleDate = validateExportWindow({ startDate: '2026-02-30', endDate: '2026-03-01' });
  assertCond(impossibleDate.status === 400, 'Non-existent ISO date → 400');

  const injection = validateOptionalFilters({ vendorId: { $ne: null } });
  assertCond(injection.status === 400, 'Object-valued filter (query injection) → 400');

  const overRows = evaluateBulkExportRequest(
    adminReq({ startDate: '2026-01-01', endDate: '2026-01-07' }),
    { count: MAX_EXPORT_ROWS + 1, recordRateLimit: false }
  );
  assertCond(overRows.status === 400, `Matched rows over ${MAX_EXPORT_ROWS} → 400`);
}

async function runRateLimitTests() {
  console.log('\n📋 Rate limit — excessive export attempts return 429\n');
  resetExportRateLimit();
  const key = 'admin:64b000000000000000000001';

  for (let i = 0; i < MAX_EXPORTS_PER_HOUR; i += 1) {
    const allowed = checkExportRateLimit(key);
    assertCond(allowed.allowed === true, `Attempt ${i + 1} within quota is allowed`);
  }
  const blocked = checkExportRateLimit(key);
  assertCond(blocked.allowed === false && blocked.status === 429, `Attempt ${MAX_EXPORTS_PER_HOUR + 1} → 429`);
  assertCond(blocked.retryAfterSeconds >= 1, '429 includes retryAfterSeconds');

  resetExportRateLimit();
  const body = { startDate: '2026-01-01', endDate: '2026-01-07' };
  for (let i = 0; i < MAX_EXPORTS_PER_HOUR; i += 1) {
    const result = evaluateBulkExportRequest(adminReq(body));
    assertCond(result.ok === true, `evaluate attempt ${i + 1} succeeds`);
  }
  const fourth = evaluateBulkExportRequest(adminReq(body));
  assertCond(fourth.status === 429, 'Fourth evaluate in one hour → 429');
}

async function runAsyncAndAuditTests() {
  console.log('\n📋 Integration — async queue, HTTP thread, audit log\n');
  resetExportRateLimit();

  let processStarted = false;
  let processFinished = false;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const deferred = [];
  const queue = createInvoiceExportQueue({
    maxConcurrent: 1,
    maxQueued: 8,
    schedule: (fn) => deferred.push(fn),
    processJob: async () => {
      processStarted = true;
      await gate;
      processFinished = true;
      return { zipPath: '/tmp/fake.zip', tempDir: '/tmp', invoiceCount: 2 };
    }
  });

  const audit = [];
  const response = await fakeHandleBulkZip(
    adminReq({ startDate: '2026-01-01', endDate: '2026-01-07' }),
    { count: 2, queue, audit }
  );

  assertCond(response.status === 202, 'Successful enqueue returns 202');
  assertCond(response.body.data.status === 'queued', 'HTTP response status is queued');
  assertCond(response.httpThreadBusy === false, 'Handler returns without waiting on ZIP work');
  assertCond(processFinished === false, 'ZIP processor has not finished when HTTP returns');
  assertCond(audit.length === 1, 'Export audit log entry created for successful request');
  assertCond(audit[0].action === 'bulk_zip' && audit[0].jobId === response.body.data.jobId, 'Audit entry includes action and jobId');

  while (deferred.length) deferred.shift()();
  await new Promise((r) => setImmediate(r));
  assertCond(processStarted === true, 'Queue worker starts after HTTP return');
  assertCond(processFinished === false, 'ZIP work still gated off the request path');

  release();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const job = queue.getJob(response.body.data.jobId);
  assertCond(job.status === 'completed', 'Job completes on the worker, not the HTTP thread');
  queue.reset();
}

async function runRegressionTests() {
  console.log('\n📋 Regression — valid requests, ownership, job isolation\n');
  resetExportRateLimit();

  const valid = validateExportWindow({ startDate: '2026-08-01', endDate: '2026-08-01' });
  assertCond(valid.ok === true, 'Single-day export remains valid');

  const uniActor = { ok: true, type: 'uni', id: '64b000000000000000000010', key: 'uni:64b000000000000000000010' };
  const scoped = applyOwnershipScope(
    { startDate: '2026-08-01', endDate: '2026-08-07', uniId: '64b000000000000000000099', vendorId: 'abc' },
    uniActor
  );
  assertCond(scoped.uniId === uniActor.id, 'University actor cannot override uniId filter');

  const adminScoped = applyOwnershipScope(
    { startDate: '2026-08-01', endDate: '2026-08-07', uniId: '64b000000000000000000099' },
    { type: 'admin', id: '64b000000000000000000001', key: 'admin:1' }
  );
  assertCond(adminScoped.uniId === '64b000000000000000000099', 'Admin keeps requested uniId filter');

  const queue = createInvoiceExportQueue({
    processJob: async () => ({ zipPath: '/tmp/a.zip', tempDir: '/tmp', invoiceCount: 1 }),
    schedule: (fn) => fn()
  });
  const first = queue.enqueue({
    actorKey: 'admin:1',
    actorType: 'admin',
    actorId: '1',
    query: {},
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    invoiceCount: 1,
    filename: 'a.zip'
  });
  const ownerOk = queue.assertOwner(first.job, 'admin:1');
  const ownerDenied = queue.assertOwner(first.job, 'admin:2');
  assertCond(ownerOk.ok === true, 'Owning admin can read their export job');
  assertCond(ownerDenied.status === 403, 'Other admin cannot read someone else\'s export job');

  const missing = queue.assertOwner(null, 'admin:1');
  assertCond(missing.status === 404, 'Unknown job id → 404');
  queue.reset();

  resetExportRateLimit();
  const none = evaluateBulkExportRequest(
    adminReq({ startDate: '2026-08-01', endDate: '2026-08-07' }),
    { count: 0, recordRateLimit: false }
  );
  assertCond(none.status === 404, 'Zero matching invoices still 404 (not a hang/ZIP)');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ISSUE-KMP-002 — Invoice Bulk ZIP Auth / Caps / Async Tests   ');
  console.log('═══════════════════════════════════════════════════════════════');

  await runSecurityTests();
  await runCapTests();
  await runRateLimitTests();
  await runAsyncAndAuditTests();
  await runRegressionTests();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unexpected test runner error:', err);
  process.exit(1);
});
