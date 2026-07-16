import express from "express";
import { rateLimiterMiddleware } from "./middleware/rateLimiterMiddleware.js";

const app = express();
app.set("trust proxy", true);
app.use(express.json());

app.use((req, res, next) => {
  req.user = req.headers["x-user-id"]
    ? { id: req.headers["x-user-id"], tier: req.headers["x-user-tier"] || "free" }
    : null;
  next();
});

const limit = rateLimiterMiddleware();

app.use((req, res, next) => {
    console.log(req.method, req.url);
    next();
});

app.post("/", async (req, res) => {
  res.status(200).json({ success: true, msg: "Home page api" });
});


app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/user", limit, async (req, res) => {
  res.status(200).json({ success: true, msg: "User page api" });
});

app.listen(3000, () => {
  console.log(`Server is listening on http://localhost:3000`);
});