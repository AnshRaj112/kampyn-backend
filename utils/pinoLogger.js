const pino = require("pino");

// Create logger with pretty printing disabled for better performance
// Pretty printing is disabled to avoid performance issues during load tests
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Configure redaction for sensitive fields to prevent accidental leakage in logs
  redact: {
    paths: [
      "password",
      "oldPassword",
      "newPassword",
      "confirmPassword",
      "email",
      "phone",
      "otp",
      "token",
      "gstNumber",
      "body.password",
      "body.email",
      "body.phone",
      "body.otp",
      "req.body.password",
      "req.body.email",
      "req.body.phone",
      "req.body.otp",
      "userData.password",
      "userData.email",
      "userData.phone"
    ],
    // Remove the sensitive values entirely rather than just masking them for better security
    remove: true
  }
});

module.exports = logger;

