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

### ⚠️ Phase 4: Enhanced Diagnostics and Circuit Breaker Management (UPDATING)

#### ✅ Improved History Service
- Enhanced the `invalidateCache` method in `historyService` to reset auth state
- Implemented circuit breaker logic in `historyService.ts`
- Added more detailed logging for auth failure scenarios

#### ❌ Enhanced Auth Status Diagnostics
- The `AuthStatusCheck` component (previously at `components/auth-status-check.tsx`) has been removed/deprecated
- Placeholder component exists but returns null
- The diagnostic UI described in the README is no longer present

#### ⚠️ Enhanced Error Recovery
- Current circuit breaker logic is too aggressive
- Some UI controls for manual reset are no longer available
- Error recovery is primarily handled through middleware and API route handlers

## Circuit Breaker Modernization with Cockatiel

After reviewing the existing circuit breaker implementation, we've decided to replace it with Cockatiel, a modern resilience library. Cockatiel is a lightweight ESM-compatible library for resilience patterns like circuit breakers, retries, and timeouts.

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

### Implementation Plan for Cockatiel

1. **Install Cockatiel**:
   ```bash
   npm install --save cockatiel
   ```

2. **Update History Service**:
   - Replace custom circuit breaker with Cockatiel implementation
   - Implement proper event listeners for monitoring
   - Set reasonable thresholds and timeouts
   - Expose methods for manual control

3. **Create Debug UI for Development**:
   - Implement a minimal debug component that shows circuit state
   - Add controls for manual circuit breaker management
   - Only display in development environment

4. **Update Documentation**:
   - Document new circuit breaker behavior
   - Explain troubleshooting steps
   - Provide monitoring guidance

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

## Next Steps

1. **Implement Cockatiel Circuit Breaker**: Replace custom implementation with Cockatiel in the history service
   
2. **Add Development Debug UI**: Create a minimal debug component for development environment

3. **Test Circuit Breaker Behavior**: Verify proper functioning with realistic failure scenarios
   
4. **Documentation**: Update documentation with new circuit breaker implementation details

## Additional Considerations

1. **Cookie Store Source**: Each implementation now uses the correct cookie store source:
   - Middleware: `request.cookies` and `supabaseResponse.cookies`
   - Server Components: `cookies()` from next/headers
   - Route Handlers: `cookies()` from next/headers

2. **Type Safety**: We're using `any` for the cookieStore parameter in `setEnhancedCookie` for pragmatic reasons, as the underlying cookie store implementations differ slightly between contexts.

3. **Circuit Breaker Logic**: Will be replaced with Cockatiel which provides:
   - Event-based monitoring
   - Multiple circuit breaker strategies
   - Composable policies for complex resilience patterns
   - Better controls for manual intervention

## Troubleshooting Authentication Issues

If you encounter authentication issues:

1. Clear browser cookies and local storage
2. Refresh the page completely
3. If history still doesn't load, check the browser console for circuit breaker messages
4. After implementing Cockatiel, the debug UI in development will provide a way to manually reset the circuit breaker
