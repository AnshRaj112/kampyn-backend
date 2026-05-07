const handlers = require("../../controllers/auth/uniAuthController");
const { createStandardAuthRouter } = require("./shared/createStandardAuthRouter");

module.exports = createStandardAuthRouter(handlers);
