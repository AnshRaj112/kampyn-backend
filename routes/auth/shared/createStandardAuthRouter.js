const express = require("express");
const { perApiAuthLimiter } = require("../../../middleware/rateLimit");
const { registerStandardAuthRoutes } = require("./registerStandardAuthRoutes");

function createStandardAuthRouter(handlers, configureExtraRoutes) {
  const router = express.Router();
  registerStandardAuthRoutes(router, handlers, perApiAuthLimiter);
  if (configureExtraRoutes) {
    configureExtraRoutes(router, handlers);
  }
  return router;
}

module.exports = { createStandardAuthRouter };
