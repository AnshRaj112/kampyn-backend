const createRoleSignupHandler = ({
  AccountModel,
  OtpModel,
  logger,
  hashPassword,
  jwt,
  jwtSecret,
  generateOtp,
  sendOtpEmail,
  getSignupData,
  validateSignup,
  duplicateQuery,
  duplicateMessage = "User already exists",
  buildAccountData,
  afterAccountCreated,
  tokenPayload,
  successRole,
}) => {
  return async (req, res) => {
    try {
      logger.info({ email: req.body.email }, "Signup Request Received");
      const signupData = getSignupData(req);

      const validationError = validateSignup?.(signupData);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const emailLower = signupData.email.toLowerCase();
      const existingUser = await AccountModel.findOne(duplicateQuery(signupData, emailLower));
      if (existingUser) {
        logger.info({ email: emailLower }, "User already exists");
        return res.status(400).json({ message: duplicateMessage });
      }

      const hashedPassword = await hashPassword(signupData.password);
      logger.info("Password hashed successfully");

      const accountData = buildAccountData(signupData, emailLower, hashedPassword);
      const newAccount = new AccountModel(accountData);
      await newAccount.save();
      logger.info({ email: emailLower }, "Account created");

      if (afterAccountCreated) {
        await afterAccountCreated(newAccount, signupData);
      }

      const token = jwt.sign(tokenPayload(newAccount), jwtSecret, { expiresIn: "7d" });
      const otp = generateOtp();
      await new OtpModel({ email: emailLower, otp }).save();
      await sendOtpEmail(emailLower, otp);

      return res.status(201).json({
        message: "Account created successfully. OTP sent for verification.",
        token,
        role: successRole(newAccount),
        id: newAccount._id,
      });
    } catch (error) {
      logger.error({ error: error.message }, "Signup Error");
      return res.status(500).json({ message: "Signup failed.", error: error.message });
    }
  };
};

const createRoleLoginHandler = ({
  AccountModel,
  OtpModel,
  logger,
  argon2,
  jwt,
  jwtSecret,
  processIdentifier,
  handleUnverifiedLogin,
  generateOtp,
  sendOtpEmail,
  unverifiedRedirect,
  includeEmailInUnverified = false,
  clearExistingOtps = false,
  checkAccess,
  tokenPayload = (user) => ({ userId: user._id, tenantId: user.tenantId || user.uniID }),
  updateUserActivity,
  activityRole,
  setTokenCookie,
  buildSuccessUser,
}) => {
  return async (req, res) => {
    try {
      logger.info({ identifier: req.body.identifier }, "Login Request");
      const { identifier, password } = req.body;
      const processedIdentifier = processIdentifier(identifier);

      const user = await AccountModel.findOne({
        $or: [{ email: processedIdentifier }, { phone: processedIdentifier }],
      });

      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      if (!user.isVerified) {
        const unverifiedResponse = await handleUnverifiedLogin({
          user,
          OtpModel,
          generateOtp,
          sendOtpEmail,
          redirectTo: unverifiedRedirect(user),
          includeEmail: includeEmailInUnverified,
          clearExistingOtps,
        });
        return res.status(400).json(unverifiedResponse);
      }

      const isMatch = await argon2.verify(user.password, password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      if (checkAccess) {
        const accessError = await checkAccess(user, req);
        if (accessError) {
          return res.status(accessError.status).json({ message: accessError.message });
        }
      }

      const token = jwt.sign(tokenPayload(user), jwtSecret, { expiresIn: "7d" });
      await updateUserActivity(user._id, activityRole);
      setTokenCookie(res, token);

      return res.json({
        success: true,
        message: "Login successful",
        token,
        user: buildSuccessUser(user),
      });
    } catch (error) {
      logger.error({ error: error.message }, "Login Error");
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
};

module.exports = {
  createRoleSignupHandler,
  createRoleLoginHandler,
};
