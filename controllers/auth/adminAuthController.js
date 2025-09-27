const Account = require("../../models/account/Uni");
const Otp = require("../../models/users/Otp");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendOtpEmail = require("../../utils/sendOtp");
const Admin = require("../../models/account/Admin");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");

// Utility: Generate OTP
const generateOtp = () => crypto.randomInt(100000, 999999).toString();

// Utility: Hash Password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Cookie Token Set
const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Secure in production
    sameSite: "Strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  });
};

// **1. User Signup**exports.signup = async (req, res) => {
exports.signup = async (req, res) => {
  try {
    console.log("🔵 Signup Request Received:", req.body);

    const { fullName, email, phone, password } =
      req.body;

    // Convert email to lowercase
    const emailLower = email.toLowerCase();

    const existingUser = await Account.findOne({ $or: [{ email: emailLower }, { phone }] });
    if (existingUser) {
      console.log("⚠️ User already exists:", emailLower);
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await hashPassword(password);
    console.log("🔒 Password hashed successfully");

    const accountData = {
      fullName,
      email: emailLower,
      phone,
      password: hashedPassword,
      isVerified: false,
    };

    const newAccount = new Account(accountData);
    await newAccount.save();
    console.log("✅ Account created:", emailLower);

    const token = jwt.sign(
      { id: newAccount._id, role: newAccount.type },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Send OTP if needed
    const otp = generateOtp();
    await new Otp({ email: emailLower, otp }).save();
    console.log("🔢 OTP Generated and Saved:", otp);

    await sendOtpEmail(emailLower, otp);
    console.log("📧 OTP sent to email:", emailLower);

    // Optional: Set cookie
    // setTokenCookie(res, token);

    return res.status(201).json({
      message: "Account created successfully. OTP sent for verification.",
      token,
      role: newAccount.type,
      id: newAccount._id,
    });
  } catch (error) {
    console.error("❌ Signup Error:", error);
    return res
      .status(500)
      .json({ message: "Signup failed.", error: error.message });
  }
};

// **2. OTP Verification**
exports.verifyOtp = async (req, res) => {
  try {
    console.log("🔵 OTP Verification Request:", req.body);

    const { email, otp } = req.body;
    const otpRecord = await Otp.findOne({ email, otp });

    if (!otpRecord) {
      console.log("⚠️ Invalid or expired OTP:", otp);
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update user verification status
    const user = await Account.findOneAndUpdate(
      { email },
      { isVerified: true },
      { new: true }
    );
    console.log("✅ User verified:", email);

    // Delete the used OTP
    await Otp.deleteOne({ email });
    console.log("🗑️ OTP deleted from database");

    // Generate new token for the verified user
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    setTokenCookie(res, token);

    res.status(200).json({
      message: "OTP verified successfully",
      token,
    });
  } catch (error) {
    console.error("❌ OTP Verification Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **3. Login**
exports.login = async (req, res) => {
  try {
    console.log("🔵 Login Request:", req.body);

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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update last activity on login
    await updateUserActivity(user._id, 'admin');

    setTokenCookie(res, token);

    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error("❌ Login Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **4. Forgot Password**
exports.forgotPassword = async (req, res) => {
  try {
    console.log("🔵 Forgot Password Request:", req.body);

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
      console.log("⚠️ User not found:", processedIdentifier);
      return res.status(400).json({ message: "User not found" });
    }

    const emailToSend = user.email; // Use the user's email to send OTP

    const otp = generateOtp();
    console.log("🔢 OTP Generated:", otp);

    await new Otp({ email: emailToSend, otp }).save();
    console.log("✅ OTP saved to database");

    await sendOtpEmail(emailToSend, otp);
    console.log("📧 OTP sent to email:", emailToSend);

    res.json({ message: "OTP sent for password reset", email: emailToSend });
  } catch (error) {
    console.error("❌ Forgot Password Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **5. Reset Password**
exports.resetPassword = async (req, res) => {
  try {
    console.log("🔵 Reset Password Request:", req.body);

    const { email, password } = req.body;
    const hashedPassword = await hashPassword(password);
    console.log("🔒 Password hashed successfully");

    await Account.findOneAndUpdate({ email }, { password: hashedPassword });
    console.log("✅ Password updated for:", email);

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("❌ Reset Password Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **6. Google Login**
exports.googleAuth = async (req, res) => {
  try {
    console.log("🔵 Google Login Request:", req.body);

    const { email } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      console.log("⚠️ User not found for Google login:", email);
      return res
        .status(400)
        .json({ message: "User does not exist, sign up first" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    console.log("✅ Google login successful:", email);

    res.json({ message: "Google login successful", token });
  } catch (error) {
    console.error("❌ Google Login Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **7. Google Signup**
exports.googleSignup = async (req, res) => {
  try {
    console.log("🔵 Google Signup Request:", req.body);

    const { email, googleId, fullName } = req.body;

    let existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log("⚠️ User already exists:", email);
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
    console.log("✅ Google user saved to database:", email);

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({ message: "Google signup successful", token });
  } catch (error) {
    console.error("❌ Google Signup Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **8. Logout**
exports.logout = (req, res) => {
  console.log(`🔴 User Logged Out: ${req.user?.userId || "Unknown User"}`);
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
};

// ** 9. Middleware: Verify JWT Token**
exports.verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if admin should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.userId, 'admin');
    if (shouldLogout) {
      return res.status(401).json({ 
        message: "Session expired due to inactivity. Please log in again." 
      });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, 'admin');
    
    req.user = decoded;
    next();
  } catch (error) {
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
    res.cookie("token", newToken, {
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
    console.log("🔵 Get User Request");

    // Get token from either cookie or Authorization header
    const token =
      req.cookies?.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      console.log("⚠️ No token provided");
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token verified, userId:", decoded.userId);

    // Get user data with populated vendors
    const user = await Account.findById(decoded.userId)
      .select("-password -__v")
      .populate({
        path: 'vendors.vendorId',
        select: 'fullName email phone location' // Select only the fields you want to see
      });

    if (!user) {
      console.log("⚠️ User not found");
      return res.status(404).json({ message: "User not found" });
    }

    console.log("✅ User data retrieved successfully");
    res.json(user);
  } catch (error) {
    console.error("❌ Get User Error:", error);
    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({ message: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(403).json({ message: "Token expired" });
    }
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
        adminId: admin._id,
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
    console.error("Admin login error:", error);
    
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
    console.error("Admin logout error:", error);
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
    console.error("Get admin profile error:", error);
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
    console.error("Update admin profile error:", error);
    
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
    console.error("Change password error:", error);
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
        adminId: admin._id,
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
    console.error("Refresh token error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

