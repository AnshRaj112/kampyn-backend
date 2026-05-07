const Account = require("../../models/account/Uni");
const Otp = require("../../models/users/Otp");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const sendOtpEmail = require("../../utils/sendOtp");
const Admin = require("../../models/account/Admin");
const { updateUserActivity, hashPassword } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");
const { getCookieOptions, clearCookie } = require("../../middleware/cookieConfig");
const { createVerifyTokenHandler, checkSessionHandler } = require("./shared/authSessionHandlers");
const { createGoogleAuthHandler, createGoogleSignupHandler } = require("./shared/googleAuthHandlers");
const { createForgotPasswordHandler, createResetPasswordHandler } = require("./shared/passwordRecoveryHandlers");
const { generateOtp } = require("./shared/otpGenerator");
const { processIdentifier, handleUnverifiedLogin } = require("./shared/authLoginHelpers");
const { createRoleSignupHandler, createRoleLoginHandler } = require("./shared/authFlowHandlers");

// Cookie Token Set
const setTokenCookie = (res, token) => {
  res.cookie("adminToken", token, getCookieOptions());
};

// **1. User Signup**exports.signup = async (req, res) => {
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
    const { fullName, email, phone, password } = req.body;
    return { fullName, email, phone, password };
  },
  duplicateQuery: (signupData, emailLower) => ({ $or: [{ email: emailLower }, { phone: signupData.phone }] }),
  buildAccountData: (signupData, emailLower, hashedPassword) => ({
    fullName: signupData.fullName,
    email: emailLower,
    phone: signupData.phone,
    password: hashedPassword,
    isVerified: false,
  }),
  tokenPayload: (newAccount) => ({ userId: newAccount._id, role: newAccount.type }),
  successRole: (newAccount) => newAccount.type,
});

// **2. OTP Verification**
exports.verifyOtp = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "OTP Verification Request");

    const { email, otp } = req.body;
    const otpRecord = await Otp.findOne({ email, otp });

    if (!otpRecord) {
      logger.info({ otp }, "Invalid or expired OTP");
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update user verification status
    const user = await Account.findOneAndUpdate(
      { email },
      { isVerified: true },
      { new: true }
    );
    logger.info({ email }, "User verified");

    // Delete the used OTP
    await Otp.deleteOne({ email });
    logger.info({ email }, "OTP deleted from database");

    // Generate new token for the verified user
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    // Reset inactivity timer so immediate user fetches don't fail
    await updateUserActivity(user._id, 'admin');

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
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, "OTP Verification Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **3. Login**
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
  unverifiedRedirect: (user) => `/otpverification?email=${user.email}&from=login`,
  updateUserActivity,
  activityRole: "admin",
  setTokenCookie,
  buildSuccessUser: (user) => ({
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
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
});

// **6. Google Login**
exports.googleAuth = createGoogleAuthHandler({
  AccountModel: Account,
  logger,
  logPrefix: "admin:",
});

// **7. Google Signup**
exports.googleSignup = createGoogleSignupHandler({
  AccountModel: Account,
  logger,
  logPrefix: "admin:",
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
  clearCookie(res, "adminToken");
  clearCookie(res, "token");
  res.json({ message: "Logged out successfully" });
};

// ** 9. Middleware: Verify JWT Token**
exports.verifyToken = createVerifyTokenHandler({
  userType: "admin",
  tokenResolver: (req) => req.headers.authorization?.split(" ")[1] || req.cookies?.adminToken || req.cookies?.token,
  attachFullUserAs: "admin",
  logger,
  logPrefix: "admin:verifyToken",
  deriveUserId: (decoded) => decoded.userId || decoded.adminId,
  notFoundMessage: "Admin not found or account inactive.",
});

// **10. Check if Session is Active**
exports.checkSession = checkSessionHandler;

// **11. Get User**
exports.getUser = async (req, res) => {
  try {
    // If verifyToken middleware succeeded, we already have the user or at least the decoded payload
    const userId = req.user?.userId || req.user?.id;
    const user = req.admin || await Account.findById(userId)
      .select("-password -__v")
      .populate({
        path: 'vendors.vendorId',
        select: 'fullName email phone location'
      });

    if (!user) {
      logger.warn({ userId }, "admin:getUser: User not found in database");
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    logger.error({ error: error.message }, "Admin: Get User Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};


/**
 * POST /api/admin/auth/login
 * Admin login endpoint
 */
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Find admin by credentials
    const admin = await Admin.findByCredentials(email, password);

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: admin._id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Update last activity on login
    await updateUserActivity(admin._id, 'admin');

    // Set token in HTTP-only cookie
    res.cookie("adminToken", token, getCookieOptions());

    // Return admin profile (without sensitive data)
    const adminProfile = admin.toPublicJSON();

    res.status(200).json({
      success: true,
      message: "Admin login successful",
      data: {
        admin: adminProfile,
        token: token // Also return token for client-side storage if needed
      }
    });

  } catch (error) {
    logger.error({ error: error.message }, "Admin login error");

    if (error.message.includes("Invalid login credentials")) {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes("Account is temporarily locked")) {
      return res.status(423).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error during login"
    });
  }
};

/**
 * POST /api/admin/auth/logout
 * Admin logout endpoint
 */
exports.adminLogout = async (req, res) => {
  try {
    // Clear the admin token cookie
    clearCookie(res, "adminToken");

    res.status(200).json({
      success: true,
      message: "Admin logout successful"
    });

  } catch (error) {
    logger.error({ error: error.message }, "Admin logout error");
    res.status(500).json({
      success: false,
      message: "Internal server error during logout"
    });
  }
};

/**
 * GET /api/admin/auth/profile
 * Get admin profile
 */
exports.getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.adminId).select("-password -loginAttempts -lockUntil");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    res.status(200).json({
      success: true,
      data: admin
    });

  } catch (error) {
    logger.error({ error: error.message }, "Get admin profile error");
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

/**
 * PUT /api/admin/auth/profile
 * Update admin profile
 */
exports.updateAdminProfile = async (req, res) => {
  try {
    const { fullName, email, username } = req.body;
    const updates = {};

    // Only allow updating certain fields
    if (fullName) updates.fullName = fullName;
    if (email) updates.email = email;
    if (username) updates.username = username;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update"
      });
    }

    const admin = await Admin.findByIdAndUpdate(
      req.admin.adminId,
      updates,
      { new: true, runValidators: true }
    ).select("-password -loginAttempts -lockUntil");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: admin
    });

  } catch (error) {
    logger.error({ error: error.message }, "Update admin profile error");

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email or username already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

/**
 * PUT /api/admin/auth/change-password
 * Change admin password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long"
      });
    }

    const admin = await Admin.findById(req.admin.adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (error) {
    logger.error({ error: error.message }, "Change password error");
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

/**
 * POST /api/admin/auth/refresh-token
 * Refresh admin token
 */
exports.refreshToken = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.adminId);

    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: "Admin not found or inactive"
      });
    }

    // Generate new JWT token
    const newToken = jwt.sign(
      {
        userId: admin._id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Set new token in HTTP-only cookie
    res.cookie("adminToken", newToken, {
      ...getCookieOptions(),
      maxAge: 24 * 60 * 60 * 1000 // 24 hours override
    });

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        token: newToken
      }
    });

  } catch (error) {
    logger.error({ error: error.message }, "Refresh token error");
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

