# Rate Limiting and History API Optimization

## Problem

The application was experiencing a high volume of 401 Unauthorized errors from history API calls, leading to poor performance and client-side errors.

## Root Causes

1. **Authentication Race Conditions**: Multiple components mounting simultaneously during page load were making history API calls before auth state was fully propagated.

2. **Excessive Rate Limiting**: History API had strict rate limits (10 requests per minute) but client-side polling was often exceeding these limits during page transitions and component mounts.

3. **Inefficient Client Throttling**: Multiple instances of the history component were making redundant API calls without proper global coordination.

## Implemented Fixes

### 1. Enhanced Client-Side Request Throttling

Added global throttling to prevent any history request from occurring within 2 seconds of another:

```typescript
// Global request throttling
let lastHistoryRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds minimum between ANY history requests

// Inside fetchHistory method:
const now = Date.now();
const timeSinceLastRequest = now - lastHistoryRequestTime;

if (!forceRefresh && timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
  // Use cached data instead of making a new request
  console.log(`Global history request throttling: ${(MIN_REQUEST_INTERVAL - timeSinceLastRequest)/1000}s throttle`);
  return cachedData || [];
}

// Update the last request time
lastHistoryRequestTime = now;
```

### 2. Authentication-Based Rate Limiting

Modified the API middleware to apply different rate limits based on authentication state:

```typescript
// Get auth headers to apply different rate limits based on auth state
const userId = request.headers.get('x-supabase-auth');
const isAuthValid = request.headers.get('x-auth-valid') === 'true';
const isAuthenticated = userId && userId !== 'anonymous' && isAuthValid;

// Apply different rate limits based on authentication state
const historyLimiter = rateLimit(
  isAuthenticated ? 25 : 5,  // Requests per minute based on auth
  60 * 1000,                 // 1 minute window
  (req) => {
    // Include auth state in the rate limit key
    const baseId = req.headers.get('x-forwarded-for') || 
                  req.headers.get('x-real-ip') || 
                  'unknown-ip';
    return `${baseId}|${isAuthenticated ? 'auth' : 'unauth'}`;
  }
);
```

### 3. Optimized Polling Intervals

Updated the client-side polling to use longer intervals and better jitter distribution:

```typescript
// Increased polling intervals significantly
const pollingInterval = isMobile ? 
  15 * 60 * 1000 : // 15 minutes for mobile (increased from 10)
  8 * 60 * 1000;   // 8 minutes for desktop (increased from 5)

// Larger jitter window to better distribute requests
const jitter = Math.floor(Math.random() * 45000); // 0-45s jitter

// Added initial delay after component mount
const initialDelay = Math.floor(Math.random() * 5000); // 0-5s initial delay
```

### 4. Staggered Initial Requests

Added delayed initial fetches to prevent request floods during page load:

```typescript
// Initial delayed fetch after component mount
const initialFetchTimeout = setTimeout(() => {
  if (isPageVisible() && !isRefreshing && !historyService.isInAuthFailure()) {
    console.log('Running initial delayed history fetch');
    throttledFetchChatHistory(false);
  }
}, initialDelay);
```

## Benefits

1. **Reduced API Load**: Significantly decreased the number of history API calls by implementing global throttling and longer polling intervals.

2. **Improved Auth Resilience**: Different rate limits for authenticated vs. unauthenticated requests help prevent authentication-related rate limit issues.

3. **Better Request Distribution**: Staggered initial requests and increased jitter prevent request floods during page loads and transitions.

4. **Enhanced Circuit Breaker**: The existing circuit breaker pattern now works more effectively with the improved throttling.

## Monitoring Recommendations

- Monitor 401 response rates for the history API
- Check rate limit hits in the server logs
- Watch for circuit breaker activations in client logs
- Track average polling intervals to ensure they remain within expected ranges