const processIdentifier = (identifier) => {
  return identifier.includes("@")
    ? identifier.toLowerCase()
    : identifier.replace(/\s+/g, "");
};

const handleUnverifiedLogin = async ({
  user,
  OtpModel,
  generateOtp,
  sendOtpEmail,
  redirectTo,
  includeEmail = false,
  clearExistingOtps = false,
}) => {
  const otp = generateOtp();

  if (clearExistingOtps) {
    await OtpModel.deleteMany({ email: user.email });
  }

  await new OtpModel({ email: user.email, otp, createdAt: Date.now() }).save();
  await sendOtpEmail(user.email, otp);

  const response = {
    message: "User not verified. OTP sent to email.",
    redirectTo,
  };

  if (includeEmail) {
    response.email = user.email;
  }

  return response;
};

module.exports = {
  processIdentifier,
  handleUnverifiedLogin,
};
