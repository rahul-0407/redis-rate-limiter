import Redis from "ioredis";

export function createRedisClient({
  url = process.env.REDIS_URL || "redis://localhost:6379",
  sentinels = process.env.REDIS_SENTINELS, 
  sentinelName = process.env.REDIS_SENTINEL_MASTER_NAME || "mymaster",
  cluster = process.env.REDIS_CLUSTER === "true",
  clusterNodes = [],
} = {}) {
  let client;

  if (sentinels) {
    const sentinelList = sentinels.split(",").map((s) => {
      const [host, port] = s.trim().split(":");
      return { host, port: Number(port) };
    });
    client = new Redis({
      sentinels: sentinelList,
      name: sentinelName, 
      enableAutoPipelining: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
    });
  } else if (cluster) {
    client = new Redis.Cluster(clusterNodes.length ? clusterNodes : [url], {
      redisOptions: { enableAutoPipelining: true },
    });
  } else {
    client = new Redis(url, {
      enableAutoPipelining: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        return Math.min(times * 50, 2000);
      },
    });
  }

  client.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });
  client.on("reconnecting", () => {
    console.warn("[redis] reconnecting...");
  });

  return client;
}