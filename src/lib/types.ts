// lib/types.ts
//
// Shared contracts. Having these as real interfaces is the whole point of
// the TS conversion — the bug we hit earlier (middleware expecting a shape
// the limiter wasn't actually returning) is exactly the class of bug
// TypeScript catches at compile time instead of at 2am in prod.

export interface Limit {
  /** max tokens absorbable in an instant burst */
  burst: number;
  /** tokens refilled per `periodMs` at steady state */
  rate: number;
  /** refill period in milliseconds */
  periodMs: number;
}

export type LimitSource = "redis" | "local" | "fallback-open" | "fallback-closed";

export interface RateLimitResult {
  allowed: boolean;
  /** tokens left; -1 means "unknown" (e.g. during fail-open) */
  remaining: number;
  retryAfterMs: number;
  resetAfterMs?: number;
  source: LimitSource;
}

export type UserTier = "anonymous" | "free" | "pro" | "enterprise";

export interface AuthedUser {
  id: string;
  tier: UserTier;
}

export interface RateLimiterMetrics {
  rejected: (key: string, source: LimitSource) => void;
  failOpen: (key: string) => void;
  failClosed: (key: string) => void;
  redisError: (err: Error) => void;
  circuitStateChange: (state: string, prev: string) => void;
}

export interface LocalBucketOptions {
  capacity: number;
  refillPerSec: number;
}

export interface RateLimiterOptions {
  failureMode?: "open" | "closed";
  failureThreshold?: number;
  resetTimeoutMs?: number;
  localBucket?: LocalBucketOptions | false;
  metrics?: Partial<RateLimiterMetrics>;
  onCircuitStateChange?: (state: string, prev: string) => void;
}