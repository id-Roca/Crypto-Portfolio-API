import express from "express";
import session from "express-session";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import assetRoutes from "./routes/assetRoutes.js";
import portfolioRoutes from "./routes/portfolioRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import helmet from "helmet";
import cors from "cors";

export const createApp = ({ sessionStore, sessionSecret = process.env.SESSION_SECRET } = {}) => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 30,
      },
    }),
  );

  app.get("/", (req, res) => {
    res.json({ message: "Welcome to my Crypto Portfolio API" });
  });

  app.use("/api/transactions", transactionRoutes);
  app.use("/api/assets", assetRoutes);
  app.use("/api/portfolio", portfolioRoutes);

  app.use("/api/auth", authRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
