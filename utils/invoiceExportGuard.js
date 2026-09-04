/**
 * Caps, ownership scoping, and per-actor rate limits for invoice bulk exports.
 * ISSUE-KMP-002 — Protect Invoice Bulk ZIP with Auth, Caps, Rate Limits, and Async Processing.
 */

const MAX_DATE_RANGE_DAYS = Number(process.env.INVOICE_EXPORT_MAX_DAYS) || 31;
const MAX_EXPORT_ROWS = Number(process.env.INVOICE_EXPORT_MAX_ROWS) || 500;
const MAX_EXPORTS_PER_HOUR = Number(process.env.INVOICE_EXPORT_MAX_PER_HOUR) || 3;
const MAX_ORDER_IDS = Number(process.env.INVOICE_EXPORT_MAX_ORDER_IDS) || 100;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const INVOICE_TYPES = new Set(['vendor', 'platform']);
const RECIPIENT_TYPES = new Set(['vendor', 'admin']);

/** @type {Map<string, number[]>} actorKey -> timestamps of export attempts in the current window */
const exportAttempts = new Map();

function parseIsoDate(value, label) {
  if (!value || typeof value !== 'string' || !ISO_DATE.test(value)) {
    return { ok: false, message: `${label} must be an ISO date (YYYY-MM-DD)` };
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  // Date otherwise normalizes values such as 2026-02-31 into March.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, message: `${label} is not a valid date` };
  }
  return { ok: true, date: parsed, raw: value };
}

function daysBetween(start, end) {
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Validate date window, optional orderIds length, and hard row/range caps.
 * Does not hit the database — callers must still enforce MAX_EXPORT_ROWS against countDocuments.
 */
function validateExportWindow({ startDate, endDate, orderIds } = {}) {
  if (!startDate || !endDate) {
    return { ok: false, status: 400, message: 'Start date and end date are required' };
  }

  const start = parseIsoDate(startDate, 'Start date');
  if (!start.ok) return { ok: false, status: 400, message: start.message };

  const end = parseIsoDate(endDate, 'End date');
  if (!end.ok) return { ok: false, status: 400, message: end.message };

  // Inclusive end-of-day so a single-day export is valid
  const endInclusive = new Date(end.date);
  endInclusive.setUTCHours(23, 59, 59, 999);

  if (start.date > endInclusive) {
    return { ok: false, status: 400, message: 'Start date must be on or before end date' };
  }

  const rangeDays = daysBetween(start.date, endInclusive);
  if (rangeDays > MAX_DATE_RANGE_DAYS) {
    return {
      ok: false,
      status: 400,
      message: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`
    };
  }

  if (orderIds !== undefined && orderIds !== null) {
    if (!Array.isArray(orderIds)) {
      return { ok: false, status: 400, message: 'orderIds must be an array' };
    }
    if (orderIds.length > MAX_ORDER_IDS) {
      return {
        ok: false,
        status: 400,
        message: `orderIds cannot exceed ${MAX_ORDER_IDS} entries`
      };
    }
    if (orderIds.some((id) => typeof id !== 'string' || !OBJECT_ID.test(id))) {
      return { ok: false, status: 400, message: 'orderIds must contain valid order IDs' };
    }
  }

  return {
    ok: true,
    startDate: start.raw,
    endDate: end.raw,
    startBound: start.date,
    endBound: endInclusive,
    rangeDays
  };
}

function validateOptionalFilters(body = {}) {
  for (const field of ['vendorId', 'uniId']) {
    const value = body[field];
    if (value !== undefined && value !== null &&
      (typeof value !== 'string' || !OBJECT_ID.test(value))) {
      return { ok: false, status: 400, message: `${field} must be a valid ID` };
    }
  }
  if (body.invoiceType !== undefined && !INVOICE_TYPES.has(body.invoiceType)) {
    return { ok: false, status: 400, message: 'invoiceType must be vendor or platform' };
  }
  if (body.recipientType !== undefined && !RECIPIENT_TYPES.has(body.recipientType)) {
    return { ok: false, status: 400, message: 'recipientType must be vendor or admin' };
  }
  return { ok: true };
}

function resolveExportActor(req = {}) {
  if (req.admin && (req.admin.adminId || req.admin._id)) {
    const id = req.admin.adminId || req.admin._id;
    return { ok: true, type: 'admin', id: String(id), key: `admin:${id}` };
  }
  if (req.uni && req.uni._id) {
    return { ok: true, type: 'uni', id: String(req.uni._id), key: `uni:${req.uni._id}` };
  }
  return { ok: false, status: 401, message: 'Authentication required.' };
}

function pruneAttempts(timestamps, now) {
  const cutoff = now - RATE_WINDOW_MS;
  return timestamps.filter((ts) => ts > cutoff);
}

/**
 * Sliding-window limiter: ~3 exports per hour per admin/uni actor.
 * Returns 429 payload when the actor is over quota.
 */
function checkExportRateLimit(actorKey, now = Date.now()) {
  if (!actorKey) {
    return { allowed: false, status: 401, message: 'Authentication required.' };
  }
  const recent = pruneAttempts(exportAttempts.get(actorKey) || [], now);
  if (recent.length >= MAX_EXPORTS_PER_HOUR) {
    const retryAfterMs = RATE_WINDOW_MS - (now - recent[0]);
    return {
      allowed: false,
      status: 429,
      message: `Too many invoice export requests. Maximum ${MAX_EXPORTS_PER_HOUR} per hour.`,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
    };
  }
  recent.push(now);
  exportAttempts.set(actorKey, recent);
  return { allowed: true, remaining: MAX_EXPORTS_PER_HOUR - recent.length };
}

function resetExportRateLimit(actorKey) {
  if (actorKey) {
    exportAttempts.delete(actorKey);
  } else {
    exportAttempts.clear();
  }
}

/**
 * University staff may only export their own tenant's invoices.
 * Platform admins keep the filters they supplied.
 */
function applyOwnershipScope(filters, actor) {
  const scoped = { ...filters };
  if (actor && actor.type === 'uni') {
    scoped.uniId = actor.id;
  }
  return scoped;
}

function buildInvoiceQuery(filters) {
  const query = {
    createdAt: {
      $gte: filters.startBound,
      $lte: filters.endBound
    }
  };
  if (filters.vendorId) query.vendorId = filters.vendorId;
  if (filters.uniId) query.uniId = filters.uniId;
  if (filters.invoiceType) query.invoiceType = filters.invoiceType;
  if (filters.recipientType) query.recipientType = filters.recipientType;
  if (Array.isArray(filters.orderIds) && filters.orderIds.length > 0) {
    query.orderId = { $in: filters.orderIds };
  }
  return query;
}

function overRowCapMessage(count) {
  return `Export exceeds the maximum of ${MAX_EXPORT_ROWS} invoices (matched ${count}). Narrow the date range or filters.`;
}

/**
 * Shared decision tree for bulk export HTTP handlers.
 * Rate-limit is recorded only when recordRateLimit is true.
 */
function evaluateBulkExportRequest(req, { count, recordRateLimit = true } = {}) {
  const actor = resolveExportActor(req);
  if (!actor.ok) {
    return { ok: false, status: actor.status, message: actor.message };
  }

  const window = validateExportWindow(req.body || {});
  if (!window.ok) {
    return { ok: false, status: window.status, message: window.message, actor };
  }

  const optionalFilters = validateOptionalFilters(req.body || {});
  if (!optionalFilters.ok) {
    return { ok: false, status: optionalFilters.status, message: optionalFilters.message, actor };
  }

  if (recordRateLimit) {
    const rate = checkExportRateLimit(actor.key);
    if (!rate.allowed) {
      return {
        ok: false,
        status: rate.status,
        message: rate.message,
        retryAfterSeconds: rate.retryAfterSeconds,
        actor
      };
    }
  }

  const filters = applyOwnershipScope(
    {
      ...window,
      vendorId: req.body && req.body.vendorId,
      uniId: req.body && req.body.uniId,
      invoiceType: req.body && req.body.invoiceType,
      recipientType: req.body && req.body.recipientType,
      orderIds: req.body && req.body.orderIds
    },
    actor
  );

  if (typeof count === 'number') {
    if (count === 0) {
      return { ok: false, status: 404, message: 'No invoices found for the specified criteria', actor, filters };
    }
    if (count > MAX_EXPORT_ROWS) {
      return { ok: false, status: 400, message: overRowCapMessage(count), actor, filters };
    }
  }

  return {
    ok: true,
    actor,
    filters,
    query: buildInvoiceQuery(filters)
  };
}

module.exports = {
  MAX_DATE_RANGE_DAYS,
  MAX_EXPORT_ROWS,
  MAX_EXPORTS_PER_HOUR,
  MAX_ORDER_IDS,
  RATE_WINDOW_MS,
  validateExportWindow,
  validateOptionalFilters,
  resolveExportActor,
  checkExportRateLimit,
  resetExportRateLimit,
  applyOwnershipScope,
  buildInvoiceQuery,
  overRowCapMessage,
  evaluateBulkExportRequest
};
