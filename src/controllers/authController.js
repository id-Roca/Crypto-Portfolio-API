import bcrypt from "bcryptjs";

export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const validUsername = username === process.env.ADMIN_USERNAME;

    const validPassword = await bcrypt.compare(
      password,
      process.env.ADMIN_PASSWORD_HASH,
    );
    if (!validPassword || !validUsername) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password.",
      });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.isAuthenticated = true;

      req.session.save((error) => {
        if (error) return next(error);
        return res.status(200).json({
          success: true,
          message: "Logged in successfully",
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    next(error);
  }
};

export const logout = (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("connect.sid");

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  });
};
