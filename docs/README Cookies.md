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

### ✅ Phase 4: Enhanced Diagnostics and Circuit Breaker Management (COMPLETED)

#### ✅ Improved History Service
- Enhanced the `invalidateCache` method in `historyService` to reset auth state
- Implemented Cockatiel circuit breaker logic in `historyService.ts`
- Added more detailed logging for auth failure scenarios
- Added event listeners for monitoring circuit breaker state changes

#### ✅ Enhanced Dev Environment Diagnostics
- Created a new `CircuitBreakerDebug` component for development use only
- Provides real-time monitoring of circuit breaker state
- Enables manual reset and isolation for testing
- Integrated cleanly into the application header for easy access

#### ✅ Enhanced Error Recovery
- Replaced overly aggressive custom circuit breaker with Cockatiel
- Implemented reasonable thresholds (30 second recovery, 5 consecutive failures)
- Added proper event-based monitoring for better diagnosis
- Improved user experience by reducing unnecessary service disruptions

## Circuit Breaker Implementation with Cockatiel

We've successfully replaced the custom circuit breaker implementation with Cockatiel, a modern resilience library. Cockatiel is a lightweight ESM-compatible library for resilience patterns like circuit breakers, retries, and timeouts.

### Why Cockatiel?

1. **Standards Compliance**:
   - Uses modern ESM syntax compatible with Next.js 15
   - No dependencies (lightweight at ~10KB minified & gzipped)
   - Written in TypeScript with full type definitions

2. **Better Features**:
   - Multiple circuit breaker strategies (consecutive failures, failure percentage)
   - Built-in event system for monitoring state changes
   - Automatic half-open state testing
   - Composable with other resilience patterns

3. **Integration Benefits**:
   - Works with our ESM-based codebase
   - Simpler implementation with less custom code
   - Better monitoring capabilities
   - More flexible configuration

### Completed Implementation

1. **✅ Installed Cockatiel**:
   ```bash
   npm install --save cockatiel
   ```

2. **✅ Updated History Service**:
   - Replaced custom circuit breaker with Cockatiel's implementation
   - Implemented event listeners for monitoring circuit breaker state
   - Set reasonable thresholds: 30 seconds half-open timeout, 5 consecutive failures
   - Exposed methods for debugging and manual control
   - Fixed type definitions and made compatible with TypeScript

3. **✅ Created Debug UI for Development**:
   - Implemented `CircuitBreakerDebug` component that shows circuit state
   - Added controls for manual circuit breaker reset and isolation
   - Display-only in development environment
   - Integrated into application header for easy access
   - Added both inline and floating display options

4. **✅ Updated Documentation**:
   - Documented new circuit breaker behavior
   - Explained troubleshooting steps
   - Provided monitoring guidance

### Specific Improvements with Cockatiel

1. **More Reasonable Thresholds**:
   - Half-open timeout of 30 seconds (vs. previous 30 minutes max backoff)
   - 5 consecutive failures threshold (vs. previous 3)
   - Event-based monitoring instead of polling

2. **Better Control**:
   - Manual reset capability through exposed API
   - Manual isolation for testing
   - Comprehensive state information

3. **Simplified Development**:
   - Less custom code to maintain
   - Standard library with community support
   - Better diagnostics through events
   - Developer UI for monitoring and control during development

## Maintenance and Troubleshooting

1. **Monitoring Circuit Breaker State**:
   - In development, use the circuit breaker debug UI in the application header
   - Check console logs for circuit breaker events (open, half-open, closed, reset)
   - Monitor API response patterns for 401/403 errors

2. **Manual Intervention**:
   - In development, use the circuit breaker debug UI to reset or isolate the circuit
   - In production, adding a similar admin-only control would require additional implementation

3. **Tuning Parameters**:
   - Circuit breaker parameters can be adjusted in `history-service.ts`
   - Current settings (30 second half-open, 5 consecutive failures) are conservative

## Additional Considerations

1. **Cookie Store Source**: Each implementation now uses the correct cookie store source:
   - Middleware: `request.cookies` and `supabaseResponse.cookies`
   - Server Components: `cookies()` from next/headers
   - Route Handlers: `cookies()` from next/headers

2. **Type Safety**: We're using `any` for the cookieStore parameter in `setEnhancedCookie` for pragmatic reasons, as the underlying cookie store implementations differ slightly between contexts.

3. **Circuit Breaker Logic**: Successfully replaced with Cockatiel which provides:
   - Event-based monitoring
   - Multiple circuit breaker strategies
   - Composable policies for complex resilience patterns
   - Better controls for manual intervention

## Troubleshooting Authentication Issues

If you encounter authentication issues:

1. Clear browser cookies and local storage
2. Refresh the page completely
3. If history still doesn't load, check the browser console for circuit breaker messages
4. In development, use the circuit breaker debug UI to manually reset the circuit breaker
5. Check network requests for authentication-related errors (401/403 status codes)
