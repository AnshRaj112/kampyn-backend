function registerStandardAuthRoutes(router, handlers, perApiAuthLimiter) {
  const {
    signup,
    verifyOtp,
    resendOtp,
    login,
    forgotPassword,
    resetPassword,
    googleAuth,
    googleSignup,
    logout,
    refreshToken,
    verifyToken,
    checkSession,
    getUser,
  } = handlers;

  if (signup) router.post("/signup", perApiAuthLimiter, signup);
  if (verifyOtp) router.post("/otpverification", perApiAuthLimiter, verifyOtp);
  if (resendOtp) router.post("/resendotp", perApiAuthLimiter, resendOtp);
  if (login) router.post("/login", perApiAuthLimiter, login);
  if (forgotPassword) router.post("/forgotpassword", perApiAuthLimiter, forgotPassword);
  if (resetPassword) router.post("/resetpassword", perApiAuthLimiter, resetPassword);
  if (googleAuth) router.post("/googleAuth", perApiAuthLimiter, googleAuth);
  if (googleSignup) router.post("/googleSignup", perApiAuthLimiter, googleSignup);
  if (logout) router.post("/logout", perApiAuthLimiter, logout);
  if (refreshToken) router.get("/refresh", perApiAuthLimiter, refreshToken);
  if (verifyToken && checkSession) router.get("/check", verifyToken, checkSession);
  if (verifyToken && getUser) router.get("/user", verifyToken, getUser);
}

module.exports = { registerStandardAuthRoutes };
