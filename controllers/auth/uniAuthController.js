const Account = require("../../models/account/Uni");
const User = require("../../models/account/User");
const Tenant = require("../../models/account/Tenant");
const SubAdmin = require("../../models/account/SubAdmin");
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
const { handleUnverifiedLogin } = require("./shared/authLoginHelpers");
// const { createRoleLoginHandler } = require("./shared/authFlowHandlers");

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

    // Create a matching Tenant document synchronously
    const slug = fullName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    await Tenant.create({
      _id: newAccount._id, // Keep the same ID for referential integrity
      name: fullName,
      slug,
      status: "active",
      branding: {
        logo: "",
        favicon: "",
        primaryColor: "#01796f",
        secondaryColor: "#4ea199",
        font: "Poppins"
      },
      enabledModules: ["food", "hostel", "auditorium"],
      email: emailLower,
      phone,
      password: newAccount.password, // hashed password
      isVerified: false,
      gstNumber,
      packingCharge: 5,
      deliveryCharge: 50,
      platformFee: 2,
      categoryImages: []
    });
    logger.info({ email: emailLower, slug }, "Tenant metadata document created");

    const token = jwt.sign(
      { userId: newAccount._id, tenantId: newAccount._id, role: "university" },
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
exports.login = async (req, res) => {
  try {
    logger.info({ identifier: req.body.identifier }, "Login Request (Unified)");
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ message: "Identifier and password are required." });
    }

    const host = req.headers.host || "";
    const referer = req.headers.referer || "";
    const isAdminPortal = host.includes("admin.localhost") || 
                          host.includes("admin.kampyn.com") || 
                          referer.includes("admin.localhost") || 
                          referer.includes("admin.kampyn.com");

    if (isAdminPortal) {
      return res.status(403).json({
        message: "Access Denied: Tenant administrators cannot log in on the admin portal."
      });
    }

    const processedIdentifier = identifier.toLowerCase().trim();

    // 1. Search in Uni (primary admin)
    let user = await Account.findOne({
      $or: [{ email: processedIdentifier }, { phone: processedIdentifier }]
    });
    let role = "university";

    // 2. Search in SubAdmin (secondary admin)
    if (!user) {
      user = await SubAdmin.findOne({
        $or: [{ email: processedIdentifier }, { phone: processedIdentifier }]
      });
      role = "university-sub";
    }

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (!user.isVerified) {
      if (role === "university") {
        const unverifiedResponse = await handleUnverifiedLogin({
          user,
          OtpModel: Otp,
          generateOtp,
          sendOtpEmail,
          redirectTo: `/otpverification?email=${user.email}&from=login&role=uni`,
          includeEmail: false,
          clearExistingOtps: false
        });
        return res.status(400).json(unverifiedResponse);
      } else {
        return res.status(400).json({ message: "Account is not verified. Please contact your primary university administrator." });
      }
    }

    const isMatch = await argon2.verify(user.password, password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check access restrictions (tenant link locking)
    const userTenantId = role === "university-sub"
      ? String(user.tenantId || user.uniID)
      : String(user._id);
    const activeTenantId = req.tenantId ? String(req.tenantId) : null;
    const isCentralPortal = host.includes("tenant-studio.") || 
                            referer.includes("tenant-studio.");

    if (activeTenantId && !isCentralPortal && userTenantId !== activeTenantId) {
      return res.status(403).json({
        message: "Access Denied: Your admin account is not registered under this university/tenant link."
      });
    }

    if (user.isAvailable === "N") {
      return res.status(403).json({
        message: `Access denied. ${user.fullName} is currently unavailable. Please contact support.`,
      });
    }

    const userTenant = await Tenant.findById(userTenantId).lean();
    const tenantSlug = userTenant ? userTenant.slug : null;

    // Sign the token
    const token = jwt.sign(
      { 
        userId: user._id, 
        tenantId: user.tenantId || user.uniID || user._id, 
        role: "university"
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await updateUserActivity(user._id, "uni");
    setTokenCookie(res, token);

    return res.json({
      success: true,
      message: "Login successful",
      token,
      role: "university",
      tenantSlug,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, "Login Error");
    return res.status(500).json({ message: "Internal Server Error" });
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

/**
 * Creates secondary university admin account for people who will use tenant-studio
 */
exports.signupSubAdmin = async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;
    const tenantId = req.uni?._id || req.tenantId;
    const uniID = req.uni?._id || req.tenantId;

    if (!tenantId) {
      return res.status(400).json({ message: "Tenant context is required to register a sub-administrator." });
    }

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ message: "Missing required fields: fullName, email, phone, and password are required." });
    }

    // Check if email already exists in User or SubAdmin collection
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { phone }
      ]
    });
    const existingSubAdmin = await SubAdmin.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { phone }
      ]
    });
    if (existingUser || existingSubAdmin) {
      return res.status(400).json({ message: "An account already exists with this email or phone number." });
    }

    const hashedPassword = await hashPassword(password);
    const newSubAdmin = new SubAdmin({
      fullName,
      email: email.toLowerCase().trim(),
      phone,
      password: hashedPassword,
      uniID,
      tenantId,
      isVerified: true // Auto-verified since it is added by the primary admin
    });

    await newSubAdmin.save();

    res.status(201).json({
      success: true,
      message: "Sub-administrator account registered successfully.",
      data: {
        _id: newSubAdmin._id,
        fullName: newSubAdmin.fullName,
        email: newSubAdmin.email,
        phone: newSubAdmin.phone
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, "Sub-admin signup error");
    res.status(500).json({ message: "Failed to register sub-administrator.", error: error.message });
  }
};

/**
 * Fetch all secondary university sub-administrators (tenant studio IDs)
 */
exports.getSubAdmins = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    if (!uniId) {
      return res.status(401).json({ success: false, message: "Unauthorized. University context missing." });
    }

    const subAdmins = await SubAdmin.find({
      $or: [{ uniID: uniId }, { tenantId: uniId }]
    }).select("-password -__v");

    res.json({
      success: true,
      data: subAdmins
    });
  } catch (error) {
    logger.error({ error: error.message }, "Get Sub Admins Error");
    res.status(500).json({ success: false, message: "Failed to retrieve sub-administrators." });
  }
};

/**
 * Delete a secondary university sub-administrator
 */
exports.deleteSubAdmin = async (req, res) => {
  try {
    const uniId = req.uni?._id;
    const { id } = req.params;

    if (!uniId) {
      return res.status(401).json({ success: false, message: "Unauthorized. University context missing." });
    }

    const subAdmin = await SubAdmin.findOne({
      _id: id,
      $or: [{ uniID: uniId }, { tenantId: uniId }]
    });

    if (!subAdmin) {
      return res.status(404).json({ success: false, message: "Sub-administrator account not found or access denied." });
    }

    await SubAdmin.findByIdAndDelete(id);

    logger.info({ subAdminId: id, uniId }, "Sub-administrator deleted successfully");
    res.json({
      success: true,
      message: "Sub-administrator account deleted successfully."
    });
  } catch (error) {
    logger.error({ error: error.message }, "Delete Sub Admin Error");
    res.status(500).json({ success: false, message: "Failed to delete sub-administrator account." });
  }
};

