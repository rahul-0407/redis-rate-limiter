
import { Redis as RedisClient, Cluster } from "ioredis";

declare module "ioredis" {
  interface RedisCommander<Context> {
    gcra(
      key: string,
      burst: number,
      rate: number,
      periodMs: number,
      cost: number,
      nowMs: number
    ): Promise<[allowed: number, remaining: number, retryAfterMs: number, resetAfterMs: number]>;
  }
}

export type RedisLike = RedisClient | Cluster;

export interface RedisClientOptions {
  url?: string;
  cluster?: boolean;
  clusterNodes?: string[];
}

export function createRedisClient({
  url = process.env.REDIS_URL || "redis://localhost:6379",
  cluster = process.env.REDIS_CLUSTER === "true",
  clusterNodes = [],
}: RedisClientOptions = {}): RedisLike {
  if (cluster) {

    const client = new Cluster(clusterNodes.length ? clusterNodes : [url], {
      redisOptions: { enableAutoPipelining: true },
    });

    client.on("error", (err: Error) => {
      console.error("[redis] connection error:", err.message);
    });

    return client;
  }

  const client = new RedisClient(url, {
    enableAutoPipelining: true,
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
      return Math.min(times * 50, 2000);
    },
  });

  client.on("error", (err: Error) => {
    console.error("[redis] connection error:", err.message);
  });

  return client;
}