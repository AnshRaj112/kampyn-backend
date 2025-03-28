const User = require("../models/User");
const Otp = require("../models/Otp");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendOtpEmail = require("../utils/sendOtp");

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

    const { fullName, email, phone, password, gender } = req.body;
    let existingUser = await User.findOne({ $or: [{ email }, { phone }] });

    if (existingUser) {
      console.log("⚠️ User already exists:", email);
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await hashPassword(password);
    console.log("🔒 Password hashed successfully");

    const newUser = new User({ fullName, email, phone, password: hashedPassword, gender });
    await newUser.save();
    console.log("✅ User saved to database:", email);

    //Saving User using Cookie
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    setTokenCookie(res, token);

    // Generate OTP & Send Email
    const otp = generateOtp();
    console.log("🔢 OTP Generated:", otp);

    await new Otp({ email, otp }).save();
    console.log("✅ OTP saved to database");

    await sendOtpEmail(email, otp);
    console.log("📧 OTP sent to email:", email);

    res.status(201).json({ message: "User registered, OTP sent for verification" });
  } catch (error) {
    console.error("❌ Signup Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
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

    await User.findOneAndUpdate({ email }, { isVerified: true });
    console.log("✅ User verified:", email);

    await Otp.deleteOne({ email });
    console.log("🗑️ OTP deleted from database");

    res.status(200).json({ message: "OTP verified successfully" });
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
    const user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });

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

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

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

    // Find user by email OR phone number
    const user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });

    if (!user) {
      console.log("⚠️ User not found:", identifier);
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

    await User.findOneAndUpdate({ email }, { password: hashedPassword });
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
      return res.status(400).json({ message: "User does not exist, sign up first" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
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
      return res.status(400).json({ message: "User already exists. Please log in." });
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

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

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
exports.verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden: Invalid or expired token" });
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
    return res.status(403).json({ message: "Forbidden: Invalid or expired token" });
  }
};


// **11. Check if Session is Active**
exports.checkSession = (req, res) => {
  if (req.user) {
    return res.json({ message: "Session active", user: req.user });
  }
  return res.status(401).json({ message: "Session expired" });
};

// **12. Get USer**
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("fullName email");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
};
