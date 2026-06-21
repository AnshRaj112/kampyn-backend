const handlers = require("../../controllers/auth/tenantAuthController");
const { createStandardAuthRouter } = require("./shared/createStandardAuthRouter");

module.exports = createStandardAuthRouter(handlers);
