const handlers = require("../../controllers/auth/userAuthController");
const { createStandardAuthRouter } = require("./shared/createStandardAuthRouter");

module.exports = createStandardAuthRouter(handlers, (router, controllerHandlers) => {
  router.get("/list", controllerHandlers.getColleges);
});
