# Cookie Standardization and Authentication Persistence

## Problem Statement

Our application previously had inconsistent cookie handling across different parts of the codebase:

1. **Middleware** (`utils/supabase/middleware.ts`)
2. **Server Component Client** (`utils/supabase/server.ts`)
3. **Route Handler Client** (`lib/supabase/route-client.ts`)

This inconsistency caused authentication issues including:
- Sessions not persisting between page refreshes
- "alt status unknown" appearing in the UI
- The history API failing to authenticate properly
- Authentication freezing during history loading

## Implementation Status

### ✅ Phase 1: Create a Shared Cookie Utility (COMPLETED)

Created a standardized cookie utility at `lib/supabase/cookie-utils.ts` that:
- Provides consistent cookie attributes
- Includes proper error handling
- Follows Supabase's SSR best practices
- Logs cookie operations for debugging

The utility includes:
- `getStandardCookieOptions`: Provides consistent cookie settings with proper security attributes
- `setEnhancedCookie`: Enhanced cookie setter with error handling and logging
- `setEnhancedCookies`: Batch cookie setting with aggregated logging
- `createStandardCookieHandler`: Creates a standard cookie handler for Supabase client implementations

### ✅ Phase 2: Update Authentication Client Implementations (COMPLETED)

#### ✅ Middleware (`utils/supabase/middleware.ts`)

Updated the middleware to use our new cookie utility, ensuring proper cookie store handling:
- Replaced direct cookie setting with `setEnhancedCookie`
- Standardized all cookie attributes
- Improved logging with consistent categories
- Used `createStandardCookieHandler` for the middleware client

#### ✅ Server Components (`utils/supabase/server.ts`)

Updated the server component client to use the shared cookie utility:
- Replaced custom cookie handling with `createStandardCookieHandler`
- Ensured consistent error handling
- Unified logging categories

#### ✅ Route Handlers (`lib/supabase/route-client.ts`)

Updated route handler client to use the shared cookie utility:
- Replaced custom cookie implementation with `createStandardCookieHandler`
- Simplified code while maintaining functionality
- Ensured consistent cookie attributes

### ✅ Phase 3: Add Session Health Indicators (COMPLETED)

Added explicit session health indicators via cookies and headers to help debug auth status:
- Session health cookie (`x-session-health`) for authenticated users
- Clear indication when sessions become unauthenticated
- Consistent logging of session status

### ⚠️ Phase 4: Enhanced Diagnostics and Circuit Breaker Management (PARTIALLY COMPLETED)

#### ✅ Improved History Service
- Enhanced the `invalidateCache` method in `historyService` to reset auth state
- Implemented circuit breaker logic in `historyService.ts`
- Added more detailed logging for auth failure scenarios

#### ❌ Enhanced Auth Status Diagnostics
- The `AuthStatusCheck` component (previously at `components/auth-status-check.tsx`) has been removed/deprecated
- Placeholder component exists but returns null
- The diagnostic UI described in the README is no longer present

#### ⚠️ Enhanced Error Recovery
- Circuit breaker logic is implemented but may be too aggressive
- Some UI controls for manual reset are no longer available
- Error recovery is primarily handled through middleware and API route handlers

### ⬜ Phase 5: Ongoing Monitoring and Optimization (NOT STARTED)

Future improvements to consider:
- ⬜ Refine Circuit Breaker Parameters based on production data
- ⬜ Implement Automated Recovery for common authentication edge cases
- ⬜ Add Admin Monitoring dashboard for system-wide authentication health
- ⬜ Consider pre-fetching mechanisms to improve perceived performance during auth challenges

## Simplified Approach to Circuit Breaker Logic

Based on our review, here's a simplified approach to the circuit breaker logic that would maintain its benefits while reducing potential issues:

### Recommended Simplifications:

1. **Increase Failure Thresholds**: 
   - Increase `UNAUTHORIZED_THRESHOLD` from 3 to 5 failed requests
   - Increase `UNAUTHORIZED_WINDOW` from 5 seconds to 10 seconds
   - This reduces the chance of triggering the circuit breaker during normal transient failures

2. **Reduce Backoff Duration**:
   - Decrease `MIN_AUTH_COOLDOWN` from 2 minutes to 30 seconds
   - Decrease `MAX_AUTH_COOLDOWN` from 30 minutes to 5 minutes
   - This ensures users aren't locked out for extended periods

3. **Add Manual Reset Capability**:
   - Add a simple function to reset the circuit breaker state directly
   - Example implementation:
   ```javascript
   // Add to historyService
   resetCircuitBreaker(): void {
     isInAuthFailureCooldown = false;
     authFailureCount = 0;
     authBackoffDuration = MIN_AUTH_COOLDOWN;
     
     // Clear all failure-related flags in persistent storage
     clientCache.set(AUTH_FAILURE_KEY, false, Infinity, true);
     clientCache.set(AUTH_FAILURE_COUNT_KEY, 0, Infinity, true);
     clientCache.remove(AUTH_FAILURE_LAST_TIME_KEY, true);
     clientCache.set(AUTH_BACKOFF_DURATION_KEY, MIN_AUTH_COOLDOWN, Infinity, true);
     
     // Clear any timers
     if (authFailureTimer) {
       clearTimeout(authFailureTimer);
       authFailureTimer = null;
     }
     
     // Also reset unauthorized request tracking
     recentUnauthorizedRequests = [];
     
     // Force cache invalidation to trigger a fresh fetch
     this.invalidateCache();
   }
   ```

4. **Feature Flag Option**:
   - Add the ability to disable the circuit breaker entirely through a feature flag
   - Example implementation: 
   ```javascript
   const CIRCUIT_BREAKER_ENABLED = localStorage.getItem('circuit_breaker_enabled') !== 'false';
   
   // Then in isInAuthFailure():
   isInAuthFailure(): boolean {
     if (!CIRCUIT_BREAKER_ENABLED) return false;
     // Rest of existing logic...
   }
   ```

## Next Steps

1. **Reimplement Auth Status Check UI**: Consider reimplementing a simplified version of the AuthStatusCheck component for debugging in development
   
2. **Expose Circuit Breaker Controls**: Add a way for users to manually reset the circuit breaker when history loading fails

3. **Review Circuit Breaker Parameters**: Adjust the circuit breaker parameters based on the recommendations above
   
4. **Add Admin Monitoring**: Implement the admin monitoring dashboard from Phase 5 to track auth issues across users

## Additional Considerations

1. **Cookie Store Source**: Each implementation now uses the correct cookie store source:
   - Middleware: `request.cookies` and `supabaseResponse.cookies`
   - Server Components: `cookies()` from next/headers
   - Route Handlers: `cookies()` from next/headers

2. **Type Safety**: We're using `any` for the cookieStore parameter in `setEnhancedCookie` for pragmatic reasons, as the underlying cookie store implementations differ slightly between contexts.

3. **Circuit Breaker Logic**: The circuit breaker in `lib/api/history-service.ts` has been enhanced to include:
   - Complete cache invalidation
   - Reset of failure counters
   - Exponential backoff with reasonable limits
   - But may benefit from the simplifications suggested above

## Troubleshooting Authentication Issues

If you encounter authentication issues:

1. Clear browser cookies and local storage
2. Refresh the page completely
3. If history still doesn't load, check the browser console for circuit breaker messages
4. To force reset the circuit breaker, run this in console:
   ```
   localStorage.removeItem('auth_failure_key');
   localStorage.removeItem('auth_failure_count');
   localStorage.removeItem('auth_failure_last_time');
   localStorage.removeItem('auth_backoff_duration');
   location.reload();
   ```

Currently there's no UI for manual reset as the AuthStatusCheck component has been removed. Consider reimplementing a simplified version if debugging continues to be challenging.
