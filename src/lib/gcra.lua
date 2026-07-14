-- Atomic GCRA (Generic Cell Rate Algorithm) rate limiter for Redis.
-- This is executed as a single EVAL so the read-modify-write is atomic no race condition between concurrent requests, no WATCH/MULTI needed.

local key = KEYS[1]
local burst  = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local period_ms = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local now = tonumber(ARGV[5])

local emission_interval = period_ms / rate
local increment = emission_interval * cost

local delay_tolerance = emission_interval * burst

local tat = tonumber(redis.call('GET', key))
if tat == nil then
    tat = now
end
tat = math.max(tat, now)

local new_tat = tat + increment
local allow_at = new_tat - delay_tolerance

if allow_at > now then
    local retry_after_ms = allow_at - now
    local reset_after_ms = tat - now
    return { 0, 0, retry_after_ms, reset_after_ms }
end

local ttl_ms = math.ceil((new_tat - now) + delay_tolerance)
redis.call('SET', key, new_tat, 'PX', ttl_ms)

local remaining = math.floor((delay_tolerance - (new_tat - now)) / emission_interval)
if remaining < 0 then remaining = 0 end

return {1, remaining, 0, new_tat - now}
