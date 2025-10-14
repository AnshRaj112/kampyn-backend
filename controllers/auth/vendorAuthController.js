const Account = require("../../models/account/Vendor");
const Uni = require("../../models/account/Uni");
const Otp = require("../../models/users/Otp");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendOtpEmail = require("../../utils/sendOtp");
const { checkUserActivity, updateUserActivity } = require("../../utils/authUtils");
const { populateVendorWithUniversityItems } = require("../../utils/vendorUtils");

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

// **1. User Signup**
exports.signup = async (req, res) => {
  try {
    console.log("🔵 Signup Request Received:", req.body);

    const { fullName, email, phone, password, location, uniID, sellerType } =
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
      location, 
      uniID,
      sellerType,
      isVerified: false,
    };

    const newAccount = new Account(accountData);
    await newAccount.save();
    console.log("✅ Account created:", emailLower);

    // Populate vendor with existing university items
    await populateVendorWithUniversityItems(newAccount, uniID);
    console.log("✅ Vendor populated with university items");

    // Update Uni's vendors array
    await Uni.findByIdAndUpdate(
      uniID,
      {
        $push: {
          vendors: {
            vendorId: newAccount._id,
            isAvailable: "Y"
          }
        }
      }
    );
    console.log("✅ Vendor added to Uni's vendors array");

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
    const emailLower = email.toLowerCase(); // Ensure lowercase
    console.log("🔍 Looking for OTP with email:", emailLower, "and OTP:", otp);
    
    const otpRecord = await Otp.findOne({ email: emailLower, otp });
    console.log("🔍 Found OTP record:", otpRecord);

    if (!otpRecord) {
      console.log("⚠️ Invalid or expired OTP:", otp);
      // Let's also check if there are any OTPs for this email
      const allOtpsForEmail = await Otp.find({ email: emailLower });
      console.log("🔍 All OTPs for this email:", allOtpsForEmail);
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Update user verification status
    const user = await Account.findOneAndUpdate(
      { email: emailLower },
      { isVerified: true },
      { new: true }
    );
    console.log("✅ User verified:", emailLower);

    // Delete the used OTP
    await Otp.deleteOne({ email: emailLower });
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
      console.log("🔢 Generated OTP for login:", otp, "for email:", user.email);
      
      // Delete any existing OTPs for this email first
      await Otp.deleteMany({ email: user.email });
      console.log("🗑️ Deleted existing OTPs for email:", user.email);
      
      // Save new OTP with lowercase email
      const newOtp = new Otp({ email: user.email.toLowerCase(), otp, createdAt: Date.now() });
      await newOtp.save();
      console.log("✅ Saved new OTP:", newOtp);

      // Send OTP email
      await sendOtpEmail(user.email, otp);
      console.log("📧 Sent OTP email to:", user.email);

      // Redirect user to OTP verification
      return res.status(400).json({
        message: "User not verified. OTP sent to email.",
        email: user.email,
        redirectTo: `/otpverification?email=${user.email}&from=login`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
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

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update last activity on login
    await updateUserActivity(user._id, 'vendor');

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
    
    // Check if vendor should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.userId, 'vendor');
    if (shouldLogout) {
      return res.status(401).json({ 
        message: "Session expired due to inactivity. Please log in again." 
      });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, 'vendor');
    
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

    // Get user data
    const user = await Account.findById(decoded.userId).select(
      "-password -__v"
    );

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
