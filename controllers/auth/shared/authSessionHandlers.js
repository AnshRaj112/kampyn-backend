const jwt = require("jsonwebtoken");
const { checkUserActivity, updateUserActivity } = require("../../../utils/authUtils");
const { getCookieOptions } = require("../../../middleware/cookieConfig");

function createVerifyTokenHandler({
  userType,
  tokenResolver,
  attachFullUserAs,
  logger,
  logPrefix,
  invalidTokenStatus = 403,
  deriveUserId,
  notFoundMessage,
}) {
  return async (req, res, next) => {
    const token = tokenResolver(req);
    if (!token) {
      if (logger) logger.warn({ url: req.originalUrl, method: req.method }, `${logPrefix}: No token provided`);
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const resolvedUserId = deriveUserId ? deriveUserId(decoded) : decoded.userId;
      const { shouldLogout, user } = await checkUserActivity(resolvedUserId, userType);

      if (shouldLogout) {
        const message = user
          ? "Session expired due to inactivity. Please log in again."
          : notFoundMessage || "User not found or account inactive.";
        if (logger) logger.warn({ userId: resolvedUserId, userFound: !!user }, `${logPrefix}: ${message}`);
        return res.status(401).json({ message });
      }

      await updateUserActivity(resolvedUserId, userType);
      req.user = decoded;
      if (attachFullUserAs) req[attachFullUserAs] = user;
      return next();
    } catch (error) {
      if (logger) logger.error({ error: error.message, name: error.name }, `${logPrefix}: Verification failed`);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired. Please log in again." });
      }
      return res.status(invalidTokenStatus).json({ message: "Forbidden: Invalid or expired token" });
    }
  };
}

function createRefreshTokenHandler({ tokenResolver, cookieName }) {
  return (req, res) => {
    const token = tokenResolver(req);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const newToken = jwt.sign(
        { 
          userId: decoded.userId, 
          tenantId: decoded.tenantId, 
          role: decoded.role, 
          access: decoded.access 
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );

      res.cookie(cookieName, newToken, getCookieOptions());
      return res.json({ message: "Token refreshed", token: newToken });
    } catch (_error) {
      return res.status(403).json({ message: "Forbidden: Invalid or expired token" });
    }
  };
}

function checkSessionHandler(req, res) {
  if (req.user) {
    return res.json({ message: "Session active", user: req.user });
  }
  return res.status(401).json({ message: "Session expired" });
}

module.exports = {
  createVerifyTokenHandler,
  createRefreshTokenHandler,
  checkSessionHandler,
};
