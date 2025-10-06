# Rate Limit System Documentation

## Overview

The new intelligent rate limiter ensures we **never** get rate limited by PoE's trade history API. It respects server-provided headers and maintains a local budget to use only 80% of the allowed capacity.

## How It Works

### 1. **Server Rate Limit Rules**
PoE provides three time windows with different limits:
```
x-rate-limit-account: 5:60:60,10:600:120,15:10800:3600
```

This means:
- **5 requests per 60 seconds** (1-minute window)
- **10 requests per 600 seconds** (10-minute window)
- **15 requests per 10800 seconds** (3-hour window)

### 2. **Server Current State**
```
x-rate-limit-account-state: 1:60:0,1:600:0,43:10800:3600
```

This tells us:
- **1 request remaining** in the 1-minute window (resets in 0 seconds)
- **1 request remaining** in the 10-minute window (resets in 0 seconds)
- **43 requests remaining** in the 3-hour window (resets in 3600 seconds)

### 3. **429 Response**
When rate limited, the server sends:
```
retry-after: 3600
```
This means wait 1 hour before retrying.

## Our Solution

### Safety Margin (80% Budget)
Instead of using 100% of the limit, we only use **80%**:
- 1-minute: Use 4 out of 5 allowed (80%)
- 10-minute: Use 8 out of 10 allowed (80%)
- 3-hour: Use 12 out of 15 allowed (80%)

This gives us a buffer for manual refreshes and edge cases.

### Dual Tracking
1. **Local Tracking**: We track all requests locally in memory
2. **Server State**: We respect server-provided remaining counts

Before each request, we check BOTH:
- If local tracking says we've hit 80% → BLOCK
- If server state says we're low → BLOCK
- Otherwise → ALLOW

### Request History
We maintain a rolling history of request timestamps:
```typescript
requestHistory: number[] = [timestamp1, timestamp2, ...]
```

For each time window, we count how many requests fall within it.

### Pre-Flight Checks
**Before** making any API call, we check:
```typescript
const budget = rateLimiter.canRequest();
if (!budget.canRequest) {
  // Don't make the request
  return { rateLimited: true, retryAfter: budget.retryAfter };
}
```

This prevents us from even attempting a request that would be rate limited.

### Post-Request Updates
**After** a successful request, we:
1. Record the request timestamp
2. Update rules from `x-rate-limit-account` header
3. Update state from `x-rate-limit-account-state` header

**After** a 429 response, we:
1. Extract `retry-after` seconds
2. Block ALL requests until that time passes

## Example Scenario

### Initial State
- No requests made yet
- All budgets at 100%

### After 3 Requests in 1 Minute
- 1-minute window: 3/4 used (75%) ✅ Still OK
- 10-minute window: 3/8 used (37%) ✅ Still OK
- 3-hour window: 3/12 used (25%) ✅ Still OK

### After 4 Requests in 1 Minute
- 1-minute window: 4/4 used (100%) ⚠️ **BUDGET EXHAUSTED**
- Next request blocked for ~60 seconds until window resets

### After 12 Requests in 3 Hours
- 3-hour window: 12/12 used (100%) ⚠️ **BUDGET EXHAUSTED**
- Next request blocked until oldest request is >3 hours old

## Benefits

1. **Never Hit 429**: Pre-flight checks prevent rate limit errors
2. **Smart Distribution**: Tracks multiple time windows simultaneously
3. **Manual Refresh Safe**: 80% budget leaves room for user clicks
4. **Server Sync**: Updates limits based on actual server responses
5. **Transparent**: Shows exact status in UI

## UI Integration

### Rate Limit Badge
Shows countdown when rate limited:
```
"Rate limited • 15m 23s"
```

### Refresh Button
Disabled when budget exhausted, shows tooltip:
```
"Rate limit: retry in 15m 23s"
```

### Debug Status
Console logs show current usage:
```
Rate Limit Status:
  1min: 3/4 used (server: 2/5)
  10min: 5/8 used (server: 5/10)
  3hr: 8/12 used (server: 7/15)
```

## Future Enhancements

1. **Persistent Storage**: Save request history across app restarts
2. **Predictive Alerts**: Warn user when approaching limits
3. **Smart Scheduling**: Queue requests to maximize throughput
4. **Per-League Tracking**: Separate budgets for different leagues

## Testing Notes

To verify the system works:
1. Enable console logging in rate limiter
2. Make multiple rapid refreshes
3. Observe pre-flight blocks before hitting server
4. Check that 429 never occurs
