const handlers = require("../../controllers/auth/vendorAuthController");
const { createStandardAuthRouter } = require("./shared/createStandardAuthRouter");

module.exports = createStandardAuthRouter(handlers);
