const handlers = require("../../controllers/auth/guestHouseAuthController");
const { createStandardAuthRouter } = require("./shared/createStandardAuthRouter");

module.exports = createStandardAuthRouter(handlers, (router, controllerHandlers) => {
  router.get("/assignments", controllerHandlers.verifyToken, controllerHandlers.getAssignments);
});

