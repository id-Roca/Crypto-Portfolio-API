import MongoStore from "connect-mongo";
import { connectDB } from "./config/db.js";
import { createApp } from "./app.js";

const PORT = process.env.PORT || 3000;
const app = createApp({
  sessionStore: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
});

try {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start server:", error.message);
  process.exit(1);
}
