const nodemailer = require("nodemailer");
const logger = require("./pinoLogger");

const transporter = nodemailer.createTransport({
  service: "gmail", // You can use other providers like SendGrid, Mailgun, etc.
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or app password
  },
});

/**
 * Sends OTP via email.
 * @param {string} email - The recipient's email.
 * @param {string} otp - The OTP code.
 */
const sendOtpEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your OTP for Verification",
    html: `<p>Your One-Time Password (OTP) is: <strong>${otp}</strong></p><p>This OTP will expire in 10 minutes.</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info({ email }, "OTP sent to email");
  } catch (error) {
    logger.error({ error: error.message, email }, "Error sending OTP email");
  }
};

module.exports = sendOtpEmail;
