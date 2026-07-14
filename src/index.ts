import express from "express"
import { createRedisClient } from "./lib/redisClient.js"
import { RateLimiter } from "./lib/rateLimiter.js"
import { rateLimiterMiddleware } from "./middleware/rateLimiterMiddleware.js"
import type { UserTier } from "./lib/types.ts";

const redis = createRedisClient({url: process.env.REDIS_URL})
const limiter = new RateLimiter(redis, {
  failureMode: "open",
  localBucket: { capacity: 100, refillPerSec: 50 },
});

const app = express();
app.use(express.json());


app.use((req, _res, next) => {
  const id = req.headers["x-user-id"];
  if (typeof id === "string") {
    const tier = (req.headers["x-user-tier"] as UserTier) || "free";
    req.user = { id, tier };
  } else {
    req.user = null;
  }
  next();
});

const limit = rateLimiterMiddleware(limiter);

app.post("/", async (req, res) => {
  res.status(200).json({ success: true, msg: "Home page api" });
});

app.post("/user", limit, async (req, res) => {
  res.status(200).json({ success: true, msg: "User page api" });
});

app.listen(3000, () => {
    console.log(`Server is listening on http://localhost:3000`)
})

