const Account = require("../../models/account/User");
const Otp = require("../../models/users/Otp");
const Uni = require("../../models/account/Uni");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendOtpEmail = require("../../utils/sendOtp");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");

// Utility: Generate OTP
const generateOtp = () => crypto.randomInt(100000, 999999).toString();

// Utility: Hash Password
// Aggressively optimized settings for sub-200ms response time while maintaining security
const hashPassword = async (password) => {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_KIB) || 12288, // Reduced to 12MB for faster hashing (still secure)
    timeCost: Number(process.env.ARGON2_TIME) || 2, // Minimum value is 2 (argon2 requirement)
    parallelism: Number(process.env.ARGON2_PAR) || 2 // Increased parallelism for better performance
  });
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
    // Reduced logging for performance - only log in development
    if (process.env.NODE_ENV === 'development') {
      logger.info({ body: req.body }, "Signup Request Received");
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
    logger.info({ body: req.body }, "OTP Verification Request");

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
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Reset inactivity timer so immediate user fetches don't fail
    await updateUserActivity(user._id, 'user');

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

// **2a. Resend OTP**
exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const emailLower = email.toLowerCase().trim();
    const otpRecord = await Otp.findOne({ email: { $eq: emailLower } });

    if (!otpRecord) {
      return res
        .status(404)
        .json({ message: "No OTP request found. Please restart the process." });
    }

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

// **3. Login**
exports.login = async (req, res) => {
  try {
    // Reduce logging overhead - only log in development
    if (process.env.NODE_ENV === 'development') {
      logger.info({ body: req.body }, "Login Request");
    }

    const { identifier, password } = req.body;

    // Process identifier based on type
    const processedIdentifier = identifier.includes('@')
      ? identifier.toLowerCase() // Convert email to lowercase
      : identifier.replace(/\s+/g, ''); // Remove spaces from phone number

    // Use .lean() for faster queries (returns plain JS object instead of Mongoose document)
    // Only select needed fields to reduce data transfer
    const user = await Account.findOne({
      $or: [{ email: processedIdentifier }, { phone: processedIdentifier }],
    })
      .lean()
      .select('_id password isVerified uniID email');

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
        redirectTo: `/otpverification?email=${user.email}&from=login`,
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

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update last activity on login (fire and forget - don't block response)
    updateUserActivity(user._id, 'user').catch((error) => {
      logger.error({ error: error.message, userId: user._id }, "Failed to update user activity");
    });

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
    logger.info({ email: emailToSend }, "OTP sent successfully for password reset");

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
    // Ensure email is a string to prevent NoSQL injection
    if (typeof email !== "string") {
      logger.info({ email }, "Invalid email for password reset");
      return res.status(400).json({ message: "Invalid email address" });
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

    // Check if user should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.userId, 'user');
    if (shouldLogout) {
      return res.status(401).json({
        message: "Session expired due to inactivity. Please log in again."
      });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, 'user');

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

    // Get user data
    const user = await Account.findById(decoded.userId).select(
      "-password -__v"
    );

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
