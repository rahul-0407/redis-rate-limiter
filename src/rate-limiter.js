import Redis from "ioredis"

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const rateLimiter = async (req, res, next) => {
    const key = `rate:${req.ip}`
    const limit = 10;
    const window = 60;
    
    const current = await redis.incr(key)

    if(current === 1){
        await redis.expire(key, window);
    }

    if(current > limit){
        return res.status(429).json({
            error: "Too many request",
        })
    }

    next();
}