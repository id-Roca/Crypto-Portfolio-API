export const requireAuth = (req, res, next) => {
  // console.log("Session debug:", {
  //   sessionExists: !!req.session,
  //   authenticated: req.session?.isAuthenticated,
  //   sessionId: req.sessionID ? "present" : "missing",
  // });
  if (!req.session?.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please log in.",
    });
  }

  next();
};
