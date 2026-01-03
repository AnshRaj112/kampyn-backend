const nodemailer = require("nodemailer");
const logger = require("./pinoLogger");

const transporter = nodemailer.createTransport({
  service: "gmail", // You can use other providers like SendGrid, Mailgun, etc.
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or app password
  },
  // Connection timeout settings
  connectionTimeout: 10000, // 10 seconds
  socketTimeout: 10000, // 10 seconds
  greetingTimeout: 10000, // 10 seconds
  // Connection pool settings for better reliability
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  // Rate limiting
  rateDelta: 1000, // 1 second
  rateLimit: 5, // 5 emails per second
});

/**
 * Sends OTP via email with retry logic.
 * @param {string} email - The recipient's email.
 * @param {string} otp - The OTP code.
 * @param {number} retries - Number of retry attempts (default: 3).
 */
const sendOtpEmail = async (email, otp, retries = 3) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your OTP for Verification",
    html: `<p>Your One-Time Password (OTP) is: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p>`,
  };

  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      logger.info({ email, attempt }, "OTP sent to email");
      return; // Success - exit function
    } catch (error) {
      lastError = error;
      const errorMessage = error.message || error.toString();
      const isTimeoutError = 
        errorMessage.includes("timeout") || 
        errorMessage.includes("ETIMEDOUT") ||
        errorMessage.includes("Connection timeout") ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNRESET";

      logger.error({ 
        error: errorMessage, 
        email, 
        attempt, 
        maxRetries: retries,
        errorCode: error.code,
        isTimeoutError 
      }, "Error sending OTP email");

      // If it's the last attempt, throw the error
      if (attempt === retries) {
        logger.error({ 
          error: errorMessage, 
          email, 
          totalAttempts: retries 
        }, "Failed to send OTP email after all retries");
        throw new Error(`Connection timeout: Failed to send OTP email after ${retries} attempts. ${errorMessage}`);
      }

      // Wait before retrying with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
      logger.info({ email, attempt, nextRetryIn: delay }, "Retrying OTP email send");
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but just in case
  throw lastError || new Error("Failed to send OTP email");
};

module.exports = sendOtpEmail;
