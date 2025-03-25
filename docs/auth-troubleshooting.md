# Authentication Troubleshooting Guide

## Common Authentication Issues

If you're experiencing authentication issues with the application, use this guide to identify and resolve the problems.

## CRITICAL FIX: Auth Readiness Implementation

We've implemented an auth readiness pattern to prevent unauthorized API calls. This is particularly important for the history API which was experiencing 401 errors.

### The Core Problem

The main issue was a race condition where components were making API requests before authentication was fully established:

1. **Race Condition**: API requests being made before auth middleware completed processing
2. **Cookie Presence vs. Validity**: Auth cookies were present but not yet processed
3. **Multiple Components**: Different components making concurrent requests

### The Solution

We've implemented a comprehensive solution with these key components:

1. **Auth Readiness Headers**: Middleware now sets explicit headers when auth is ready
   ```javascript
   request.headers.set('x-auth-ready', 'true');
   supabaseResponse.headers.set('x-auth-ready', 'true');
   request.headers.set('x-auth-ready-time', authTimestamp);
   supabaseResponse.headers.set('x-auth-ready-time', authTimestamp);
   ```

2. **Auth Readiness Check**: A new method in historyService checks if auth is ready
   ```javascript
   async isAuthReady(): Promise<boolean> {
     // Make a lightweight request to probe auth status
     const probe = await fetch('/api/chat/test-permissions', {
       credentials: 'include',
       cache: 'no-store'
     });
     
     // Check if we got the auth-ready header
     return probe.headers.get('x-auth-ready') === 'true';
   }
   ```

3. **Wait for Auth Before API Calls**: Components now wait for auth to be ready
   ```javascript
   const authReady = await historyService.isAuthReady();
   if (!authReady) {
     console.log('Auth not ready yet, waiting before fetching...');
     // Retry with exponential backoff
     const retryDelay = Math.min(2000 + Math.random() * 1000, 8000);
     setTimeout(() => { fetchData() }, retryDelay);
     return [];
   }
   ```

## Symptom: 401 Unauthorized Errors in API Calls

### Possible Causes

1. **Missing or Invalid Auth Cookies**
   - Supabase auth tokens not present in cookies
   - Authentication cookies have expired
   - CSRF protection preventing cookies from being sent

2. **Middleware Configuration**
   - Route not included in middleware matcher config
   - Headers not being set correctly

3. **Fetch Configuration Issues**
   - Missing `credentials: 'include'` in fetch calls
   - Wrong `mode` setting in fetch calls
   - Cache-related issues preventing fresh auth checks

4. **Racing Condition** (Now Fixed)
   - Requests being made before auth is fully established
   - Missing auth readiness check

### Diagnostic Steps

1. **Check Browser DevTools**
   - Look for Supabase auth cookies in Application > Cookies
   - Check for 401 responses in Network tab
   - Examine request headers to verify credentials are being sent
   - Look for `x-auth-ready` header in responses

2. **Check Server Logs**
   - Look for logs mentioning "User not authenticated"
   - Check header values being logged in history API
   - Look for successful auth in other parts of the application

3. **Test Auth Readiness**
   - Use `historyService.isAuthReady()` to check auth status
   - Check network requests to `/api/chat/test-permissions`
   - Verify circuit breaker status with `historyService.isInAuthFailure()`

## Solutions

### Client-Side Fixes

1. **Always check auth readiness before making API calls**:
   ```javascript
   const authReady = await historyService.isAuthReady();
   if (!authReady) {
     // Handle auth not ready - retry with backoff
     return cachedData || [];
   }
   ```

2. **Update fetch calls with proper auth configuration**:
   ```javascript
   fetch(url, {
     credentials: 'include',     // Include cookies for auth
     mode: 'same-origin',        // Ensure cookies are sent
     cache: 'no-store',          // Prevent caching issues
     headers: {
       'Cache-Control': 'no-cache' // Force fresh request
     }
   })
   ```

3. **Add cache-busting timestamp to URLs**:
   ```javascript
   const timestamp = Date.now();
   fetch(`/api/endpoint?t=${timestamp}`, { ... })
   ```

4. **Implement exponential backoff for retries**:
   ```javascript
   const retryDelay = Math.min(2000 + Math.random() * 1000, 8000);
   setTimeout(() => { fetchData() }, retryDelay);
   ```

### Server-Side Fixes

1. **Set auth readiness headers in middleware**:
   ```javascript
   request.headers.set('x-auth-ready', 'true');
   supabaseResponse.headers.set('x-auth-ready', 'true');
   ```

2. **Update middleware matcher config** to include API routes:
   ```javascript
   export const config = {
     matcher: [
       // ...existing matchers
       '/api/history/:path*'
     ]
   }
   ```

3. **Set explicit headers for both auth states** in middleware:
   ```javascript
   if (user) {
     // Set authenticated headers
     request.headers.set('x-auth-state', 'authenticated');
   } else {
     // Set explicit unauthenticated headers
     request.headers.set('x-supabase-auth', 'anonymous');
     request.headers.set('x-auth-valid', 'false');
     request.headers.set('x-auth-state', 'unauthenticated');
   }
   ```

4. **Implement dual authentication** in API routes:
   ```javascript
   // Try middleware headers first
   const userId = request.headers.get('x-supabase-auth');
   const isAuthValid = request.headers.get('x-auth-valid') === 'true';
   
   if (userId && userId !== 'anonymous' && isAuthValid) {
     // Use userId from headers
   } else {
     // Fall back to direct Supabase auth
     const { data: { user } } = await supabase.auth.getUser();
     if (user) {
       // Use user.id
     }
   }
   ```

## Advanced: Auth State Debugging

If you need to debug authentication issues more deeply:

1. **Check Auth Readiness State**:
   ```javascript
   // In browser console
   await historyService.isAuthReady();  // Should return true when auth is ready
   ```

2. **Use the Network Monitor**:
   - Filter for auth-related requests
   - Check for `x-auth-ready: true` header in responses
   - Look for `auth_ready=true` parameter in URLs

3. **Check Auth Headers in Response**:
   ```javascript
   // Make a test request and examine headers
   const response = await fetch('/api/chat/test-permissions', {
     credentials: 'include'
   });
   
   console.log('Auth ready:', response.headers.get('x-auth-ready'));
   console.log('Auth state:', response.headers.get('x-auth-state'));
   console.log('Auth time:', response.headers.get('x-auth-time'));
   ```

## Best Practices

- **Always check auth readiness** before making authenticated API calls
- Use **exponential backoff with randomness** for retry attempts
- Set **explicit headers for both authenticated and anonymous states**
- Include **timestamps in requests** to avoid caching issues
- Implement **graceful degradation for auth failures**
- Use **dual authentication** for critical API routes
- Add **circuit breaker pattern** to prevent request floods during auth issues