// middleware to set rate-limiter header for client(browser)

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { resolveCost, resolveLimit } from "../config/limits.js";
import type { RateLimiter } from "../lib/rateLimiter.js";
import type { AuthedUser } from "../lib/types.js";

declare global {
    namespace Express {
        interface Request {
            user?: AuthedUser | null;
        }
    }
}

export interface RateLimitMiddlewareOptions {
    identify?: (req: Request) => string;
    tierOf?: (req: Request) => AuthedUser["tier"];
}

export function rateLimiterMiddleware(
    limiter: RateLimiter,
    opts: RateLimitMiddlewareOptions = {}
): RequestHandler {
    const identify = opts.identify ?? ((req: Request) => req.user?.id ?? req.ip ?? "unknown");
    const tierOf = opts.tierOf ?? ((req: Request) => req.user?.tier ?? "anonymous");

    return async function rateLimit(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        const entity = identify(req);
        const tier = tierOf(req);
        const route = req.route?.path ?? req.path;
        const cost = resolveCost(req.method, route);
        const limit = resolveLimit(tier);

        const key = `rl:{${entity}:${route}}`;

        const result = await limiter.check(key, limit, cost);

        res.set("X-RateLimit-Limit", String(limit.rate));
        res.set("X-RateLimit-Remaining", String(Math.max(result.remaining, 0)));

        if (result.retryAfterMs) {
            res.set("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
        }

        if (!result.allowed) {
            res.status(429).json({
                error: "rate_limit_exceeded",
                message: "Too many requests. Slow down",
                retryAfterMs: result.retryAfterMs,
            });
            return;
        }

        next();
    };
}