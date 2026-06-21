const logger = require("../utils/pinoLogger");

/**
 * Sanitizes a request payload value recursively to prevent NoSQL query injection and XSS
 */
function sanitizeValue(val) {
  if (typeof val === "string") {
    // 1. Prevent XSS: Strip scripts, html tags, event handlers, and javascript protocols
    return val
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/<\/?[^>]+(>|$)/g, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript\s*:\s*/gi, '');
  } else if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  } else if (val !== null && typeof val === "object") {
    // Check if the object is a standard object, not a special class or buffer
    if (Object.prototype.toString.call(val) === "[object Object]") {
      const sanitizedObj = {};
      for (const key in val) {
        // 2. Prevent NoSQL Injection: Remove keys starting with $ or containing mongoose operators
        if (key.startsWith("$")) {
          logger.warn({ key, value: val[key] }, "NoSQL Injection query payload blocked");
          continue; // Strip out key
        }
        sanitizedObj[key] = sanitizeValue(val[key]);
      }
      return sanitizedObj;
    }
  }
  return val;
}

/**
 * Express middleware to sanitize body, query, and params of every request
 */
const sanitizeMiddleware = (req, res, next) => {
  try {
    if (req.body) {
      req.body = sanitizeValue(req.body);
    }
    if (req.query) {
      req.query = sanitizeValue(req.query);
    }
    if (req.params) {
      req.params = sanitizeValue(req.params);
    }
  } catch (error) {
    logger.error({ error: error.message }, "Error during payload sanitization");
  }
  next();
};

module.exports = sanitizeMiddleware;
