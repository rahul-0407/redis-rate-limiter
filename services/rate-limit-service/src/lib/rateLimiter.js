import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GCRA_SCRIPT = fs.readFileSync(path.join(__dirname, "gcra.lua"), "utf8");

// Local per-instance token bucket for shed egregious abuse 
// (a client hammering thousands of req/sec) before it even reaches Redis.
class LocalBucket {
  constructor({ capacity, refillPerSec }) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.buckets = new Map();
    this.sweepInterval = setInterval(() => this._sweep(), 60_000).unref();
  }

  tryConsume(key, cost = 1) {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, last: now };
      this.buckets.set(key, b);
    }
    const elapsed = (now - b.last) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSec);
    b.last = now;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      return true;
    }
    return false;
  }

  _sweep() {
    const cutoff = Date.now() - 5 * 60_000;
    for (const [k, v] of this.buckets) {
      if (v.last < cutoff) this.buckets.delete(k);
    }
  }
}


// Circuit breaker around Redis calls.
// Closed  -> calls go through normally.
// Open    -> we skip Redis entirely and fail open/closed per config, for
//            `resetTimeoutMs` before trying again (half-open probe).

class CircuitBreaker {
  constructor({ failureThreshold = 5, resetTimeoutMs = 10_000, onStateChange } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.onStateChange = onStateChange || (() => {});
    this.state = "closed";
    this.failures = 0;
    this.nextAttempt = 0;
  }

  async exec(fn, fallback) {
    if (this.state === "open") {
      if (Date.now() < this.nextAttempt) return fallback();
      this.state = "half-open";
    }
    try {
      const result = await fn();
      if (this.state === "half-open") this._transition("closed");
      this.failures = 0;
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.failureThreshold) {
        this.nextAttempt = Date.now() + this.resetTimeoutMs;
        this._transition("open");
      }
      return fallback(err);
    }
  }

  _transition(state) {
    if (this.state !== state) this.onStateChange(state, this.state);
    this.state = state;
  }
}



// Main rate limiter class
export class RateLimiter {
  constructor(redis, opts = {}) {
    this.redis = redis;
    this.failureMode = opts.failureMode || "open"; 
    this.metrics = opts.metrics || defaultMetrics();

    this.breaker = new CircuitBreaker({
      failureThreshold: opts.failureThreshold ?? 5,
      resetTimeoutMs: opts.resetTimeoutMs ?? 10_000,
      onStateChange: (state, prev) => {
        this.metrics.circuitStateChange?.(state, prev);
        opts.onCircuitStateChange?.(state, prev);
      },
    });

    this.local =
      opts.localBucket === false
        ? null
        : new LocalBucket(opts.localBucket || { capacity: 50, refillPerSec: 20 });

    this.redis.defineCommand("gcra", { numberOfKeys: 1, lua: GCRA_SCRIPT });
  }


  async check(key, limit, cost = 1) {
    if (this.local && !this.local.tryConsume(key, cost)) {
      this.metrics.rejected(key, "local");
      return { allowed: false, remaining: 0, retryAfterMs: 1000, source: "local" };
    }

    const now = Date.now();
    const fallback = (err) => {
      if (err) this.metrics.redisError(err);
      if (this.failureMode === "open") {
        this.metrics.failOpen(key);
        return { allowed: true, remaining: -1, retryAfterMs: 0, source: "fallback-open" };
      }
      this.metrics.failClosed(key);
      return { allowed: false, remaining: 0, retryAfterMs: 1000, source: "fallback-closed" };
    };

    const result = await this.breaker.exec(async () => {
      const [allowed, remaining, retryAfterMs, resetAfterMs] = await this.redis.gcra(
        key,
        limit.burst,
        limit.rate,
        limit.periodMs,
        cost,
        now
      );
      return {
        allowed: allowed === 1,
        remaining,
        retryAfterMs,
        resetAfterMs,
        source: "redis",
      };
    }, fallback);

    if (!result.allowed) this.metrics.rejected(key, result.source);
    return result;
  }
}

function defaultMetrics() {
  return {
    rejected: (key, source) => {},
    failOpen: (key) => console.warn(`[rate-limiter] Redis down, failing OPEN for ${key}`),
    failClosed: (key) => console.warn(`[rate-limiter] Redis down, failing CLOSED for ${key}`),
    redisError: (err) => {},
    circuitStateChange: (state, prev) =>
      console.warn(`[rate-limiter] circuit ${prev} -> ${state}`),
  };
}