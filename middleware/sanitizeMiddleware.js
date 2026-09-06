const sanitizeHtml = require("sanitize-html");
const logger = require("../utils/pinoLogger");

/**
 * Sanitizes strings to prevent HTML/XSS injection.
 *
 * This configuration removes all HTML tags and attributes.
 * The result is plain text only.
 */
function sanitizeString(value) {
  if (typeof value !== "string") {
    return value;
  }

  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    allowVulnerableTags: false,
  });
}

/**
 * Checks whether an object key could be used for NoSQL/operator injection.
 *
 * MongoDB operators commonly start with "$".
 * Dotted keys can also be dangerous depending on how the value is later used
 * in database queries or updates.
 */
function isDangerousKey(key) {
  return (
    typeof key !== "string" ||
    key.startsWith("$") ||
    key.includes(".")
  );
}

/**
 * Recursively sanitizes request values.
 *
 * - Strings: removes HTML/XSS payloads
 * - Arrays: sanitizes every item
 * - Plain objects: removes dangerous NoSQL keys and sanitizes nested values
 */
function sanitizeValue(value) {
  // Strings
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  // Arrays
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  // Null and primitive values
  if (value === null || typeof value !== "object") {
    return value;
  }

  // Only recursively process plain objects
  if (Object.prototype.toString.call(value) === "[object Object]") {
    const sanitizedObject = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (isDangerousKey(key)) {
        logger.warn(
          {
            key,
            value: nestedValue,
          },
          "Potential NoSQL injection key removed from request payload"
        );

        continue;
      }

      sanitizedObject[key] = sanitizeValue(nestedValue);
    }

    return sanitizedObject;
  }

  // Preserve special objects such as Date, Buffer, etc.
  return value;
}

/**
 * Express middleware that sanitizes:
 *
 * - req.body
 * - req.query
 * - req.params
 */
const sanitizeMiddleware = (req, res, next) => {
  try {
    if (req.body !== undefined && req.body !== null) {
      req.body = sanitizeValue(req.body);
    }

    if (req.query !== undefined && req.query !== null) {
      req.query = sanitizeValue(req.query);
    }

    if (req.params !== undefined && req.params !== null) {
      req.params = sanitizeValue(req.params);
    }

    return next();
  } catch (error) {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
      },
      "Error during request payload sanitization"
    );

    return next(error);
  }
};

module.exports = sanitizeMiddleware;