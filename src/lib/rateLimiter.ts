


import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RedisLike } from "./redisClient.ts";
import type {
  Limit,
  RateLimitResult,
  RateLimiterMetrics,
  RateLimiterOptions,
  LocalBucketOptions,
} from "./types.js";
 
const __dirname = dirname(fileURLToPath(import.meta.url));
const GCRA_SCRIPT = fs.readFileSync(path.join(__dirname, "gcra.lua"), "utf8");
interface BucketState {
  tokens: number;
  last: number;
}
 
class LocalBucket {
  private capacity: number;
  private refillPerSec: number;
  private buckets = new Map<string, BucketState>();
 
  constructor({ capacity, refillPerSec }: LocalBucketOptions) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    setInterval(() => this.sweep(), 60_000).unref();
  }
 
  tryConsume(key: string, cost = 1): boolean {
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
 
  private sweep(): void {
    const cutoff = Date.now() - 5 * 60_000;
    for (const [k, v] of this.buckets) {
      if (v.last < cutoff) this.buckets.delete(k);
    }
  }
}


type CircuitState = "closed" | "open" | "half-open";
 
class CircuitBreaker {
  private failureThreshold: number;
  private resetTimeoutMs: number;
  private onStateChange: (state: string, prev: string) => void;
  private state: CircuitState = "closed";
  private failures = 0;
  private nextAttempt = 0;
 
  constructor(opts: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    onStateChange?: (state: string, prev: string) => void;
  } = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 10_000;
    this.onStateChange = opts.onStateChange ?? (() => {});
  }
 
  async exec<T>(fn: () => Promise<T>, fallback: (err?: Error) => T): Promise<T> {
    if (this.state === "open") {
      if (Date.now() < this.nextAttempt) return fallback();
      this.state = "half-open";
    }
    try {
      const result = await fn();
      if (this.state === "half-open") this.transition("closed");
      this.failures = 0;
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.failureThreshold) {
        this.nextAttempt = Date.now() + this.resetTimeoutMs;
        this.transition("open");
      }
      return fallback(err as Error);
    }
  }
 
  private transition(state: CircuitState): void {
    if (this.state !== state) this.onStateChange(state, this.state);
    this.state = state;
  }
}


function defaultMetrics(): RateLimiterMetrics {
  return {
    rejected: () => {},
    failOpen: (key) => console.warn(`[rate-limiter] Redis down, failing OPEN for ${key}`),
    failClosed: (key) => console.warn(`[rate-limiter] Redis down, failing CLOSED for ${key}`),
    redisError: () => {},
    circuitStateChange: (state, prev) => console.warn(`[rate-limiter] circuit ${prev} -> ${state}`),
  };
}






export class RateLimiter {
  private redis: RedisLike;
  private failureMode: "open" | "closed";
  private metrics: RateLimiterMetrics;
  private breaker: CircuitBreaker;
  private local: LocalBucket | null;
 
  constructor(redis: RedisLike, opts: RateLimiterOptions = {}) {
    this.redis = redis;
    this.failureMode = opts.failureMode ?? "open"; // fail-open by default (Stripe's choice)
 
    const defaults = defaultMetrics();
    this.metrics = { ...defaults, ...opts.metrics };
 
    this.breaker = new CircuitBreaker({
      failureThreshold: opts.failureThreshold ?? 5,
      resetTimeoutMs: opts.resetTimeoutMs ?? 10_000,
      onStateChange: (state, prev) => {
        this.metrics.circuitStateChange(state, prev);
        opts.onCircuitStateChange?.(state, prev);
      },
    });
 
    this.local =
      opts.localBucket === false
        ? null
        : new LocalBucket(opts.localBucket ?? { capacity: 50, refillPerSec: 20 });
 
    this.redis.defineCommand("gcra", { numberOfKeys: 1, lua: GCRA_SCRIPT });
  }
 
  /**
   * Check (and consume) rate limit for a composite key.
   * @param key  e.g. `rl:{userId}:/route`
   * @param limit  {burst, rate, periodMs}
   * @param cost  token cost of this request (default 1)
   */
  async check(key: string, limit: Limit, cost = 1): Promise<RateLimitResult> {
    if (this.local && !this.local.tryConsume(key, cost)) {
      this.metrics.rejected(key, "local");
      return { allowed: false, remaining: 0, retryAfterMs: 1000, source: "local" };
    }
 
    const now = Date.now();
 
    const fallback = (err?: Error): RateLimitResult => {
      if (err) this.metrics.redisError(err);
      if (this.failureMode === "open") {
        this.metrics.failOpen(key);
        return { allowed: true, remaining: -1, retryAfterMs: 0, source: "fallback-open" };
      }
      this.metrics.failClosed(key);
      return { allowed: false, remaining: 0, retryAfterMs: 1000, source: "fallback-closed" };
    };
 
    const result = await this.breaker.exec<RateLimitResult>(async () => {
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