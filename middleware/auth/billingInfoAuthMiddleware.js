const jwt = require('jsonwebtoken');
const Admin = require('../../models/account/Admin');
const Uni = require('../../models/account/Uni');
const Vendor = require('../../models/account/Vendor');
const User = require('../../models/account/User');

/**
 * Resolves the authenticated billing actor. Controllers must use this trusted
 * identity rather than IDs or phone numbers supplied by the caller.
 */
async function billingInfoAuthMiddleware(req, res, next) {
  try {
    const authorization = req.headers.authorization;
    const token = authorization && authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : req.cookies?.adminToken || req.cookies?.uniToken || req.cookies?.vendorToken || req.cookies?.token;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }

    const id = decoded.userId;
    const admin = await Admin.findById(id).select('_id isActive role');
    if (admin && admin.isActive) {
      req.billingActor = { type: 'admin', id: admin._id, role: admin.role };
      return next();
    }

    const uni = await Uni.findById(id).select('_id isAvailable');
    if (uni && uni.isAvailable === 'Y') {
      if (req.tenantId && String(uni._id) !== String(req.tenantId)) {
        return res.status(403).json({ success: false, message: 'Access denied for this tenant.' });
      }
      req.billingActor = { type: 'uni', id: uni._id, tenantId: uni._id };
      return next();
    }

    const vendor = await Vendor.findById(id).select('_id tenantId uniID');
    if (vendor) {
      const tenantId = vendor.tenantId || vendor.uniID;
      if (tenantId && req.tenantId && String(tenantId) !== String(req.tenantId)) {
        return res.status(403).json({ success: false, message: 'Access denied for this tenant.' });
      }
      req.billingActor = { type: 'vendor', id: vendor._id, tenantId };
      return next();
    }

    const user = await User.findById(id).select('_id phone tenantId uniID');
    if (user) {
      const tenantId = user.tenantId || user.uniID;
      if (tenantId && req.tenantId && String(tenantId) !== String(req.tenantId)) {
        return res.status(403).json({ success: false, message: 'Access denied for this tenant.' });
      }
      req.billingActor = { type: 'user', id: user._id, phone: user.phone, tenantId };
      return next();
    }

    return res.status(401).json({ success: false, message: 'Authentication required.' });
  } catch (_) {
    return res.status(500).json({ success: false, message: 'Authentication service unavailable.' });
  }
}

module.exports = { billingInfoAuthMiddleware };
