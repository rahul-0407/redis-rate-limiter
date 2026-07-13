import express from "express"
import { createRedisClient } from "./lib/redisClient.js"
import { rateLimiterMiddleware } from "./middleware/rateLimiterMiddleware.js"

const redis = createRedisClient({url: process.env.REDIS_URL})
const limiter = {}

const app = express();
app.use(express.json());


app.use((req, res, next) => {
  req.user = req.headers["x-user-id"]
    ? { id: req.headers["x-user-id"], tier: req.headers["x-user-tier"] || "free" }
    : null;
  next();
});

const limit = rateLimitMiddleware(limiter);

app.post("/", async (req, res) => {
  res.status(200).json({ success: true, msg: "Home page api" });
});

app.post("/user", limit, async (req, res) => {
  res.status(200).json({ success: true, msg: "User page api" });
});

app.listen(3000, () => {
    console.log(`Server is listening on http://localhost:3000`)
})

