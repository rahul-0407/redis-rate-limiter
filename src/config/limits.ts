// Multi dimensional rate limit config
// use tier * route for rate limit ans cost for every request

import type { Limit, UserTier } from "../lib/types.ts";

export const TIERS: Record<UserTier, Limit> = {
    anonymous: {burst: 20, rate: 20, periodMs: 60_000},
    free: {burst: 20, rate: 20, periodMs: 60_000},
    pro: {burst: 20, rate: 20, periodMs: 60_000},
    enterprise: {burst: 20, rate: 20, periodMs: 60_000},
}

const DEFAULT_COST = 1;
export const ROUTE_COSTS: Record<string, number> = {
  "POST /export": 20,
  "POST /search": 3,
};
 
export function resolveLimit(tier: UserTier = "anonymous"): Limit {
  return TIERS[tier] ?? TIERS.anonymous;
}
 
export function resolveCost(method: string, route: string): number {
  return ROUTE_COSTS[`${method} ${route}`] ?? DEFAULT_COST;
}