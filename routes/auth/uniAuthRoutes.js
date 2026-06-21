const handlers = require("../../controllers/auth/uniAuthController");
const { createStandardAuthRouter } = require("./shared/createStandardAuthRouter");
const { uniOrSuperAdminAuth } = require("../../middleware/auth/uniAuthMiddleware");

const configureExtraRoutes = (router, handlers) => {
  router.post("/sub-admin/signup", uniOrSuperAdminAuth, handlers.signupSubAdmin);
};

module.exports = createStandardAuthRouter(handlers, configureExtraRoutes);
