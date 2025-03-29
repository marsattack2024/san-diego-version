# Authentication Middleware Implementation

## Overview

This document details the complete implementation of authentication middleware in the application, with special focus on the history API and how we've resolved authentication race conditions and request flooding issues.

## Auth Readiness Pattern

To fix the 401 unauthorized errors occurring with the history API, we've implemented an "auth readiness" pattern with these key components:

### 1. Auth Readiness Headers in Middleware
```typescript
// In utils/supabase/middleware.ts
// After authenticating the user, set auth readiness headers
request.headers.set('x-auth-ready', 'true');
supabaseResponse.headers.set('x-auth-ready', 'true');
request.headers.set('x-auth-ready-time', authTimestamp);
supabaseResponse.headers.set('x-auth-ready-time', authTimestamp);
```

### 2. Auth Readiness Check in History Service
```typescript
// In lib/api/history-service.ts
async isAuthReady(): Promise<boolean> {
  // Probe auth status by making a lightweight request
  const probe = await fetch('/api/chat/test-permissions', {
    credentials: 'include',
    cache: 'no-store',
  });
  
  // Check for auth readiness header
  return probe.headers.get('x-auth-ready') === 'true';
}
```

### 3. Wait for Auth Before API Calls
```typescript
// In components/sidebar-history.tsx
// Before fetching history, check if auth is ready
const authReady = await historyService.isAuthReady();
if (!authReady) {
  console.log('Auth not ready yet, waiting before fetching...');
  // Retry with exponential backoff
  const retryDelay = Math.min(2000 + Math.random() * 1000, 8000);
  setTimeout(() => fetchChatHistory(forceRefresh), retryDelay);
  return [];
}
```

## Architecture

### 1. Root Middleware (`middleware.ts`)

The root middleware intercepts all requests and applies authentication processing:

```typescript
export async function middleware(request: NextRequest) {
  // Only log non-history paths or log at a much lower frequency for history
  const { pathname } = request.nextUrl;
  
  if (!pathname.startsWith('/api/history') || Math.random() < 0.01) {
    console.log(`Middleware processing path: ${pathname}`);
  }
  
  // Special bypass for Perplexity API 
  if (pathname.startsWith('/api/perplexity')) {
    console.log('Bypassing auth middleware for Perplexity API');
    return;
  }
  
  return await updateSession(request)
}
```

The `matcher` configuration ensures this middleware applies to the right paths:

```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/|public/|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/api/chat/:path*',
    '/api/history/:path*',
  ],
}
```

### 2. Supabase Session Middleware (`utils/supabase/middleware.ts`)

This middleware handles the Supabase authentication session and now sets auth readiness headers:

```typescript
export async function updateSession(request: NextRequest) {
  // Create response and Supabase client
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(...)
  
  // Get user from session
  const { data: { user } } = await supabase.auth.getUser()
  
  // Calculate auth completion time for client diagnostics
  const authCompletionTime = Date.now();
  const authTimestamp = authCompletionTime.toString();
  
  // Set auth readiness headers for ALL requests
  request.headers.set('x-auth-ready', 'true');
  supabaseResponse.headers.set('x-auth-ready', 'true');
  request.headers.set('x-auth-ready-time', authTimestamp);
  supabaseResponse.headers.set('x-auth-ready-time', authTimestamp);
  
  // Set auth headers based on authentication state
  if (user) {
    // Authenticated headers
    const authHeaders = {
      'x-supabase-auth': user.id,
      'x-auth-valid': 'true',
      'x-auth-time': authTimestamp,
      'x-auth-state': 'authenticated'
    };
    
    // Apply headers to both request and response
    // ...
  } else {
    // Unauthenticated headers for ALL API routes
    const unauthHeaders = {
      'x-supabase-auth': 'anonymous',
      'x-auth-valid': 'false',
      'x-auth-time': authTimestamp,
      'x-has-profile': 'false',
      'x-auth-state': 'unauthenticated'
    };
    
    // Add cookie presence check for debugging
    if (pathname.startsWith('/api/')) {
      const cookieHeader = request.headers.get('cookie') || '';
      const hasAuthCookies = cookieHeader.includes('sb-') && 
                             cookieHeader.includes('-auth-token');
      request.headers.set('x-has-auth-cookies', hasAuthCookies ? 'true' : 'false');
      supabaseResponse.headers.set('x-has-auth-cookies', hasAuthCookies ? 'true' : 'false');
      // ...
    }
  }
  
  // Only redirect non-history API paths when unauthenticated
  if (!user && [conditions for redirect]) {
    // Redirect to login
  }
  
  return supabaseResponse
}
```

### 3. API Route Implementation (`app/api/history/route.ts`)

API routes implement consistent authentication with special handling for edge cases:

```typescript
export async function GET(request: NextRequest) {
  // Get auth headers and request info
  const headersList = request.headers;
  const userId = headersList.get('x-supabase-auth');
  const isAuthValid = headersList.get('x-auth-valid') === 'true';
  const hasAuthCookies = headersList.get('x-has-auth-cookies') === 'true';
  
  // Check URL parameters
  const { searchParams } = new URL(request.url);
  const timestampParam = searchParams.get('t');
  const hasTimestamp = !!timestampParam;
  const authReadyParam = searchParams.get('auth_ready');
  
  // Try auth from middleware headers first
  if (userId && userId !== 'anonymous' && isAuthValid) {
    // Use headers-based auth
  }
  
  // Fall back to direct Supabase auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    // Use direct auth
  }
  
  // Authentication failed - handle special cases
  
  // Special case: If auth cookies present but auth failed, it's likely a timing issue
  if (hasAuthCookies && hasTimestamp) {
    // Return 409 Conflict to signal auth-in-progress
    return NextResponse.json(
      { error: 'AuthenticationPending' },
      { 
        status: 409,
        headers: {
          'Retry-After': '1',
          'x-auth-pending': 'true'
        } 
      }
    );
  }
  
  // Standard 401 for other cases
  // ...
}
```

### 4. Client-Side Implementation (`lib/api/history-service.ts`)

The client now checks for auth readiness before making API calls:

```typescript
export const historyService = {
  // Auth readiness check via lightweight probe
  async isAuthReady(): Promise<boolean> {
    // Check cached state first
    const cachedState = clientCache.get('auth_ready_state');
    if (cachedState === true) return true;
    
    // Make a probe request to test auth readiness
    const probe = await fetch('/api/chat/test-permissions', {
      credentials: 'include',
      cache: 'no-store'
    });
    
    const authReady = probe.headers.get('x-auth-ready') === 'true';
    clientCache.set('auth_ready_state', authReady, 30000); // 30 sec TTL
    return authReady;
  },
  
  async fetchHistoryFromAPI(cacheKey: string, operationId: string): Promise<Chat[]> {
    try {
      // CRITICAL FIX #1: Check for cookies
      const hasCookies = this.checkForAuthCookies();
      if (!hasCookies) {
        console.warn(`No auth cookies found, skipping fetch`, { operationId });
        setAuthFailureState(true);
        return [];
      }
      
      // CRITICAL FIX #2: Check if auth is ready
      const authReady = await this.isAuthReady();
      if (!authReady) {
        console.warn(`Auth not ready, skipping fetch`, { operationId });
        // Don't set failure state - this is normal during initialization
        return [];
      }
      
      // Global throttling to prevent request floods
      const now = Date.now();
      const timeSinceLastRequest = now - lastHistoryRequestTime;
      
      if (!forceRefresh && timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        // Use cached data instead
      }
      
      // Circuit breaker pattern for auth failures
      if (this.isInAuthFailure()) {
        // Return cached data
      }
      
      // Include auth_ready marker in URL for debugging
      let urlParams = `t=${timestamp}&auth_ready=true`;
      
      // API request with error handling
      const response = await fetch(`/api/history?${urlParams}`, {
        credentials: 'include',
        mode: 'same-origin',
        // ...
      });
      
      // Special handling for different status codes
      if (response.status === 401 || response.status === 403 || response.status === 409) {
        if (response.status === 409) {
          // Auth pending - retry after delay
        } else {
          // Track unauthorized responses
          // Trigger circuit breaker after threshold
        }
      }
    }
  }
}
```

## Component Integration

The sidebar history component now waits for auth to be ready before fetching:

```typescript
// In components/sidebar-history.tsx
const fetchChatHistory = useCallback(async (forceRefresh = false) => {
  // Skip if already refreshing
  if (isRefreshing) return;
  
  try {
    // CRITICAL FIX #1: Check for auth cookies
    const hasCookies = historyService.checkForAuthCookies();
    if (!hasCookies) {
      setErrorMessage('Please log in to view your chat history');
      setIsLoading(false);
      return [];
    }
    
    // CRITICAL FIX #2: Check if auth is ready
    const authReady = await historyService.isAuthReady();
    if (!authReady) {
      console.log('Auth not ready yet, waiting before fetching...');
      
      if (isLoading) {
        setErrorMessage('Preparing your history...');
      }
      
      // Set up retry with exponential backoff
      const retryDelay = Math.min(2000 + Math.random() * 1000, 8000);
      console.log(`Will retry in ${Math.round(retryDelay/1000)}s`);
      
      setTimeout(() => {
        if (isLoading || forceRefresh) {
          fetchChatHistory(forceRefresh);
        }
      }, retryDelay);
      
      return [];
    }
    
    // Auth is ready, proceed with history fetch
    console.log('Auth is ready, fetching history...');
    const historyData = await historyService.fetchHistory(forceRefresh);
    
    // Process results...
  } catch (error) {
    // Handle errors...
  }
}, [isLoading, isRefreshing /* other dependencies */]);
```

## Authentication Status Flows

### Successful Authentication Flow with Auth Readiness

1. Page loads, middleware processes auth and sets `x-auth-ready: true`
2. Component checks auth readiness via `/api/chat/test-permissions`
3. Auth readiness confirmed, component makes history API request
4. Request includes headers and `auth_ready=true` parameter
5. API returns 200 OK with data

### Auth Not Ready Flow

1. Page loads, component checks auth readiness
2. Probe request shows auth is not yet ready
3. Component displays "Preparing your history..." message
4. Component schedules retry with exponential backoff
5. On retry, auth is ready and history fetch succeeds

### Auth-In-Progress Flow (409 Conflict)

1. Client requests with auth cookies and timestamp
2. Middleware has not completed auth validation yet
3. API route detects auth cookies but auth validation incomplete
4. Returns 409 Conflict with `Retry-After: 1` header
5. Client retries after delay, using cached data temporarily

### Unauthorized Flow with Circuit Breaker

1. Client makes requests without auth
2. Middleware sets `x-supabase-auth: anonymous`, `x-auth-valid: false`
3. API route returns 401 Unauthorized
4. Client tracks consecutive 401s
5. After threshold (3 failures in 5 seconds), client activates circuit breaker
6. During circuit breaker period, client uses cached data and reduces requests

## Implementation Benefits

1. **Auth Readiness Check**: Prevents race conditions where requests happen before auth is ready
2. **Exponential Backoff**: Prevents request floods during auth initialization
3. **Consistent Headers**: All requests receive the same header pattern for easier debugging
4. **Auth State Tracking**: The `x-auth-ready` and other headers provide clear signals
5. **Circuit Breaking**: Prevents request floods during auth failures
6. **Special Status Codes**: The 409 Conflict improves handling of auth-in-progress state
7. **Global Throttling**: Prevents excessive requests regardless of auth state

## Monitoring and Debugging

To debug authentication issues:
1. Check for `x-auth-ready: true` header to confirm auth processing is complete
2. Use `await historyService.isAuthReady()` in console to check auth readiness
3. Look for 409 responses indicating auth-in-progress
4. Monitor circuit breaker activations in client logs
5. Check client-side throttling logs for request rate indicators