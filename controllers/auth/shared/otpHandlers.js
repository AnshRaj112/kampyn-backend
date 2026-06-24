const createResendOtpHandler = ({
  OtpModel,
  generateOtp,
  sendOtpEmail,
  logger,
  resolveEmailOwner,
  missingEmailMessage = "Valid email is required",
  noOwnerMessage = "Session expired or no OTP request found. Please restart the process.",
}) => {
  return async (req, res) => {
    try {
      const { email } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: missingEmailMessage });
      }

      const emailLower = email.toLowerCase().trim();
      let otpRecord = await OtpModel.findOne({ email: { $eq: emailLower } });

      if (!otpRecord) {
        const canResend = await resolveEmailOwner(emailLower);

        if (canResend) {
          const otp = generateOtp();
          await new OtpModel({ email: emailLower, otp, createdAt: new Date() }).save();
          await sendOtpEmail(emailLower, otp);
          return res.json({ message: "OTP resent successfully" });
        }

        return res.status(404).json({ message: noOwnerMessage });
      }

      const otp = generateOtp();
      otpRecord.otp = otp;
      otpRecord.createdAt = new Date();
      await otpRecord.save();

      await sendOtpEmail(emailLower, otp);

      return res.json({ message: "OTP resent successfully" });
    } catch (error) {
      logger.error({ error: error.message }, "Resend OTP Error");
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
};

const createAccountResendOtpHandler = ({
  AccountModel,
  OtpModel,
  generateOtp,
  sendOtpEmail,
  logger,
  noOwnerMessage,
}) =>
  createResendOtpHandler({
    OtpModel,
    generateOtp,
    sendOtpEmail,
    logger,
    noOwnerMessage,
    resolveEmailOwner: async (emailLower) => {
      const account = await AccountModel.findOne({ email: { $eq: emailLower } }).lean().select("_id");
      return Boolean(account);
    },
  });

const createVerifyOtpHandler = ({
  AccountModel,
  OtpModel,
  jwt,
  jwtSecret,
  logger,
  setTokenCookie,
  activityRole,
  updateUserActivity,
  normalizeEmail = (email) => email,
  validateInput,
  buildOtpQuery = (email, otp) => ({ email: { $eq: email }, otp: { $eq: otp } }),
  buildUserQuery = (email) => ({ email: { $eq: email } }),
  buildSuccessUser,
}) => {
  return async (req, res) => {
    try {
      logger.info({ email: req.body.email }, "OTP Verification Request");

      const { email, otp } = req.body;
      const normalizedEmail = normalizeEmail(email);

      if (validateInput) {
        const validationError = validateInput({ email: normalizedEmail, otp });
        if (validationError) {
          return res.status(400).json({ message: validationError });
        }
      }

      const otpRecord = await OtpModel.findOne(buildOtpQuery(normalizedEmail, otp));
      if (!otpRecord) {
        logger.info({ otp }, "Invalid or expired OTP");
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      const user = await AccountModel.findOneAndUpdate(
        buildUserQuery(normalizedEmail),
        { isVerified: true },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      logger.info({ email: normalizedEmail }, "User verified");

      // Synchronize verified status to Tenant if Tenant model is available and matches
      let tenantSlug = null;
      try {
        const mongoose = require("mongoose");
        const Tenant = mongoose.models.Tenant || require("../../../models/account/Tenant");
        if (Tenant) {
          const tenant = await Tenant.findByIdAndUpdate(user._id, { $set: { isVerified: true } }).lean();
          if (tenant) {
            tenantSlug = tenant.slug;
          } else {
            const tId = user.tenantId || user.uniID;
            if (tId) {
              const subTenant = await Tenant.findById(tId).lean();
              if (subTenant) {
                tenantSlug = subTenant.slug;
              }
            }
          }
          logger.info({ tenantId: user._id }, "Synchronized verified status to Tenant record");
        }
      } catch (err) {
        logger.warn({ error: err.message }, "Tenant verification status synchronization skipped/failed");
      }

      await OtpModel.deleteOne({ email: { $eq: normalizedEmail } });
      logger.info({ email: normalizedEmail }, "OTP deleted from database");

      const token = jwt.sign({ userId: user._id, tenantId: user.tenantId || user.uniID }, jwtSecret, { expiresIn: "7d" });
      await updateUserActivity(user._id, activityRole);
      setTokenCookie(res, token);

      return res.status(200).json({
        success: true,
        message: "OTP verified successfully",
        token,
        tenantSlug,
        user: buildSuccessUser(user),
      });
    } catch (error) {
      logger.error({ error: error.message }, "OTP Verification Error");
      return res.status(500).json({ message: "Internal Server Error" });
    }
  };
};

module.exports = {
  createResendOtpHandler,
  createAccountResendOtpHandler,
  createVerifyOtpHandler,
};
