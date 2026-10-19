import express from "express";
import { login, logout } from "../controllers/authController.js";
import { validate } from "../middleware/validate.js";
import { loginSchema } from "../validators/authSchema.js";
import { loginLimiter } from "../middleware/rateLimiters.js";

const router = express.Router();

router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/logout", logout);

export default router;