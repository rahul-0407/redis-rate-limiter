import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

import { createRedisClient } from "./lib/redisClient.js";
import { RateLimiter } from "./lib/rateLimiter.js";
import { resolveLimit, resolveCost } from "./config/limits.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROTO_PATH = process.env.PROTO_PATH || path.join(__dirname, "../../../proto/ratelimit.proto");

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef).ratelimit;

const redis = createRedisClient({ url: process.env.REDIS_URL });
const limiter = new RateLimiter(redis, {
  failureMode: "open",
  localBucket: { capacity: 100, refillPerSec: 50 },
});

async function CheckLimit(call, callback) {
  const { entity_id, route, method, tier } = call.request;

  const key = `rl:{${entity_id}}:${route}`;
  const limit = resolveLimit(tier);
  const tokenCost = resolveCost(method, route);

  try {
    const result = await limiter.check(key, limit, tokenCost);
    callback(null, {
      allowed: result.allowed,
      remaining: result.remaining,
      retry_after_ms: result.retryAfterMs || 0,
      source: result.source,
    });
  } catch (err) {
    console.error("[rate-limit-service] unexpected error:", err);
    callback(null, { allowed: true, remaining: -1, retry_after_ms: 0, source: "fallback-open" });
  }
}

function main() {
  const server = new grpc.Server();
  server.addService(proto.RateLimitService.service, { CheckLimit });

  const port = process.env.GRPC_PORT || "50051";
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), () => {
    console.log(`[rate-limit-service] listening on :${port}`);
  });
}


main();