const Account = require("../../models/account/Uni");
const User = require("../../models/account/User");
const Otp = require("../../models/users/Otp");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const sendOtpEmail = require("../../utils/sendOtp");
const { updateUserActivity, hashPassword } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");
const { getCookieOptions, clearCookie } = require("../../middleware/cookieConfig");
const { createVerifyTokenHandler, createRefreshTokenHandler, checkSessionHandler } = require("./shared/authSessionHandlers");
const { createGoogleAuthHandler, createGoogleSignupHandler } = require("./shared/googleAuthHandlers");
const { createForgotPasswordHandler, createResetPasswordHandler } = require("./shared/passwordRecoveryHandlers");
const { createAccountResendOtpHandler, createVerifyOtpHandler } = require("./shared/otpHandlers");
const { generateOtp } = require("./shared/otpGenerator");
const { processIdentifier, handleUnverifiedLogin } = require("./shared/authLoginHelpers");
const { createRoleLoginHandler } = require("./shared/authFlowHandlers");

// Cookie Token Set
const setTokenCookie = (res, token) => {
  res.cookie("uniToken", token, getCookieOptions());
};

// **1. User Signup**exports.signup = async (req, res) => {
exports.signup = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "Signup Request Received");

    const { fullName, email, phone, password, gstNumber } = req.body;

    // Convert email to lowercase
    const emailLower = email.toLowerCase();

    // Validate required fields
    if (!fullName || !email || !phone || !password || !gstNumber) {
      return res.status(400).json({
        message: "Missing required fields: fullName, email, phone, password, and gstNumber are required"
      });
    }

    const existingUser = await Account.findOne({
      $or: [
        { email: emailLower },
        { phone },
        { gstNumber }
      ]
    });
    if (existingUser) {
      logger.info({ email: emailLower }, "User already exists");
      return res.status(400).json({ message: "User already exists with this email, phone, or GST number" });
    }

    const hashedPassword = await hashPassword(password);
    logger.info("Password hashed successfully");

    const accountData = {
      fullName,
      email: emailLower,
      phone,
      password: hashedPassword,
      gstNumber,
      // packingCharge and deliveryCharge will use model defaults (5 and 50)
      isVerified: false,
      isAvailable: "Y", // Default to available
    };

    const newAccount = new Account(accountData);
    await newAccount.save();
    logger.info({ email: emailLower }, "Account created");

    const token = jwt.sign(
      { userId: newAccount._id, role: "university" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Send OTP if needed
    const otp = generateOtp();
    await new Otp({ email: emailLower, otp }).save();
    logger.info({ email: emailLower }, "OTP Generated and Saved");

    await sendOtpEmail(emailLower, otp);
    logger.info({ email: emailLower }, "OTP sent to email");

    // Optional: Set cookie
    // setTokenCookie(res, token);

    return res.status(201).json({
      message: "Account created successfully. OTP sent for verification.",
      token,
      role: "university",
      id: newAccount._id,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Signup Error");
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Duplicate entry. Email, phone, or GST number already exists."
      });
    }
    return res
      .status(500)
      .json({ message: "Signup failed.", error: error.message });
  }
};

// **2. OTP Verification**
exports.verifyOtp = createVerifyOtpHandler({
  AccountModel: Account,
  OtpModel: Otp,
  jwt,
  jwtSecret: process.env.JWT_SECRET,
  logger,
  setTokenCookie,
  activityRole: "uni",
  updateUserActivity,
  normalizeEmail: (email) => email,
  buildSuccessUser: (user) => ({
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    gstNumber: user.gstNumber,
    isVerified: user.isVerified,
  }),
});

// **2a. Resend OTP**
exports.resendOtp = createAccountResendOtpHandler({
  AccountModel: Account,
  OtpModel: Otp,
  generateOtp,
  sendOtpEmail,
  logger,
});
exports.login = createRoleLoginHandler({
  AccountModel: Account,
  OtpModel: Otp,
  logger,
  argon2,
  jwt,
  jwtSecret: process.env.JWT_SECRET,
  processIdentifier,
  handleUnverifiedLogin,
  generateOtp,
  sendOtpEmail,
  unverifiedRedirect: (user) => `/otpverification?email=${user.email}&from=login&role=uni`,
  checkAccess: async (user) => {
    if (user.isAvailable !== "Y") {
      return {
        status: 403,
        message: `Access denied. ${user.fullName} is currently unavailable. Please contact support for assistance.`,
      };
    }
    return null;
  },
  updateUserActivity,
  activityRole: "uni",
  setTokenCookie,
  buildSuccessUser: (user) => ({
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    gstNumber: user.gstNumber,
    isVerified: user.isVerified,
  }),
});

// **4. Forgot Password**
exports.forgotPassword = createForgotPasswordHandler({
  AccountModel: Account,
  OtpModel: Otp,
  generateOtp,
  sendOtpEmail,
  logger,
});

// **5. Reset Password**
exports.resetPassword = createResetPasswordHandler({
  AccountModel: Account,
  hashPassword,
  logger,
  invalidEmailMessage: "Invalid email format",
});

// **6. Google Login**
exports.googleAuth = createGoogleAuthHandler({
  AccountModel: User,
  logger,
  logPrefix: "uni:",
});

// **7. Google Signup**
exports.googleSignup = createGoogleSignupHandler({
  AccountModel: User,
  logger,
  logPrefix: "uni:",
  buildNewUserData: ({ email, googleId, fullName }) => ({
    fullName,
    email,
    phone: "",
    password: "",
    gender: "",
    googleId,
    isVerified: true,
  }),
});

// **8. Logout**
exports.logout = (req, res) => {
  logger.info({ userId: req.user?.userId || "Unknown User" }, "User Logged Out");
  clearCookie(res, "uniToken");
  clearCookie(res, "token");
  res.json({ message: "Logged out successfully" });
};

// ** 9. Middleware: Verify JWT Token**
exports.verifyToken = createVerifyTokenHandler({
  userType: "uni",
  tokenResolver: (req) => req.headers.authorization?.split(" ")[1] || req.cookies?.token,
  attachFullUserAs: "fullUni",
  logger,
  logPrefix: "uni:verifyToken",
  notFoundMessage: "University not found or account inactive.",
});

// **10. Refresh Token Endpoint**
exports.refreshToken = createRefreshTokenHandler({
  tokenResolver: (req) => req.cookies?.token || req.headers.authorization?.split(" ")[1],
  cookieName: "uniToken",
});

// **11. Check if Session is Active**
exports.checkSession = checkSessionHandler;

// **12. Get User**
exports.getUser = async (req, res) => {
  try {
    // If verifyToken middleware succeeded, we already have the user or at least the decoded payload
    const userId = req.user?.userId || req.user?._id;
    const user = req.fullUni || await Account.findById(userId)
      .select("-password -__v")
      .populate({
        path: 'vendors.vendorId',
        select: 'fullName email phone location'
      });

    if (!user) {
      logger.warn({ userId }, "uni:getUser: User not found in database");
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    logger.error({ error: error.message }, "Uni: Get User Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

