const Account = require("../../models/account/User");
const Otp = require("../../models/users/Otp");
const Uni = require("../../models/account/Uni");
const Vendor = require("../../models/account/Vendor");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const sendOtpEmail = require("../../utils/sendOtp");
const { updateUserActivity, hashPassword } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");
const { getCookieOptions, clearCookie } = require("../../middleware/cookieConfig");
const { createVerifyTokenHandler, createRefreshTokenHandler, checkSessionHandler } = require("./shared/authSessionHandlers");
const { createGoogleAuthHandler, createGoogleSignupHandler } = require("./shared/googleAuthHandlers");
const { createForgotPasswordHandler, createResetPasswordHandler } = require("./shared/passwordRecoveryHandlers");
const { createResendOtpHandler } = require("./shared/otpHandlers");
const { generateOtp } = require("./shared/otpGenerator");
const { processIdentifier } = require("./shared/authLoginHelpers");


// Cookie Token Set
const setTokenCookie = (res, token) => {
  res.cookie("token", token, getCookieOptions());
};

// **1. User Signup**exports.signup = async (req, res) => {
exports.signup = async (req, res) => {
  try {
    // Log the event without sensitive data
    if (process.env.NODE_ENV === 'development') {
      logger.info({ email: req.body.email }, "Signup Request Received");
    }

    const { fullName, email, phone, password, gender, uniID } =
      req.body;

    // Convert email to lowercase
    const emailLower = email.toLowerCase();

    // Parallelize user existence check and password hashing for better performance
    const [existingUser, hashedPassword] = await Promise.all([
      Account.findOne({ $or: [{ email: emailLower }, { phone }] }).lean().select('_id'),
      hashPassword(password)
    ]);

    if (existingUser) {
      if (process.env.NODE_ENV === 'development') {
        logger.info({ email: emailLower }, "User already exists");
      }
      return res.status(400).json({ message: "User already exists" });
    }

    // Check if there's already a pending OTP for this email (prevent multiple signup attempts)
    const existingOtp = await Otp.findOne({ email: emailLower });
    if (existingOtp) {
      // Delete old OTP if exists
      await Otp.deleteOne({ email: emailLower });
    }

    // Generate OTP
    const otp = generateOtp();

    // Store user data temporarily in OTP record (NOT in user account yet)
    // This prevents DDoS attacks by not creating accounts until OTP is verified
    const otpData = {
      email: emailLower,
      otp,
      userData: {
        fullName,
        phone,
        password: hashedPassword,
        gender,
        uniID
      },
      createdAt: new Date()
    };

    // Save OTP with user data and send email
    await Promise.all([
      new Otp(otpData).save(),
      sendOtpEmail(emailLower, otp)
    ]);
    logger.info({ email: emailLower }, "OTP sent successfully during signup");

    // Return response without creating user account
    // User account will be created only after OTP verification
    return res.status(201).json({
      message: "OTP sent for verification. Please verify your email to complete signup.",
    });
  } catch (error) {
    logger.error({ error: error.message }, "Signup Error");
    return res
      .status(500)
      .json({ message: "Signup failed.", error: error.message });
  }
};

// **2. OTP Verification**
exports.verifyOtp = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "OTP Verification Request");

    const { email, otp } = req.body;
    const emailLower = email.toLowerCase();
    const otpRecord = await Otp.findOne({ email: { $eq: emailLower }, otp: { $eq: otp } });

    if (!otpRecord) {
      logger.info({ otp }, "Invalid or expired OTP");
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    let user;
    let shouldIssueToken = true;

    // Check if this is a signup OTP (has userData) or a login/forgot password OTP
    if (otpRecord.userData && otpRecord.userData.fullName) {
      // This is a signup OTP - create user account now
      // Double-check user doesn't already exist (race condition protection)
      const existingUser = await Account.findOne({
        $or: [{ email: emailLower }, { phone: otpRecord.userData.phone }]
      }).lean().select('_id');

      if (existingUser) {
        // User already exists, delete OTP and return error
        await Otp.deleteOne({ email: { $eq: emailLower } });
        return res.status(400).json({ message: "User already exists. Please log in." });
      }

      // Create user account with verified status
      const accountData = {
        fullName: otpRecord.userData.fullName,
        email: emailLower,
        phone: otpRecord.userData.phone,
        password: otpRecord.userData.password,
        gender: otpRecord.userData.gender,
        uniID: otpRecord.userData.uniID,
        isVerified: true, // Set as verified since OTP is verified
      };

      user = new Account(accountData);
      await user.save();
      logger.info({ email: emailLower }, "User account created and verified");
    } else {
      // This is a login/forgot password OTP - determine user status
      user = await Account.findOne({ email: { $eq: emailLower } });

      if (!user) {
        await Otp.deleteOne({ email: { $eq: emailLower } });
        return res.status(400).json({ message: "User not found" });
      }

      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
        logger.info({ email: emailLower }, "User verified via OTP (login flow)");
      } else {
        // Already verified → treat as password reset verification, do not issue session token
        shouldIssueToken = false;
        logger.info({ email: emailLower }, "OTP verified for password reset");
      }
    }

    // Delete the used OTP
    await Otp.deleteOne({ email: { $eq: emailLower } });
    logger.info({ email: emailLower }, "OTP deleted from database");

    if (!shouldIssueToken) {
      return res.status(200).json({
        message: "OTP verified. You can now reset your password.",
        requiresLogin: true,
      });
    }

    // Generate token for the verified user
    const token = jwt.sign({ userId: user._id, tenantId: user.tenantId || user.uniID }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Reset inactivity timer so immediate user fetches don't fail
    await updateUserActivity(user._id, 'user');

    setTokenCookie(res, token);

    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        isVerified: user.isVerified,
        uniID: user.uniID
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, "OTP Verification Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **2a. Resend OTP**
exports.resendOtp = createResendOtpHandler({
  OtpModel: Otp,
  generateOtp,
  sendOtpEmail,
  logger,
  noOwnerMessage: "Session expired. Please restart the login or signup process.",
  resolveEmailOwner: async (emailLower) => {
    const [user, uni, vendor] = await Promise.all([
      Account.findOne({ email: { $eq: emailLower } }).lean().select("_id"),
      Uni.findOne({ email: { $eq: emailLower } }).lean().select("_id"),
      Vendor.findOne({ email: { $eq: emailLower } }).lean().select("_id"),
    ]);
    return Boolean(user || uni || vendor);
  },
});

// **3. Login**
exports.login = async (req, res) => {
  try {
    // Reduce logging overhead - only log in development
    if (process.env.NODE_ENV === 'development') {
      logger.info({ identifier: req.body.identifier }, "Login Request");
    }

    const { identifier, password } = req.body;

    // Process identifier based on type
    const processedIdentifier = processIdentifier(identifier);

    // Use .lean() for faster queries (returns plain JS object instead of Mongoose document)
    // Only select needed fields to reduce data transfer
    const user = await Account.findOne({
      $or: [{ email: processedIdentifier }, { phone: processedIdentifier }],
    })
      .lean()
      .select('_id password isVerified uniID email fullName phone gender');

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (!user.isVerified) {
      // Generate new OTP
      const otp = generateOtp();
      // Fire and forget - don't wait for OTP save and email send
      Promise.all([
        Otp.collection.insertOne({ email: user.email, otp, createdAt: new Date() }),
        sendOtpEmail(user.email, otp)
      ]).catch((error) => {
        logger.error({ error: error.message, email: user.email }, "Failed to save OTP or send email");
      });

      // Redirect user to OTP verification
      return res.status(400).json({
        message: "User not verified. OTP sent to email.",
        redirectTo: `/otpverification?email=${user.email}&from=login&role=user`,
      });
    }

    // Parallelize password verification and university check (if needed)
    const [isMatch, university] = await Promise.all([
      argon2.verify(user.password, password),
      user.uniID ? Uni.findById(user.uniID).lean().select('isAvailable fullName') : null
    ]);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if the university is available
    if (university) {
      if (!university.isAvailable || university.isAvailable !== 'Y') {
        return res.status(403).json({
          message: `Access denied. ${university.fullName || 'University'} is currently unavailable. Please contact support for assistance.`
        });
      }
    }

    const token = jwt.sign({ userId: user._id, tenantId: user.tenantId || user.uniID }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update last activity on login (fire and forget - don't block response)
    updateUserActivity(user._id, 'user').catch((error) => {
      logger.error({ error: error.message, userId: user._id }, "Failed to update user activity");
    });

    setTokenCookie(res, token);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        isVerified: user.isVerified,
        uniID: user.uniID
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, "Login Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

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
  invalidEmailMessage: "Invalid email address",
});

// **6. Google Login**
exports.googleAuth = createGoogleAuthHandler({
  AccountModel: Account,
  logger,
  logPrefix: "user:",
  buildSuccessResponse: (user, token) => ({
    success: true,
    message: "Google login successful",
    token,
    user: {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      isVerified: user.isVerified,
      uniID: user.uniID,
    },
  }),
});

// **7. Google Signup**
exports.googleSignup = createGoogleSignupHandler({
  AccountModel: Account,
  logger,
  logPrefix: "user:",
  buildNewUserData: ({ email, googleId, fullName }) => ({
    fullName,
    email,
    phone: "",
    password: "",
    gender: "",
    googleId,
    isVerified: true,
  }),
  buildSuccessResponse: (newUser, token) => ({
    success: true,
    message: "Google signup successful",
    token,
    user: {
      _id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      phone: newUser.phone,
      gender: newUser.gender,
      isVerified: newUser.isVerified,
      uniID: newUser.uniID,
    },
  }),
});

// **8. Logout**
exports.logout = (req, res) => {
  logger.info({ userId: req.user?.userId || "Unknown User" }, "User Logged Out");
  clearCookie(res, "token");
  res.json({ message: "Logged out successfully" });
};

// ** 9. Middleware: Verify JWT Token**
exports.verifyToken = createVerifyTokenHandler({
  userType: "user",
  tokenResolver: (req) => req.headers.authorization?.split(" ")[1] || req.cookies?.token,
  attachFullUserAs: "fullUser",
  logger,
  logPrefix: "verifyToken",
  notFoundMessage: "User not found or account inactive.",
});

// **10. Refresh Token Endpoint**
exports.refreshToken = createRefreshTokenHandler({
  tokenResolver: (req) => req.cookies?.token || req.headers.authorization?.split(" ")[1],
  cookieName: "token",
});

// **11. Check if Session is Active**
exports.checkSession = checkSessionHandler;

// **12. Get User**
exports.getUser = async (req, res) => {
  try {
    // If verifyToken middleware succeeded, we already have the user or at least the decoded payload
    const user = req.fullUser || await Account.findById(req.user.userId).select("-password -__v");

    if (!user) {
      logger.warn({ userId: req.user?.userId }, "getUser: User not found in database");
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    logger.error({ error: error.message }, "Get User Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getColleges = async (req, res) => {
  try {
    // Fetch only _id, fullName, and category images of available colleges
    const colleges = await Uni.find({ isAvailable: 'Y' }, '_id fullName retailImage produceImage categoryImages');

    res.status(200).json(colleges);
  } catch (error) {
    logger.error({ error: error.message }, "Error fetching colleges");
    res.status(500).json({ message: "Error fetching colleges" });
  }
};
