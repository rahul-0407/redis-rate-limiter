

import Redis from "ioredis"

export function createRedisClient({
  url = process.env.REDIS_URL || "redis://localhost:6379",
  cluster = process.env.REDIS_CLUSTER === "true",
  clusterNodes = [],
} = {}) {

    let client;

    if(cluster){
        client = new Redis.cluster(clusterNodes.length ? clusterNodes : [url], 
            {redisOptions: {enableAutoPipelining: true}});
    } else {
        client = new Redis(url, {
            enableAutoPipelining:true,
            maxRetriesPerRequest: 1,
            retryStrategy(times) {
                return Math.min(times * 50, 2000);
            },
        });
    }

    client.on("error", (err) => {
        console.log("[redis] connection error", err.message);
    })
    return client;
}