// Multi dimensional rate limit config
// use tier * route for rate limit ans cost for every request

export const TIERS = {
    anonymous: {burst: 20, rate: 20, periodMs: 60_000},
    free: {burst: 20, rate: 20, periodMs: 60_000},
    pro: {burst: 20, rate: 20, periodMs: 60_000},
    enterprise: {burst: 20, rate: 20, periodMs: 60_000},
}

export const ROUTE_COSTS = {
    "POST /export": 20,
    "POST /search": 3,
    default: 1,
};

export function resolveLimit(tier = "anonymous") {
    return TIERS[tier] || TIERS.anonymous;
}

export function resolveCost(method, route) {
    return ROUTE_COSTS[`${method} ${route}`] || ROUTE_COSTS.default;
}