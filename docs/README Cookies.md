# Cookie Standardization and Authentication Persistence

## Problem Statement

Our application currently has inconsistent cookie handling across different parts of the codebase:

1. **Middleware** (`utils/supabase/middleware.ts`)
2. **Server Component Client** (`utils/supabase/server.ts`)
3. **Route Handler Client** (`lib/supabase/route-client.ts`)

This inconsistency causes authentication issues including:
- Sessions not persisting between page refreshes
- "alt status unknown" appearing in the UI
- The history API failing to authenticate properly
- Authentication freezing during history loading

## Implementation Plan

### ✅ Phase 1: Create a Shared Cookie Utility

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

### ✅ Phase 2: Update Authentication Client Implementations

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

### ✅ Phase 3: Add Session Health Indicators

Added explicit session health indicators via cookies and headers to help debug auth status:
- Session health cookie (`x-session-health`) for authenticated users
- Clear indication when sessions become unauthenticated
- Consistent logging of session status

### ✅ Phase 4: Enhanced Diagnostics and Circuit Breaker Management

Added comprehensive diagnostic tools to identify and resolve authentication issues:

#### ✅ Improved History Service
- Enhanced the `invalidateCache` method in `historyService` to completely reset auth state
- Fixed potential issues with history service circuit breaker logic
- Added more detailed logging for auth failure scenarios

#### ✅ Enhanced Auth Status Diagnostics
- Updated the `AuthStatusCheck` component with detailed circuit breaker information
- Added direct History API testing capability to diagnose connectivity issues
- Implemented comprehensive status display with response time metrics
- Created an interface to manually reset auth and circuit breaker states

#### ✅ Enhanced Error Recovery
- Implemented better failure detection and recovery mechanisms
- Added circuit breaker visualization to help diagnose freezing issues
- Created user-friendly controls to resolve auth issues without requiring code changes

### Phase 5: Ongoing Monitoring and Optimization

Future improvements to consider:
- Further refine circuit breaker parameters based on production data
- Implement automated recovery for common authentication edge cases
- Add admin-only monitoring dashboard for system-wide authentication health
- Consider pre-fetching mechanisms to improve perceived performance during auth challenges

## Progress Tracking

- [x] Phase 1: Create Shared Cookie Utility
- [x] Phase 2: Update Middleware Implementation
- [x] Phase 2: Update Server Component Client
- [x] Phase 2: Update Route Handler Client
- [x] Phase 3: Add Session Health Indicators
- [x] Phase 4: Enhance History Service Circuit Breaker
- [x] Phase 4: Improve Auth Diagnostics UI
- [x] Phase 4: Add Direct History API Testing
- [ ] Phase 5: Refine Circuit Breaker Parameters
- [ ] Phase 5: Implement Automated Recovery
- [ ] Phase 5: Add Admin Monitoring

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
   - User-initiated manual resets via the diagnostic UI

## Legacy Code to Review/Remove Later

1. **Direct cookie manipulation**: Any components that directly manipulate auth cookies should be updated to use the new utilities
2. **auth-store.ts**: May need updates to handle session health indicators
3. **Other middleware cookie implementations**: Any other middleware or API routes that set cookies directly
4. **Client-side cookie checking logic**: Components that check for cookie presence

## Troubleshooting Authentication Issues

If you encounter the "alt status unknown" message or see the history pane spinning indefinitely:

1. Use the AuthStatusCheck component (fixed to bottom-right of screen)
2. Click "Check" to verify authentication status
3. If authentication shows as valid but history isn't loading, click "Test API" to check direct API connection
4. If the circuit breaker is active, click "Reset Breaker" to allow history fetching to resume
5. For persistent issues, click "Reset Auth" which will log you out, then log back in

The diagnostic tool provides detailed information on what's happening with authentication, and offers direct ways to reset problematic states without requiring code changes or application restarts.
