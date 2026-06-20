const Account = require("../../models/account/Vendor");
const Uni = require("../../models/account/Uni");
const User = require("../../models/account/User");
const mongoose = require("mongoose");
const Otp = require("../../models/users/Otp");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const sendOtpEmail = require("../../utils/sendOtp");
const { updateUserActivity, hashPassword } = require("../../utils/authUtils");
const { populateVendorWithUniversityItems } = require("../../utils/vendorUtils");
const logger = require("../../utils/pinoLogger");
const { getCookieOptions, clearCookie } = require("../../middleware/cookieConfig");
const { createVerifyTokenHandler, createRefreshTokenHandler, checkSessionHandler } = require("./shared/authSessionHandlers");
const { createGoogleAuthHandler, createGoogleSignupHandler } = require("./shared/googleAuthHandlers");
const { createAccountResendOtpHandler, createVerifyOtpHandler } = require("./shared/otpHandlers");
const { generateOtp } = require("./shared/otpGenerator");
const { processIdentifier, handleUnverifiedLogin } = require("./shared/authLoginHelpers");
const { createRoleSignupHandler, createRoleLoginHandler } = require("./shared/authFlowHandlers");


// Cookie Token Set
const setTokenCookie = (res, token) => {
  res.cookie("vendorToken", token, getCookieOptions());
};

// **1. User Signup**
exports.signup = createRoleSignupHandler({
  AccountModel: Account,
  OtpModel: Otp,
  logger,
  hashPassword,
  jwt,
  jwtSecret: process.env.JWT_SECRET,
  generateOtp,
  sendOtpEmail,
  getSignupData: (req) => {
    const { fullName, email, phone, password, location, uniID, sellerType } = req.body;
    return { fullName, email, phone, password, location, uniID, sellerType };
  },
  validateSignup: (signupData) => {
    if (typeof signupData.uniID !== "string" || !mongoose.Types.ObjectId.isValid(signupData.uniID)) {
      return "Invalid university ID.";
    }
    return null;
  },
  duplicateQuery: (signupData, emailLower) => ({ $or: [{ email: emailLower }, { phone: signupData.phone }] }),
  buildAccountData: (signupData, emailLower, hashedPassword) => ({
    fullName: signupData.fullName,
    email: emailLower,
    phone: signupData.phone,
    password: hashedPassword,
    location: signupData.location,
    uniID: signupData.uniID,
    sellerType: signupData.sellerType,
    isVerified: false,
  }),
  afterAccountCreated: async (newAccount, signupData) => {
    await populateVendorWithUniversityItems(newAccount, signupData.uniID);
    await Uni.findByIdAndUpdate(new mongoose.Types.ObjectId(signupData.uniID), {
      $push: { vendors: { vendorId: newAccount._id, isAvailable: "Y" } },
    });
  },
  tokenPayload: (newAccount) => ({ userId: newAccount._id, role: "vendor" }),
  successRole: (newAccount) => newAccount.type,
});

// **2. OTP Verification**
exports.verifyOtp = createVerifyOtpHandler({
  AccountModel: Account,
  OtpModel: Otp,
  jwt,
  jwtSecret: process.env.JWT_SECRET,
  logger,
  setTokenCookie,
  activityRole: "vendor",
  updateUserActivity,
  normalizeEmail: (email) => String(email || "").toLowerCase().trim(),
  validateInput: ({ email, otp }) => {
    if (!email || !otp) return "Email and OTP are required";
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return "Invalid email format";
    const otpRegex = /^\d{6}$/;
    if (!otpRegex.test(otp)) return "Invalid OTP format";
    return null;
  },
  buildOtpQuery: (email, otp) => ({ email, otp: { $eq: otp } }),
  buildSuccessUser: (user) => ({
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    isVerified: user.isVerified,
    uniID: user.uniID,
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
  unverifiedRedirect: (user) => `/otpverification?email=${user.email}&from=login&role=vendor`,
  includeEmailInUnverified: true,
  clearExistingOtps: true,
  checkAccess: async (user, req) => {
    // Assert tenant link locking
    const userTenantId = String(user.tenantId || user.uniID);
    const activeTenantId = String(req.tenantId);
    if (userTenantId !== activeTenantId) {
      return {
        status: 403,
        message: "Access Denied: Your account is not registered under this university/tenant link."
      };
    }

    if (!user.uniID) return null;
    const university = await Uni.findById(user.uniID).select("isAvailable fullName");
    if (!university) {
      return { status: 400, message: "University not found. Please contact support." };
    }
    if (university.isAvailable !== "Y") {
      return {
        status: 403,
        message: `Access denied. ${university.fullName} is currently unavailable. Please contact support for assistance.`,
      };
    }
    return null;
  },
  tokenPayload: (user) => ({ userId: user._id, role: "vendor" }),
  updateUserActivity,
  activityRole: "vendor",
  setTokenCookie,
  buildSuccessUser: (user) => ({
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    isVerified: user.isVerified,
    uniID: user.uniID,
  }),
});

// **4. Forgot Password**
exports.forgotPassword = async (req, res) => {
  try {
    logger.info({ identifier: req.body.identifier }, "Forgot Password Request");

    const { identifier } = req.body;

    // Input validation
    if (!identifier) {
      return res.status(400).json({ message: "Email or phone number is required" });
    }

    // Sanitize and validate identifier
    let processedIdentifier;
    let isValidEmail = false;

    if (identifier.includes('@')) {
      // Email validation
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      processedIdentifier = identifier.toLowerCase().trim();
      if (!emailRegex.test(processedIdentifier)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      isValidEmail = true;
    } else {
      // Phone number validation (basic format check)
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      processedIdentifier = identifier.replace(/\s+/g, '').trim();
      if (!phoneRegex.test(processedIdentifier) || processedIdentifier.length < 10) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }
    }

    // Find user by email OR phone number using sanitized input
    const user = await Account.findOne({
      $or: [{ email: processedIdentifier }, { phone: processedIdentifier }],
    });

    if (!user) {
      logger.info({ identifier: processedIdentifier }, "User not found");
      return res.status(400).json({ message: "User not found" });
    }

    const emailToSend = user.email; // Use the user's email to send OTP

    const otp = generateOtp();
    logger.info({ email: emailToSend }, "OTP Generated");

    await new Otp({ email: emailToSend, otp }).save();
    logger.info({ email: emailToSend }, "OTP saved to database");

    await sendOtpEmail(emailToSend, otp);
    logger.info({ email: emailToSend }, "OTP sent to email");

    res.json({ message: "OTP sent for password reset", email: emailToSend });
  } catch (error) {
    logger.error({ error: error.message }, "Forgot Password Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **5. Reset Password**
exports.resetPassword = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "Reset Password Request");

    const { email, password } = req.body;

    // Input validation and sanitization
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Sanitize email: convert to lowercase and validate format
    const sanitizedEmail = email.toLowerCase().trim();

    // Validate email format using regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const hashedPassword = await hashPassword(password);
    logger.info("Password hashed successfully");

    // Use sanitized email in query to prevent injection
    const result = await Account.findOneAndUpdate(
      { email: sanitizedEmail },
      { password: hashedPassword },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ message: "User not found" });
    }

    logger.info({ email: sanitizedEmail }, "Password updated");

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error({ error: error.message }, "Reset Password Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **6. Google Login**
exports.googleAuth = createGoogleAuthHandler({
  AccountModel: Account,
  logger,
  logPrefix: "vendor:",
});

// **7. Google Signup**
exports.googleSignup = createGoogleSignupHandler({
  AccountModel: Account,
  logger,
  logPrefix: "vendor:",
  buildNewUserData: ({ email, fullName }) => ({
    fullName,
    email,
    phone: "",
    password: "",
    sellerType: "NON_SELLER",
    isVerified: true,
  }),
});

// **8. Logout**
exports.logout = (req, res) => {
  logger.info({ userId: req.user?.userId || "Unknown User" }, "User Logged Out");
  clearCookie(res, "vendorToken");
  clearCookie(res, "token");
  res.json({ message: "Logged out successfully" });
};

// ** 9. Middleware: Verify JWT Token**
exports.verifyToken = createVerifyTokenHandler({
  userType: "vendor",
  tokenResolver: (req) => req.headers.authorization?.split(" ")[1] || req.cookies?.token || req.query?.token,
  attachFullUserAs: "fullVendor",
  logger,
  logPrefix: "vendor:verifyToken",
  invalidTokenStatus: 401,
  notFoundMessage: "Vendor not found or account inactive.",
});

// **10. Refresh Token Endpoint**
exports.refreshToken = createRefreshTokenHandler({
  tokenResolver: (req) => req.cookies?.token || req.headers.authorization?.split(" ")[1],
  cookieName: "vendorToken",
});

// **11. Check if Session is Active**
exports.checkSession = checkSessionHandler;

// **12. Get User**
exports.getUser = async (req, res) => {
  try {
    // If verifyToken middleware succeeded, we already have the user or at least the decoded payload
    const userId = req.user?.userId || req.user?._id;
    const user = req.fullVendor || await Account.findById(userId).select("-password -__v");

    if (!user) {
      logger.warn({ userId }, "vendor:getUser: User not found in database");
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    logger.error({ error: error.message }, "Vendor: Get User Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};
