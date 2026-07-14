

import { checkLimit } from "../grpcClient.js";

export function rateLimiterMiddleware() {
  return async function rateLimit(req, res, next) {
    const entityId = req.user?.id || req.ip;
    const tier = req.user?.tier || "anonymous";
    const route = req.route?.path || req.path;

    const result = await checkLimit({
      entityId,
      route,
      method: req.method,
      tier,
    });

    res.set("X-RateLimit-Remaining", String(Math.max(result.remaining, 0)));
    if (result.retryAfterMs) {
      res.set("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
    }

    if (!result.allowed) {
      return res.status(429).json({
        error: "rate_limit_exceeded",
        message: "Too many requests. Slow down.",
        retryAfterMs: result.retryAfterMs,
      });
    }

    next();
  };
}