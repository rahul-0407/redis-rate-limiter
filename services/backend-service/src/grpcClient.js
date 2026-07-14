import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

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

const target = process.env.RATE_LIMIT_SERVICE_URL || "localhost:50051";
const client = new proto.RateLimitService(target, grpc.credentials.createInsecure());

const DEADLINE_MS = 1500;

export function checkLimit({ entityId, route, method, tier}) {
  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + DEADLINE_MS);
    client.CheckLimit(
      { entity_id: entityId, route, method, tier },
      { deadline },
      (err, response) => {
        if (err) {
          console.warn(`[grpc-client] rate-limit-service unreachable, failing OPEN: ${err.message}`);
          resolve({ allowed: true, remaining: -1, retryAfterMs: 0, source: "client-fallback-open" });
          return;
        }
        resolve({
          allowed: response.allowed,
          remaining: response.remaining,
          retryAfterMs: Number(response.retry_after_ms),
          source: response.source,
        });
      }
    );
  });
}