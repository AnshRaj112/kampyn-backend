const GuestHouse = require("../../models/account/GuestHouse");
const Otp = require("../../models/users/Otp");
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendOtpEmail = require("../../utils/sendOtp");
const { checkUserActivity, updateUserActivity, hashPassword } = require("../../utils/authUtils");
const logger = require("../../utils/pinoLogger");
const { getCookieOptions, clearCookie } = require("../../middleware/cookieConfig");

const generateOtp = () => crypto.randomInt(100000, 999999).toString();

const setTokenCookie = (res, token) => {
  res.cookie("guestHouseToken", token, getCookieOptions());
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const otpRecord = await Otp.findOne({ email: normalizedEmail, otp: { $eq: otp } });
    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const guestHouse = await GuestHouse.findOneAndUpdate(
      { email: normalizedEmail },
      { isVerified: true },
      { new: true }
    ).select("-password -__v");

    if (!guestHouse) return res.status(404).json({ message: "Guest house not found" });

    await Otp.deleteOne({ email: normalizedEmail });

    const token = jwt.sign({ userId: guestHouse._id, role: "guestHouse" }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    await updateUserActivity(guestHouse._id, "guestHouse");
    setTokenCookie(res, token);

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: guestHouse,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Guest house OTP verification error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
    if (!normalizedEmail) return res.status(400).json({ message: "Email is required" });

    const guestHouse = await GuestHouse.findOne({ email: normalizedEmail }).select("_id");
    if (!guestHouse) return res.status(404).json({ message: "Guest house not found" });

    const otp = generateOtp();
    await Otp.deleteMany({ email: normalizedEmail });
    await new Otp({ email: normalizedEmail, otp }).save();
    await sendOtpEmail(normalizedEmail, otp);
    return res.json({ message: "OTP resent successfully" });
  } catch (error) {
    logger.error({ error: error.message }, "Guest house resend OTP error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const normalizedIdentifier = String(identifier || "").trim().toLowerCase();
    const guestHouse = await GuestHouse.findOne({
      $or: [{ email: normalizedIdentifier }, { contactNumber: String(identifier || "").trim() }],
    });

    if (!guestHouse) return res.status(400).json({ message: "User not found" });

    if (!guestHouse.isVerified) {
      const otp = generateOtp();
      await Otp.deleteMany({ email: guestHouse.email });
      await new Otp({ email: guestHouse.email, otp, createdAt: Date.now() }).save();
      await sendOtpEmail(guestHouse.email, otp);
      return res.status(400).json({
        message: "User not verified. OTP sent to email.",
        email: guestHouse.email,
        redirectTo: `/guest-house-otp-verification?email=${encodeURIComponent(guestHouse.email)}&from=login`,
      });
    }

    const isMatch = await argon2.verify(guestHouse.password, String(password || ""));
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ userId: guestHouse._id, role: "guestHouse" }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    await updateUserActivity(guestHouse._id, "guestHouse");
    setTokenCookie(res, token);

    const safeGuestHouse = guestHouse.toObject();
    delete safeGuestHouse.password;

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: safeGuestHouse,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Guest house login error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { identifier } = req.body;
    const normalizedIdentifier = String(identifier || "").trim().toLowerCase();
    const guestHouse = await GuestHouse.findOne({
      $or: [{ email: normalizedIdentifier }, { contactNumber: String(identifier || "").trim() }],
    });
    if (!guestHouse) return res.status(400).json({ message: "User not found" });

    const otp = generateOtp();
    await Otp.deleteMany({ email: guestHouse.email });
    await new Otp({ email: guestHouse.email, otp }).save();
    await sendOtpEmail(guestHouse.email, otp);
    return res.json({ message: "OTP sent for password reset", email: guestHouse.email });
  } catch (error) {
    logger.error({ error: error.message }, "Guest house forgot password error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
    const { password } = req.body;
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const hashedPassword = await hashPassword(String(password));
    const updated = await GuestHouse.findOneAndUpdate(
      { email: normalizedEmail },
      { password: hashedPassword },
      { new: true }
    ).select("_id");
    if (!updated) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error({ error: error.message }, "Guest house reset password error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.logout = (req, res) => {
  clearCookie(res, "guestHouseToken");
  clearCookie(res, "token");
  return res.json({ message: "Logged out successfully" });
};

exports.verifyToken = async (req, res, next) => {
  const token =
    req.headers.authorization?.split(" ")[1] || req.cookies?.guestHouseToken || req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Unauthorized: No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { shouldLogout, user } = await checkUserActivity(decoded.userId, "guestHouse");
    if (shouldLogout) {
      const message = user
        ? "Session expired due to inactivity. Please log in again."
        : "Guest house not found or inactive.";
      return res.status(401).json({ message });
    }
    await updateUserActivity(decoded.userId, "guestHouse");
    req.user = decoded;
    req.fullGuestHouse = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};

exports.checkSession = (req, res) => {
  if (req.user) return res.json({ message: "Session active", user: req.user });
  return res.status(401).json({ message: "Session expired" });
};

exports.getUser = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const user = await GuestHouse.findById(userId)
      .select("-password -__v")
      .populate({ path: "services", populate: { path: "feature" } })
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (error) {
    logger.error({ error: error.message }, "Guest house get user error");
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getAssignments = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    const guestHouse = await GuestHouse.findById(userId)
      .select("name uniId services")
      .populate({ path: "services", populate: { path: "feature" } })
      .lean();

    if (!guestHouse) {
      return res.status(404).json({
        success: false,
        message: "Guest house not found",
      });
    }

    return res.json({
      success: true,
      data: {
        guestHouseId: guestHouse._id,
        guestHouseName: guestHouse.name,
        uniId: guestHouse.uniId,
        services: guestHouse.services || [],
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "Guest house assignments error");
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assignments",
    });
  }
};

