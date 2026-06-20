const jwt = require("jsonwebtoken");

function createGoogleAuthHandler({
  AccountModel,
  logger,
  logPrefix,
  buildSuccessResponse,
}) {
  return async (req, res) => {
    try {
      logger.info({ email: req.body.email }, `${logPrefix} Google Login Request`);
      const { email } = req.body;
      const user = await AccountModel.findOne({ email });

      if (!user) {
        logger.info({ email }, `${logPrefix} User not found for Google login`);
        return res.status(400).json({ message: "User does not exist, sign up first" });
      }

      const token = jwt.sign({ userId: user._id, tenantId: user.tenantId || user.uniID }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      logger.info({ email }, `${logPrefix} Google login successful`);
      if (buildSuccessResponse) {
        return res.json(buildSuccessResponse(user, token));
      }
      return res.json({ message: "Google login successful", token });
    } catch (error) {
      logger.error({ error: error.message }, `${logPrefix} Google Login Error`);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

function createGoogleSignupHandler({
  AccountModel,
  logger,
  logPrefix,
  buildNewUserData,
  buildSuccessResponse,
}) {
  return async (req, res) => {
    try {
      logger.info({ email: req.body.email }, `${logPrefix} Google Signup Request`);
      const { email } = req.body;

      const existingUser = await AccountModel.findOne({ email });
      if (existingUser) {
        logger.info({ email }, `${logPrefix} User already exists`);
        return res.status(400).json({ message: "User already exists. Please log in." });
      }

      const newUser = new AccountModel(buildNewUserData(req.body));
      await newUser.save();
      logger.info({ email }, `${logPrefix} Google user saved to database`);

      const token = jwt.sign({ userId: newUser._id, tenantId: newUser.tenantId || newUser.uniID }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      if (buildSuccessResponse) {
        return res.status(201).json(buildSuccessResponse(newUser, token));
      }
      return res.status(201).json({ message: "Google signup successful", token });
    } catch (error) {
      logger.error({ error: error.message }, `${logPrefix} Google Signup Error`);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
}

module.exports = {
  createGoogleAuthHandler,
  createGoogleSignupHandler,
};
