const Account = require("../../models/account/Uni");
const Otp = require("../../models/users/Otp");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendOtpEmail = require("../../utils/sendOtp");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");

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
    logger.info({ body: req.body }, "Signup Request Received");

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
      { id: newAccount._id, role: "university" },
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
exports.verifyOtp = async (req, res) => {
  try {
    logger.info({ body: req.body }, "OTP Verification Request");

    const { email, otp } = req.body;
    const otpRecord = await Otp.findOne({ email: { $eq: email }, otp: { $eq: otp } });

    if (!otpRecord) {
      logger.info({ otp }, "Invalid or expired OTP");
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update user verification status
    const user = await Account.findOneAndUpdate(
      { email: { $eq: email } },
      { isVerified: true },
      { new: true }
    );
    logger.info({ email }, "User verified");

    // Delete the used OTP
    await Otp.deleteOne({ email: { $eq: email } });
    logger.info({ email }, "OTP deleted from database");

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
    logger.error({ error: error.message }, "OTP Verification Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **3. Login**
exports.login = async (req, res) => {
  try {
    logger.info({ body: req.body }, "Login Request");

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

    // Check if the university is available
    if (user.isAvailable !== 'Y') {
      return res.status(403).json({ 
        message: `Access denied. ${user.fullName} is currently unavailable. Please contact support for assistance.` 
      });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update last activity on login
    await updateUserActivity(user._id, 'uni');

    setTokenCookie(res, token);

    res.json({ message: "Login successful", token });
  } catch (error) {
    logger.error({ error: error.message }, "Login Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// **4. Forgot Password**
exports.forgotPassword = async (req, res) => {
  try {
    logger.info({ body: req.body }, "Forgot Password Request");

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
    logger.info({ body: req.body }, "Reset Password Request");

    const { email, password } = req.body;
    if (typeof email !== 'string') {
      logger.info({ email }, "Invalid email format in reset password");
      return res.status(400).json({ message: "Invalid email format" });
    }
    const hashedPassword = await hashPassword(password);
    logger.info("Password hashed successfully");

    await Account.findOneAndUpdate({ email: { $eq: email } }, { password: hashedPassword });
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
    logger.info({ body: req.body }, "Google Login Request");

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
    logger.info({ body: req.body }, "Google Signup Request");

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
    
    // Check if university should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.userId, 'uni');
    if (shouldLogout) {
      return res.status(401).json({ 
        message: "Session expired due to inactivity. Please log in again." 
      });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, 'uni');
    
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
    logger.info("Get User Request");

    // Get token from either cookie or Authorization header
    const token =
      req.cookies?.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      logger.info("No token provided");
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    logger.info({ userId: decoded.userId }, "Token verified");

    // Get user data with populated vendors
    const user = await Account.findById(decoded.userId)
      .select("-password -__v")
      .populate({
        path: 'vendors.vendorId',
        select: 'fullName email phone location' // Select only the fields you want to see
      });

    if (!user) {
      logger.info("User not found");
      return res.status(404).json({ message: "User not found" });
    }

    logger.info("User data retrieved successfully");
    res.json(user);
  } catch (error) {
    logger.error({ error: error.message }, "Get User Error");
    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({ message: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(403).json({ message: "Token expired" });
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
};

