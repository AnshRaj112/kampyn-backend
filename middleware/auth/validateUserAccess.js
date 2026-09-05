/**
 * Enforce object-level access for routes whose :userId identifies a user-owned
 * resource. Authentication must run before this middleware.
 */
function validateUserAccess(req, res, next) {
  const authenticatedUserId = req.user && req.user.userId;
  const requestedUserId = req.params && req.params.userId;

  if (!authenticatedUserId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  if (!requestedUserId || String(authenticatedUserId) !== String(requestedUserId)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own favourites.'
    });
  }

  // Controllers use this trusted source rather than accepting the URL value
  // as the authority for the user record.
  req.authenticatedUserId = String(authenticatedUserId);
  return next();
}

module.exports = { validateUserAccess };
