const jwt = require("jsonwebtoken");
const { checkUserActivity, updateUserActivity } = require("../utils/authUtils");
const User = require("../models/account/User");

exports.authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token missing" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user to determine type and check activity
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Determine user type based on user's type field
    let userType = 'user';
    if (user.type && user.type.includes('admin')) {
      userType = 'admin';
    }

    // Check if user should be logged out due to inactivity
    const { shouldLogout } = await checkUserActivity(decoded.userId, userType);
    if (shouldLogout) {
      return res.status(401).json({ 
        message: "Session expired due to inactivity. Please log in again." 
      });
    }

    // Update last activity
    await updateUserActivity(decoded.userId, userType);

    // Attach user info to req.user
    req.user = { userId: decoded.userId, userType };

    next();
  } catch (error) {
    console.error("JWT verification error:", error);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
