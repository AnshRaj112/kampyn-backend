const handlers = require("../../controllers/auth/uniAuthController");
const { createStandardAuthRouter } = require("./shared/createStandardAuthRouter");
const { uniOrSuperAdminAuth } = require("../../middleware/auth/uniAuthMiddleware");

const configureExtraRoutes = (router, handlers) => {
  router.post("/sub-admin/signup", uniOrSuperAdminAuth, handlers.signupSubAdmin);
  router.get("/sub-admins", uniOrSuperAdminAuth, handlers.getSubAdmins);
  router.delete("/sub-admin/:id", uniOrSuperAdminAuth, handlers.deleteSubAdmin);
};

module.exports = createStandardAuthRouter(handlers, configureExtraRoutes);
