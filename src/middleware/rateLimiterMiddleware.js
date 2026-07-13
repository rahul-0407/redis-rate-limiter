// middleware to set rate-limiter headers for browsers(client)

import { resolveCost, resolveLimit } from "../config/limits";

export function rateLimiterMiddleware(limiter, opts = {}){
    const identify = opts.identity || ((req) => req.user?.id || req.ip);
    const tierOf = opts.tierOf || ((req) => req.user?.tier || "anonymous");

    return async function rateLimit(req, res, next) {
        const entity = identify(req);
        const tier = tierOf(req);
        const route = req.route?.path || req.path;
        const cost = resolveCost(req.method, route);
        const limit = resolveLimit(tier)

        const key = `rl:{${entity}:${route}}`;

        const result = await limiter.check(key, limit, cost);

        res.set("X-RateLimit-Limit", String(limit.rate));
        res.set("X-RateLimit-Remaining", String(Math.max(result.remainin, 0)));

        if(result.retryAfterMs){
            res.set("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
        }

        if(!result.allwed){
            return res.status(429).json({
                error: "rate_limit_exceeded",
                message: "Too many requests. Slow down",
                retryAfterMs: result.retryAfterMs,
            })
        }

        next();

    }
} 