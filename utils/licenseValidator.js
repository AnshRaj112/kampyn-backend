const fs = require("fs");
const jwt = require("jsonwebtoken");
const logger = require("./pinoLogger");

// Path to the public certificate key file provided during installation
const PUBLIC_KEY_PATH = process.env.LICENSE_PUBLIC_KEY_PATH || "/etc/kampyn/keys/license_public.pem";

/**
 * Validates the offline JWT license uploaded by the university
 * @param {string} licenseToken - Base64 encoded signed license key payload
 * @returns {Object} Decoded and validated license details
 */
function validateOfflineLicense(licenseToken) {
  try {
    if (!fs.existsSync(PUBLIC_KEY_PATH)) {
      // Fallback: If public key is not found, log warning and bypass verification during dev parity
      if (process.env.NODE_ENV !== "production") {
        logger.warn(`Public key file not found at ${PUBLIC_KEY_PATH}. Bypassing licensing verification for Development env.`);
        return {
          isValid: true,
          licenseInfo: {
            name: "Default Dev License",
            allowedModules: ["food", "hostel", "auditorium"],
            exp: Math.floor(Date.now() / 1000) + 365 * 24 * 3600
          }
        };
      }
      throw new Error(`Public key file not found at ${PUBLIC_KEY_PATH}`);
    }

    const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, "utf8");

    // Verify token using EXSOLVIA's cryptographic public signature
    const decoded = jwt.verify(licenseToken, publicKey, {
      algorithms: ["RS256"]
    });

    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && now > decoded.exp) {
      throw new Error("License has expired.");
    }

    logger.info({
      university: decoded.name,
      modules: decoded.allowedModules,
      expiry: new Date(decoded.exp * 1000).toISOString()
    }, "Offline JWL verified successfully");

    return {
      isValid: true,
      licenseInfo: decoded
    };
  } catch (error) {
    logger.error({ error: error.message }, "Offline license verification failed");
    return {
      isValid: false,
      reason: error.message
    };
  }
}

module.exports = { validateOfflineLicense };
