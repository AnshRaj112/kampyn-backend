const Account = require("../../models/account/Uni");
const Otp = require("../../models/users/Otp");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendOtpEmail = require("../../utils/sendOtp");
const Admin = require("../../models/account/Admin");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");

// Utility: Generate OTP
const generateOtp = () => crypto.randomInt(100000, 999999).toString();

// Utility: Hash Password
const hashPassword = async (password) => {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_KIB) || 24576, // KiB
    timeCost: Number(process.env.ARGON2_TIME) || 2,
    parallelism: Number(process.env.ARGON2_PAR) || 1
  });
};

// Cookie Token Set
const setTokenCookie = (res, token) => {
  res.cookie("adminToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Secure in production
    sameSite: "Strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  });
};

// **1. User Signup**exports.signup = async (req, res) => {
exports.signup = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "Signup Request Received");

    const { fullName, email, phone, password } =
      req.body;

    // Convert email to lowercase
    const emailLower = email.toLowerCase();

    const existingUser = await Account.findOne({ $or: [{ email: emailLower }, { phone }] });
    if (existingUser) {
      logger.info({ email: emailLower }, "User already exists");
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await hashPassword(password);
    logger.info("Password hashed successfully");

    const accountData = {
      fullName,
      email: emailLower,
      phone,
      password: hashedPassword,
      isVerified: false,
    };

    const newAccount = new Account(accountData);
    await newAccount.save();
    logger.info({ email: emailLower }, "Account created");

    const token = jwt.sign(
      { userId: newAccount._id, role: newAccount.type },
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
      role: newAccount.type,
      id: newAccount._id,
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
exports.login = async (req, res) => {
  try {
    logger.info({ identifier: req.body.identifier }, "Login Request");

    const { identifier, password } = req.body;

    // Process identifier based on type
    const processedIdentifier = identifier.includes('@')
      ? identifier.toLowerCase() // Convert email to lowercase
      : identifier.replace(/\s+/g, ''); // Remove spaces from phone number

    const user = await Account.findOne({
      $or: [{ email: processedIdentifier }, { phone: processedIdentifier }],
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (!user.isVerified) {
      // Generate new OTP
      const otp = generateOtp();
      await new Otp({ email: user.email, otp, createdAt: Date.now() }).save();

      // Send OTP email
      await sendOtpEmail(user.email, otp);

      // Redirect user to OTP verification
      return res.status(400).json({
        message: "User not verified. OTP sent to email.",
        redirectTo: `/otpverification?email=${user.email}&from=login`,
      });
    }

    const isMatch = await argon2.verify(user.password, password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update last activity on login
    await updateUserActivity(user._id, 'admin');

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
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, "Login Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **4. Forgot Password**
exports.forgotPassword = async (req, res) => {
  try {
    logger.info({ identifier: req.body.identifier }, "Forgot Password Request");

    const { identifier } = req.body;

    // Process identifier based on type
    const processedIdentifier = identifier.includes('@')
      ? identifier.toLowerCase() // Convert email to lowercase
      : identifier.replace(/\s+/g, ''); // Remove spaces from phone number

    // Find user by email OR phone number
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
    const hashedPassword = await hashPassword(password);
    logger.info("Password hashed successfully");

    await Account.findOneAndUpdate({ email }, { password: hashedPassword });
    logger.info({ email }, "Password updated");

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error({ error: error.message }, "Reset Password Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **6. Google Login**
exports.googleAuth = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "Google Login Request");

    const { email } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      logger.info({ email }, "User not found for Google login");
      return res
        .status(400)
        .json({ message: "User does not exist, sign up first" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    logger.info({ email }, "Google login successful");

    res.json({ message: "Google login successful", token });
  } catch (error) {
    logger.error({ error: error.message }, "Google Login Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **7. Google Signup**
exports.googleSignup = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "Google Signup Request");

    const { email, googleId, fullName } = req.body;

    let existingUser = await User.findOne({ email });

    if (existingUser) {
      logger.info({ email }, "User already exists");
      return res
        .status(400)
        .json({ message: "User already exists. Please log in." });
    }

    const newUser = new User({
      fullName,
      email,
      phone: "", // No phone number required for Google signup
      password: "", // Google users won't have a password
      gender: "", // Ask later or keep it optional
      googleId,
      isVerified: true, // No OTP needed for Google Signup
    });

    await newUser.save();
    logger.info({ email }, "Google user saved to database");

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({ message: "Google signup successful", token });
  } catch (error) {
    logger.error({ error: error.message }, "Google Signup Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **8. Logout**
exports.logout = (req, res) => {
  logger.info({ userId: req.user?.userId || "Unknown User" }, "User Logged Out");
  res.clearCookie("adminToken");
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
};

// ** 9. Middleware: Verify JWT Token**
exports.verifyToken = async (req, res, next) => {
  // Get token from cookie or Authorization header
  const token = req.headers.authorization?.split(" ")[1] || req.cookies?.adminToken || req.cookies?.token;

  if (!token) {
    logger.warn({ url: req.originalUrl, method: req.method }, "admin:verifyToken: No token provided");
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if admin should be logged out due to inactivity
    const userId = decoded.userId || decoded.adminId; // Support both for safety
    const { shouldLogout, user } = await checkUserActivity(userId, 'admin');

    if (shouldLogout) {
      const message = user ? "Session expired due to inactivity. Please log in again." : "Admin not found or account inactive.";
      logger.warn({ userId, userFound: !!user }, `admin:verifyToken: ${message}`);
      return res.status(401).json({ message });
    }

    // Update last activity
    await updateUserActivity(userId, 'admin');

    req.user = decoded;
    req.admin = user; // Attach full admin object
    next();
  } catch (error) {
    logger.error({ error: error.message, name: error.name }, "admin:verifyToken: Verification failed");
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    return res
      .status(403)
      .json({ message: "Forbidden: Invalid or expired token" });
  }
};

// **10. Refresh Token Endpoint**
exports.refreshToken = (req, res) => {
  let token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Generate a new token with a fresh 7-day expiration
    const newToken = jwt.sign(
      { userId: decoded.userId, access: decoded.access },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Store the new token in HTTP-only cookies for persistence
    res.cookie("adminToken", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ message: "Token refreshed", token: newToken });
  } catch (error) {
    return res
      .status(403)
      .json({ message: "Forbidden: Invalid or expired token" });
  }
};

// **11. Check if Session is Active**
exports.checkSession = (req, res) => {
  if (req.user) {
    return res.json({ message: "Session active", user: req.user });
  }
  return res.status(401).json({ message: "Session expired" });
};

// **12. Get User**
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
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

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
    res.clearCookie("adminToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    });

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
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
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

