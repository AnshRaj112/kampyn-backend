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
const { checkSessionHandler } = require("./shared/authSessionHandlers");
const { generateOtp } = require("./shared/otpGenerator");
const { handleUnverifiedLogin } = require("./shared/authLoginHelpers");

// Cookie Token Set
const setTokenCookie = (res, token) => {
  res.cookie("uniToken", token, getCookieOptions());
};

// **1. Tenant Admin Login**
exports.login = async (req, res) => {
  try {
    logger.info({ identifier: req.body.identifier }, "Tenant Studio Login Request");
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
          redirectTo: `/tenant-otp-verification?email=${user.email}&from=login`,
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
    logger.error({ error: error.message }, "Tenant Login Error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// **2. Tenant Forgot Password**
exports.forgotPassword = async (req, res) => {
  try {
    logger.info({ identifier: req.body.identifier }, "Tenant Forgot Password Request");

    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ message: "Email or phone number is required" });
    }
    const processedIdentifier = identifier.toLowerCase().trim();

    // 1. Search in Uni
    let user = await Account.findOne({
      $or: [{ email: processedIdentifier }, { phone: processedIdentifier }]
    });

    // 2. Search in SubAdmin (secondary admin)
    if (!user) {
      user = await SubAdmin.findOne({
        $or: [{ email: processedIdentifier }, { phone: processedIdentifier }]
      });
    }

    if (!user) {
      logger.info({ identifier: processedIdentifier }, "User not found");
      return res.status(400).json({ message: "User not found" });
    }

    const emailToSend = user.email;
    const otp = generateOtp();

    logger.info({ email: emailToSend }, "OTP Generated for Tenant Password Reset");
    await Otp.findOneAndUpdate(
      { email: emailToSend },
      { otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    await sendOtpEmail(emailToSend, otp);
    logger.info({ email: emailToSend }, "OTP sent to email");

    return res.json({ message: "OTP sent for password reset", email: emailToSend });
  } catch (error) {
    logger.error({ error: error.message }, "Tenant Forgot Password Error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// **3. Tenant Verify OTP**
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }
    const emailLower = email.toLowerCase().trim();

    const otpRecord = await Otp.findOne({ email: emailLower, otp });
    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Find and update verification in either Uni or User collection
    let user = await Account.findOneAndUpdate(
      { email: emailLower },
      { isVerified: true },
      { new: true }
    );
    let role = "university";

    if (!user) {
      user = await SubAdmin.findOneAndUpdate(
        { email: emailLower },
        { isVerified: true },
        { new: true }
      );
      role = "university-sub";
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Sync verification status to Tenant model if it's the primary Uni admin
    if (role === "university") {
      try {
        await Tenant.findByIdAndUpdate(user._id, { $set: { isVerified: true } });
        logger.info({ tenantId: user._id }, "Synchronized verification status to Tenant");
      } catch (err) {
        logger.warn({ error: err.message }, "Tenant verification status sync failed");
      }
    }

    await Otp.deleteOne({ email: emailLower });

    const userTenantId = role === "university-sub"
      ? (user.tenantId || user.uniID)
      : user._id;
    const userTenant = await Tenant.findById(userTenantId).lean();
    const tenantSlug = userTenant ? userTenant.slug : null;

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
      message: "OTP verified successfully",
      token,
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
    logger.error({ error: error.message }, "Tenant Verify OTP Error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// **4. Tenant Resend OTP**
exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const emailLower = email.toLowerCase().trim();

    // Check if owner exists in Uni or SubAdmin
    let userExists = await Account.findOne({ email: emailLower });
    if (!userExists) {
      userExists = await SubAdmin.findOne({ email: emailLower });
    }

    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOtp();
    await Otp.findOneAndUpdate(
      { email: emailLower },
      { otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    await sendOtpEmail(emailLower, otp);
    return res.json({ message: "OTP resent successfully" });
  } catch (error) {
    logger.error({ error: error.message }, "Tenant Resend OTP Error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// **5. Tenant Reset Password**
exports.resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const emailLower = email.toLowerCase().trim();

    const hashedPassword = await hashPassword(password);

    // Update Uni first
    let user = await Account.findOneAndUpdate(
      { email: emailLower },
      { password: hashedPassword },
      { new: true }
    );

    if (!user) {
      user = await SubAdmin.findOneAndUpdate(
        { email: emailLower },
        { password: hashedPassword },
        { new: true }
      );
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    logger.info({ email: emailLower }, "Password reset successful");
    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error({ error: error.message }, "Tenant Reset Password Error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// **6. Verify Token Middleware**
exports.verifyToken = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.split(" ")[1] || req.cookies?.uniToken || req.cookies?.token;
    if (!token) {
      return res.status(401).json({ success: false, message: "Access denied. No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

// **7. Get User profile**
exports.getUser = async (req, res) => {
  try {
    const userId = req.user.userId;
    let user = await Account.findById(userId).select("-password -__v");
    if (!user) {
      user = await SubAdmin.findById(userId).select("-password -__v");
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(user);
  } catch (error) {
    logger.error({ error: error.message }, "Tenant Get User Error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// **8. Logout**
exports.logout = (req, res) => {
  logger.info("Tenant Admin Logged Out");
  clearCookie(res, "uniToken");
  clearCookie(res, "token");
  res.json({ message: "Logged out successfully" });
};

// **9. Check Session**
exports.checkSession = checkSessionHandler;
