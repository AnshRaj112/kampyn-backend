const logger = require("./pinoLogger");

/**
 * Sends OTP via email using Loops API.
 * @param {string} email - The recipient's email.
 * @param {string} otp - The OTP code.
 */
const sendOtpEmail = async (email, otp) => {
  // Loops API expects dataVariables with the variable names matching the template
  // Make sure the variable name 'otp' matches exactly what's in your Loops template
  const requestBody = {
    transactionalId: process.env.LOOPS_TRANSACTIONAL_ID,
    email: email,
    dataVariables: {
      otp: String(otp) // Ensure it's a string
    }
  };

  logger.info({ 
    email, 
    otpValue: otp, 
    transactionalId: process.env.LOOPS_TRANSACTIONAL_ID,
    requestBody: requestBody,
    hasApiKey: !!process.env.LOOPS_API_KEY 
  }, "Sending OTP via Loops API");

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

module.exports = sendOtpEmail;
