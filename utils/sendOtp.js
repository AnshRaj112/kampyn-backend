const logger = require("./pinoLogger");
const nodemailer = require("nodemailer");

/**
 * Sends OTP via email using Loops API (production) or SMTP (development).
 * @param {string} email - The recipient's email.
 * @param {string} otp - The OTP code.
 */
const sendOtpEmail = async (email, otp) => {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // Use Loops API in production
    return await sendViaLoops(email, otp);
  } else {
    // Use nodemailer SMTP in development
    return await sendViaSMTP(email, otp);
  }
};

/**
 * Sends OTP via Loops API (Production).
 * @param {string} email - The recipient's email.
 * @param {string} otp - The OTP code.
 */
const sendViaLoops = async (email, otp) => {
  const requestBody = {
    transactionalId: process.env.LOOPS_TRANSACTIONAL_ID,
    email: email,
    dataVariables: {
      otp: String(otp)
    }
  };

  logger.info({
    email,
    otpValue: otp,
    transactionalId: process.env.LOOPS_TRANSACTIONAL_ID,
    requestBody: requestBody,
    hasApiKey: !!process.env.LOOPS_API_KEY
  }, "Sending OTP via Loops API (Production)");

  const response = await fetch("https://app.loops.so/api/v1/transactional", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.LOOPS_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  if (!response.ok) {
    logger.error({
      error: data?.message || "Failed to send OTP email",
      email,
      status: response.status,
      statusText: response.statusText,
      responseData: data,
      requestBody: requestBody
    }, "Error sending OTP email via Loops API");
    throw new Error(data?.message || "Failed to send OTP email");
  }

  logger.info({
    email,
    otpValue: otp,
    responseData: data
  }, "OTP sent successfully via Loops API");
  return data;
};

/**
 * Sends OTP via SMTP using nodemailer (Development).
 * @param {string} email - The recipient's email.
 * @param {string} otp - The OTP code.
 */
const sendViaSMTP = async (email, otp) => {
  logger.info({
    email,
    otpValue: otp,
    smtpUser: process.env.EMAIL_USER
  }, "Sending OTP via SMTP (Development)");

  // Create transporter
  const transporter = nodemailer.createTransport({
    service: "gmail", // You can change this to other services
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // Email options
  const mailOptions = {
    from: `"KAMPYN" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your OTP Code - KAMPYN",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
            .otp-code { font-size: 32px; font-weight: bold; color: #4CAF50; text-align: center; letter-spacing: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>KAMPYN Verification</h1>
            </div>
            <div class="content">
              <h2>Your OTP Code</h2>
              <p>Hello,</p>
              <p>You have requested an OTP code for verification. Please use the code below:</p>
              <div class="otp-code">${otp}</div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 KAMPYN. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Your KAMPYN OTP code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info({
      email,
      otpValue: otp,
      messageId: info.messageId,
      response: info.response
    }, "OTP sent successfully via SMTP");
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error({
      error: error.message,
      email,
      stack: error.stack
    }, "Error sending OTP email via SMTP");
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
};

module.exports = sendOtpEmail;
