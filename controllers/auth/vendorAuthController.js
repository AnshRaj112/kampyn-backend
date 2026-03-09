const Account = require("../../models/account/Vendor");
const Uni = require("../../models/account/Uni");
const User = require("../../models/account/User");
const mongoose = require("mongoose");
const Otp = require("../../models/users/Otp");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendOtpEmail = require("../../utils/sendOtp");
const { checkUserActivity, updateUserActivity, hashPassword } = require("../../utils/authUtils");
const { populateVendorWithUniversityItems } = require("../../utils/vendorUtils");
const logger = require("../../utils/pinoLogger");
const { getCookieOptions, clearCookie } = require("../../middleware/cookieConfig");

// Utility: Generate OTP
const generateOtp = () => crypto.randomInt(100000, 999999).toString();


// Cookie Token Set
const setTokenCookie = (res, token) => {
  res.cookie("vendorToken", token, getCookieOptions());
};

// **1. User Signup**
exports.signup = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "Signup Request Received");

    const { fullName, email, phone, password, location, uniID, sellerType } =
      req.body;

    // Validate uniID is a string or valid ObjectId; otherwise, reject
    if (
      typeof uniID !== "string" ||
      !mongoose.Types.ObjectId.isValid(uniID)
    ) {
      return res.status(400).json({ message: "Invalid university ID." });
    }

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
      location,
      uniID,
      sellerType,
      isVerified: false,
    };

    const newAccount = new Account(accountData);
    await newAccount.save();
    logger.info({ email: emailLower }, "Account created");

    // Populate vendor with existing university items
    await populateVendorWithUniversityItems(newAccount, uniID);
    logger.info("Vendor populated with university items");

    // Update Uni's vendors array
    await Uni.findByIdAndUpdate(
      new mongoose.Types.ObjectId(uniID),
      {
        $push: {
          vendors: {
            vendorId: newAccount._id,
            isAvailable: "Y"
          }
        }
      }
    );
    logger.info("Vendor added to Uni's vendors array");

    const token = jwt.sign(
      { userId: newAccount._id, role: 'vendor' },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Send OTP if needed
    const otp = generateOtp();
    await new Otp({ email: emailLower, otp }).save();
    logger.info({ email: emailLower }, "OTP Generated and Saved");

    await sendOtpEmail(emailLower, otp);
    logger.info({ email: emailLower }, "OTP sent to email");

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

    // Input validation
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Sanitize email: convert to lowercase and validate format
    const sanitizedEmail = email.toLowerCase().trim();

    // Validate email format using regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Validate OTP format (should be 6 digits)
    const otpRegex = /^\d{6}$/;
    if (!otpRegex.test(otp)) {
      return res.status(400).json({ message: "Invalid OTP format" });
    }

    logger.debug({ email: sanitizedEmail }, "Looking for OTP");

    const otpRecord = await Otp.findOne({ email: sanitizedEmail, otp: { $eq: otp } });
    logger.debug({ found: !!otpRecord }, "OTP record lookup result");

    if (!otpRecord) {
      logger.info({ otp }, "Invalid or expired OTP");
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update user verification status using sanitized email
    const user = await Account.findOneAndUpdate(
      { email: sanitizedEmail },
      { isVerified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    logger.info({ email: sanitizedEmail }, "User verified");

    // Delete the used OTP using sanitized email
    await Otp.deleteOne({ email: sanitizedEmail });
    logger.info({ email: sanitizedEmail }, "OTP deleted from database");

    // Generate new token for the verified user
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Reset inactivity timer so immediate user fetches don't fail
    await updateUserActivity(user._id, 'vendor');

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
exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const emailLower = email.toLowerCase().trim();
    let otpRecord = await Otp.findOne({ email: { $eq: emailLower } });

    if (!otpRecord) {
      // If no OTP record, it might have expired from TTL (10 mins).
      // Check if this email belongs to an existing account to allow regenerating the OTP.
      const account = await Account.findOne({ email: { $eq: emailLower } }).lean().select('_id');

      if (account) {
        const otp = generateOtp();
        await new Otp({ email: emailLower, otp, createdAt: new Date() }).save();
        await sendOtpEmail(emailLower, otp);
        return res.json({ message: "OTP resent successfully" });
      }

      return res.status(404).json({
        message: "Session expired or no OTP request found. Please restart the process."
      });
    }

    // OTP record exists - just refresh it
    const otp = generateOtp();
    otpRecord.otp = otp;
    otpRecord.createdAt = new Date();
    await otpRecord.save();

    await sendOtpEmail(emailLower, otp);

    return res.json({ message: "OTP resent successfully" });
  } catch (error) {
    logger.error({ error: error.message }, "Resend OTP Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
};
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
      logger.info({ email: user.email }, "Generated OTP for login");

      // Delete any existing OTPs for this email first
      await Otp.deleteMany({ email: user.email });
      logger.info({ email: user.email }, "Deleted existing OTPs");

      // Save new OTP with lowercase email
      const newOtp = new Otp({ email: user.email.toLowerCase(), otp, createdAt: Date.now() });
      await newOtp.save();
      logger.info({ email: user.email }, "Saved new OTP");

      // Send OTP email
      await sendOtpEmail(user.email, otp);
      logger.info({ email: user.email }, "Sent OTP email");

      // Redirect user to OTP verification
      return res.status(400).json({
        message: "User not verified. OTP sent to email.",
        email: user.email,
        redirectTo: `/otpverification?email=${user.email}&from=login&role=vendor`,
      });
    }

    const isMatch = await argon2.verify(user.password, password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if the university is available
    if (user.uniID) {
      const university = await Uni.findById(user.uniID).select('isAvailable fullName');
      if (!university) {
        return res.status(400).json({
          message: "University not found. Please contact support."
        });
      }

      if (university.isAvailable !== 'Y') {
        return res.status(403).json({
          message: `Access denied. ${university.fullName} is currently unavailable. Please contact support for assistance.`
        });
      }
    }

    const token = jwt.sign({ userId: user._id, role: 'vendor' }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update last activity on login
    await updateUserActivity(user._id, 'vendor');

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
exports.googleAuth = async (req, res) => {
  try {
    logger.info({ email: req.body.email }, "Google Login Request");

    const { email } = req.body;
    let user = await Account.findOne({ email });

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

    let existingUser = await Account.findOne({ email });

    if (existingUser) {
      logger.info({ email }, "User already exists");
      return res
        .status(400)
        .json({ message: "User already exists. Please log in." });
    }

    const newUser = new Account({
      fullName,
      email,
      phone: "", // No phone number required for Google signup
      password: "", // Google users won't have a password
      sellerType: "NON_SELLER", // Default to non-seller for google signup
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
  clearCookie(res, "vendorToken");
  clearCookie(res, "token");
  res.json({ message: "Logged out successfully" });
};

// ** 9. Middleware: Verify JWT Token**
exports.verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1] || req.cookies?.token || req.query?.token;

  if (!token) {
    logger.warn({ path: req.originalUrl }, "vendor:verifyToken: No token provided");
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if vendor should be logged out due to inactivity
    const { shouldLogout, user } = await checkUserActivity(decoded.userId, 'vendor');

    if (shouldLogout) {
      const message = user ? "Session expired due to inactivity. Please log in again." : "Vendor not found or account inactive.";
      logger.warn({ userId: decoded.userId, userFound: !!user }, `vendor:verifyToken: ${message}`);
      return res.status(401).json({ message });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, 'vendor');

    req.user = decoded;
    req.fullVendor = user; // Attach full vendor object
    next();
  } catch (error) {
    logger.warn({ error: error.message, path: req.originalUrl }, "vendor:verifyToken: Verification failed");
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid or expired token" });
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
    res.cookie("vendorToken", newToken, getCookieOptions());

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
