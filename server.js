import express from "express";

const app = express();

const PORT = 3000;

app.get("/", (req, res) => {
  res.json({ message: "Welcome to my Crypto Portfolio API" });
});

app.listen(PORT, () => {
  console.log(`Verbindung läuft auf http://localhost:${PORT}`);
});
