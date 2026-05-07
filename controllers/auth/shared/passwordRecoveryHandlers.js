const createForgotPasswordHandler = ({
  AccountModel,
  OtpModel,
  generateOtp,
  sendOtpEmail,
  logger,
}) => {
  return async (req, res) => {
    try {
      logger.info({ identifier: req.body.identifier }, "Forgot Password Request");

      const { identifier } = req.body;
      const processedIdentifier = identifier.includes("@")
        ? identifier.toLowerCase()
        : identifier.replace(/\s+/g, "");

      const user = await AccountModel.findOne({
        $or: [{ email: processedIdentifier }, { phone: processedIdentifier }],
      });

      if (!user) {
        logger.info({ identifier: processedIdentifier }, "User not found");
        return res.status(400).json({ message: "User not found" });
      }

      const emailToSend = user.email;
      const otp = generateOtp();

      logger.info({ email: emailToSend }, "OTP Generated");
      await new OtpModel({ email: emailToSend, otp }).save();
      logger.info({ email: emailToSend }, "OTP saved to database");

      await sendOtpEmail(emailToSend, otp);
      logger.info({ email: emailToSend }, "OTP sent to email");

      return res.json({ message: "OTP sent for password reset", email: emailToSend });
    } catch (error) {
      logger.error({ error: error.message }, "Forgot Password Error");
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
};

const createResetPasswordHandler = ({
  AccountModel,
  hashPassword,
  logger,
  invalidEmailMessage = "Invalid email format",
}) => {
  return async (req, res) => {
    try {
      logger.info({ email: req.body.email }, "Reset Password Request");

      const { email, password } = req.body;
      if (typeof email !== "string") {
        logger.info({ email }, "Invalid email format in reset password");
        return res.status(400).json({ message: invalidEmailMessage });
      }

      const hashedPassword = await hashPassword(password);
      logger.info("Password hashed successfully");

      await AccountModel.findOneAndUpdate({ email: { $eq: email } }, { password: hashedPassword });
      logger.info({ email }, "Password updated");

      return res.json({ message: "Password updated successfully" });
    } catch (error) {
      logger.error({ error: error.message }, "Reset Password Error");
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
};

module.exports = {
  createForgotPasswordHandler,
  createResetPasswordHandler,
};
