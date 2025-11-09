const pino = require("pino");

// Create logger with pretty printing disabled for better performance
// Pretty printing is disabled to avoid performance issues during load tests
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // No transport configured - output directly to stdout/stderr for better performance
  // Pretty printing disabled by default for production performance
});

module.exports = logger;

