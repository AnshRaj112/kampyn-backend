/**
 * Bind inventory mutation vendorId from the authenticated vendor session.
 * ISSUE-KMP-003 — body.vendorId is never trusted as the target vendor.
 */

function sessionVendorId(req) {
  if (!req || !req.vendor) return null;
  const id = req.vendor.vendorId || req.vendor._id;
  return id ? String(id) : null;
}

/**
 * Resolve the vendor that inventory mutations may target.
 * - Unauthenticated → 401
 * - body.vendorId present and not equal to the session vendor → 403
 * - otherwise vendorId is taken only from req.vendor
 */
function resolveInventoryVendorId(req = {}) {
  const vendorId = sessionVendorId(req);
  if (!vendorId) {
    return {
      ok: false,
      status: 401,
      message: 'Access denied. Vendor authentication required.'
    };
  }

  const claimed = req.body && req.body.vendorId;
  if (claimed !== undefined && claimed !== null && String(claimed) !== '') {
    if (String(claimed) !== vendorId) {
      return {
        ok: false,
        status: 403,
        message: 'Access denied. vendorId does not match the authenticated vendor.'
      };
    }
  }

  return { ok: true, vendorId };
}

module.exports = {
  sessionVendorId,
  resolveInventoryVendorId
};
