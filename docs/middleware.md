# Authentication & Middleware Architecture

This document provides a comprehensive overview of the authentication and middleware architecture in the San Diego application, including troubleshooting guides and implementation details.

## Overview

San Diego uses a layered middleware approach with several specialized middleware components that work together to handle:

1. **Authentication** - Session management and token validation via Supabase
2. **Route Protection** - Conditional access control based on auth state
3. **Rate Limiting** - Prevention of abuse through tiered throttling
4. **CORS** - Cross-Origin Resource Sharing policy enforcement
5. **API Processing** - Common headers, logging, and error handling
6. **URL Scraping** - Automatic content extraction for AI context enhancement
7. **Content Caching** - Performance optimization for AI responses

## Auth Readiness Pattern (CRITICAL FIX)

To resolve the 401 unauthorized errors occurring with the history API and other endpoints, we've implemented an "auth readiness" pattern with these key components:

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

## Middleware Layer Architecture

San Diego's middleware system is organized in a hierarchical pattern:

```
Root Middleware (middleware.ts)
├── Authentication (updateSession)
│   └── Session refresh and propagation
│
├── API Middleware (app/api/middleware.ts)
│   ├── CORS (lib/middleware/cors.ts)
│   ├── Rate Limiting (lib/middleware/rate-limit.ts)
│   ├── Auth Verification
│   └── Logging & Error Handling
│
└── AI Enhancement Middleware
    ├── URL Scraping (lib/middleware/url-scraping-middleware.ts)
    └── AI Caching (lib/cache/ai-middleware.ts)
```

## Authentication Flow Diagram

```
┌───────────┐     ┌───────────────────┐     ┌───────────────────┐     ┌───────────────┐
│           │     │                   │     │                   │     │               │
│  Browser  │────▶│  Root Middleware  │────▶│  API Middleware   │────▶│  Route Handler│
│           │     │   (middleware.ts) │     │(app/api/middleware│     │               │
└───────────┘     └───────────────────┘     └───────────────────┘     └───────────────┘
      │                     │                        │                        │
      │                     │                        │                        │
      │                     ▼                        │                        │
      │            ┌───────────────────┐             │                        │
      │            │  updateSession()  │             │                        │
      │            │(supabase/middlewar│             │                        │
      │            └───────────────────┘             │                        │
      │                     │                        │                        │
      │                     │                        │                        │
      │                     ▼                        │                        │
      │            ┌───────────────────┐             │                        │
      │            │ Supabase Auth API │             │                        │
      │            └───────────────────┘             │                        │
      │                     │                        │                        │
      │                     │                        │                        │
      │                     ▼                        ▼                        ▼
      │            Set Auth Headers   ───────▶   Verify Headers       Use Auth Context
      │                                                                       │
      │                                                                       │
      │                                                                       ▼
      └──────────────────────────────────────────────────────────────────Response
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

## Core Middleware Files

### Root Middleware (`middleware.ts`)

The entry point for all requests. Responsible for:

- Processing all matched routes based on the matcher configuration
- Special handling for Perplexity API bypass
- Calling `updateSession` to refresh auth tokens
- Setting auth headers for downstream middleware and API routes

```typescript
// middleware.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Only log non-history paths or log at a much lower frequency for history
  const { pathname } = request.nextUrl;
  
  if (!pathname.startsWith('/api/history') || Math.random() < 0.01) {
    console.log(`Middleware processing path: ${pathname}`);
  }
  
  // Special bypass for Perplexity API to allow internal server-to-server communication
  if (pathname.startsWith('/api/perplexity')) {
    console.log('Bypassing auth middleware for Perplexity API');
    return;
  }
  
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Base paths that need session processing
    '/((?!_next/static|_next/image|favicon.ico|auth/|public/|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    // Explicitly included API routes
    '/api/chat/:path*',
    '/api/history/:path*',
  ],
};
```

### Supabase Session Middleware (`utils/supabase/middleware.ts`)

Handles Supabase authentication session management:

- Refreshes auth tokens when needed
- Sets authentication headers on request and response
- Sets auth readiness headers for all requests
- Propagates auth state to downstream middleware
- Provides explicit headers for both authenticated and unauthenticated states
- Redirects unauthenticated users to login for protected routes

```typescript
// utils/supabase/middleware.ts (partial)
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid adding logic between client creation and getUser() call
  const { data: { user } } = await supabase.auth.getUser()
  
  // Calculate auth completion time and set auth readiness headers
  const authCompletionTime = Date.now();
  const authTimestamp = authCompletionTime.toString();
  
  // Set auth readiness headers for ALL requests - critical for preventing race conditions
  request.headers.set('x-auth-ready', 'true');
  supabaseResponse.headers.set('x-auth-ready', 'true');
  request.headers.set('x-auth-ready-time', authTimestamp);
  supabaseResponse.headers.set('x-auth-ready-time', authTimestamp);
  
  // Set auth headers for authenticated users on BOTH request and response
  if (user) {
    const authHeaders = {
      'x-supabase-auth': user.id,
      'x-auth-valid': 'true',
      'x-auth-time': authTimestamp,
      'x-auth-state': 'authenticated'
    };
    
    // Set headers on both request and response objects
    Object.entries(authHeaders).forEach(([key, value]) => {
      request.headers.set(key, value);
      supabaseResponse.headers.set(key, value);
    });
    
    // Additional profile check...
  } 
  // For unauthenticated users, still set explicit headers for certain routes
  else {
    // Set explicit "not authenticated" headers
    const unauthHeaders = {
      'x-supabase-auth': 'anonymous',
      'x-auth-valid': 'false',
      'x-auth-time': authTimestamp,
      'x-has-profile': 'false',
      'x-auth-state': 'unauthenticated'
    };
    
    // Set on both request and response objects
    Object.entries(unauthHeaders).forEach(([key, value]) => {
      request.headers.set(key, value);
      supabaseResponse.headers.set(key, value);
    });
    
    // Add cookie presence check for debugging
    if (pathname.startsWith('/api/')) {
      const cookieHeader = request.headers.get('cookie') || '';
      const hasAuthCookies = cookieHeader.includes('sb-') && 
                           cookieHeader.includes('-auth-token');
      request.headers.set('x-has-auth-cookies', hasAuthCookies ? 'true' : 'false');
      supabaseResponse.headers.set('x-has-auth-cookies', hasAuthCookies ? 'true' : 'false');
    }
  }

  // Handle redirects for unauthenticated users
  // ...

  return supabaseResponse
}
```

### API Middleware (`app/api/middleware.ts`)

Centralized middleware for all API routes that:

- Applies CORS headers using `corsMiddleware`
- Enforces rate limits based on endpoint type using `rateLimit`
- Verifies authentication headers from the root middleware
- Provides detailed logging for debugging and monitoring
- Handles errors consistently

### History Service Implementation 

The client-side history service implements authentication checks and circuit breaker patterns:

```typescript
export const historyService = {
  // Auth readiness check via lightweight probe
  async isAuthReady(): Promise<boolean> {
    // Cache key for storing auth ready state
    const AUTH_READY_KEY = 'auth_ready_state';
    const AUTH_READY_TIMESTAMP_KEY = 'auth_ready_timestamp';
    const AUTH_READY_TTL = 30000; // 30 seconds
    
    try {
      // Check if we have a cached auth ready state that's still valid
      const cachedState = clientCache.get(AUTH_READY_KEY) as boolean | undefined;
      const cachedTimestamp = clientCache.get(AUTH_READY_TIMESTAMP_KEY) as number | undefined;
      
      if (cachedState === true && cachedTimestamp && Date.now() - cachedTimestamp < AUTH_READY_TTL) {
        return true;
      }
      
      // No valid cached state, make a lightweight request to check auth status
      const probe = await fetch('/api/chat/test-permissions', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'x-operation-id': `auth_probe_${Math.random().toString(36).substring(2, 8)}`
        }
      });
      
      // Check if we got the auth-ready header
      const authReady = probe.headers.get('x-auth-ready') === 'true';
      const authState = probe.headers.get('x-auth-state');
      
      // Store the auth ready state
      clientCache.set(AUTH_READY_KEY, authReady, AUTH_READY_TTL);
      clientCache.set(AUTH_READY_TIMESTAMP_KEY, Date.now(), AUTH_READY_TTL);
      
      return authReady;
    } catch (e) {
      console.warn('Error checking auth readiness:', e);
      return false;
    }
  },
  
  async fetchHistoryFromAPI(cacheKey: string, operationId: string): Promise<Chat[]> {
    try {
      // CRITICAL FIX #1: Check for cookies before making the request
      const hasCookies = this.checkForAuthCookies();
      if (!hasCookies) {
        console.warn(`No auth cookies found, skipping history fetch to avoid 401`, { operationId });
        setAuthFailureState(true);
        return [];
      }
      
      // CRITICAL FIX #2: Check if auth is ready before making the request
      // This prevents the 401 errors that happen when the auth token is present but not yet valid
      const authReady = await this.isAuthReady();
      if (!authReady) {
        console.warn(`Auth not ready yet, skipping history fetch to avoid 401`, { operationId });
        // Don't set failure state here, this is a normal condition during app initialization
        return [];
      }
      
      // Include auth ready marker in the URL to help with debugging
      const timestamp = Date.now();
      let urlParams = `t=${timestamp}&auth_ready=true`;
      
      // API request with error handling
      const response = await fetch(`/api/history?${urlParams}`, {
        credentials: 'include',
        mode: 'same-origin',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      // Handle response status...
    }
  }
}
```

## Authentication Status Codes and Headers

The application uses specific status codes for different authentication states:

| Status Code | Description |
|-------------|-------------|
| 200 | Authentication successful |
| 401 | Unauthorized - No valid authentication |
| 403 | Forbidden - Authentication valid but insufficient permissions |
| 409 | Authentication Pending - Auth cookies present but validation incomplete |

### Authentication Headers

Authentication headers follow a consistent pattern:

#### For Authenticated Users
```
x-auth-ready: true
x-auth-ready-time: [timestamp]
x-supabase-auth: [user_id]
x-auth-valid: true
x-auth-time: [timestamp]
x-has-profile: [true|false]
x-auth-state: authenticated
```

#### For Unauthenticated Users
```
x-auth-ready: true
x-auth-ready-time: [timestamp]
x-supabase-auth: anonymous
x-auth-valid: false
x-auth-time: [timestamp]
x-has-profile: false
x-has-auth-cookies: [true|false]
x-auth-state: unauthenticated
```

#### Error Response Headers

For 401 Unauthorized responses, additional headers are included:
```
x-unauthorized-count: [count] - Number of consecutive unauthorized requests
x-unauthorized-timestamp: [timestamp] - Timestamp of the unauthorized request
```

For 409 Conflict responses, retry information is provided:
```
Retry-After: 1 - Suggested retry delay in seconds
x-auth-pending: true - Indicates authentication is in progress
```

## Client-Side Authentication Implementation

Client-side code follows these patterns:

1. **Check Auth Readiness**: Always check if authentication is ready before making authenticated requests
2. **Include Credentials**: Always use `credentials: 'include'` with fetch requests
3. **Add Timestamp Parameters**: Include timestamps in request URLs for cache busting
4. **Use Exponential Backoff**: Implement exponential backoff with randomness for retries
5. **Implement Circuit Breaker**: Use circuit breaker pattern for auth failures
6. **Cache Responses**: Cache responses to prevent excessive polling

## Troubleshooting Authentication Issues

### Common Authentication Problems

#### 1. 401 Unauthorized Errors
- **Symptom**: API requests fail with 401 status code
- **Common Causes**: 
  - Requests made before authentication is complete (race condition)
  - Missing or expired auth cookies
  - Missing credentials in fetch requests
- **Diagnosis**:
  - Check browser DevTools > Network tab for 401 responses
  - Look for auth cookies in Application > Cookies
  - Verify `x-auth-ready: true` header on responses
- **Solutions**:
  - Implement auth readiness check before making requests
  - Always use `credentials: 'include'` in fetch requests
  - Add exponential backoff for retries
  - Use circuit breaker pattern for consecutive failures

#### 2. Authentication Race Conditions
- **Symptom**: Initial page load has 401 errors that resolve themselves
- **Common Causes**:
  - Components making API requests before authentication is ready
  - Auth cookies present but not yet processed
- **Diagnosis**:
  - Check for `x-has-auth-cookies: true` header with 401 status
  - Look for 409 Conflict responses
- **Solutions**:
  - Always check `await historyService.isAuthReady()` before making API requests
  - Implement exponential backoff for retries
  - Handle 409 Conflict responses properly

#### 3. Header Propagation Issues
- **Symptom**: Authentication headers not being passed correctly
- **Common Causes**:
  - Middleware not setting headers on both request and response
  - Request objects being recreated without preserving headers
- **Diagnosis**:
  - Check response headers in Network tab
  - Log headers in middleware and API routes
- **Solutions**:
  - Set headers on both request and response objects
  - Use dual-authentication approach with header-based and direct Supabase auth

### Debugging Tools

1. **Check Auth Readiness State**:
   ```javascript
   // In browser console
   await historyService.isAuthReady();  // Should return true when auth is ready
   ```

2. **Check Auth Cookies**:
   ```javascript
   // In browser console
   historyService.checkForAuthCookies();  // Should return true when cookies exist
   ```

3. **Check Auth Headers**:
   ```javascript
   // Make a test request and examine headers
   const response = await fetch('/api/chat/test-permissions', {
     credentials: 'include'
   });
   
   console.log('Auth ready:', response.headers.get('x-auth-ready'));
   console.log('Auth state:', response.headers.get('x-auth-state'));
   console.log('Auth time:', response.headers.get('x-auth-time'));
   ```

4. **Check Circuit Breaker State**:
   ```javascript
   // In browser console
   historyService.isInAuthFailure();  // Should return false in normal operation
   historyService.getAuthFailureInfo();  // Get detailed circuit breaker state
   ```

## Implementation Benefits

1. **Auth Readiness Check**: Prevents race conditions where requests happen before auth is ready
2. **Exponential Backoff**: Prevents request floods during auth initialization
3. **Consistent Headers**: All requests receive the same header pattern for easier debugging
4. **Auth State Tracking**: The `x-auth-ready` and other headers provide clear signals
5. **Circuit Breaking**: Prevents request floods during auth failures
6. **Special Status Codes**: The 409 Conflict improves handling of auth-in-progress state
7. **Global Throttling**: Prevents excessive requests regardless of auth state

## Alignment with Supabase Auth Best Practices

Our implementation follows the recommended Supabase Auth patterns with some customizations:

### Followed Recommendations

1. **Cookie-Based Auth**: Using the recommended cookie-based authentication flow with `createServerClient` and `createBrowserClient`.
2. **Middleware for Token Refresh**: Implementing middleware to handle token refreshing as recommended in the docs.
3. **Separation of Client Types**: Using appropriate client types for different contexts.
4. **Explicit Route Protection**: Using `supabase.auth.getUser()` for protected routes rather than relying on `getSession()`.

### Customizations and Enhancements

1. **Auth Readiness Pattern**: Added auth readiness headers and checks to prevent race conditions.
2. **Dual Authentication Pattern**: Added resilience through header-based auth with direct Supabase fallback.
3. **Circuit Breaker Pattern**: Implemented circuit breaker for auth failures to prevent cascading failures.
4. **Explicit Headers for All States**: Setting explicit headers for both authenticated and unauthenticated states.

## Vercel Serverless Environment Variable Troubleshooting

### Common Environment Variable Issues in Vercel Serverless Functions

When deploying to Vercel, environment variables can be tricky, especially for APIs like Perplexity that run in serverless functions. Here are common issues and solutions:

#### 1. Missing or Inaccessible Environment Variables
- **Symptom**: API returns 401 or 500 errors due to missing API keys
- **Common Causes**:
  - Environment variable not set in Vercel dashboard
  - Environment variable has incorrect name
  - Environment variable not accessible in serverless context
- **Diagnosis**:
  - Add logging to check if environment variable exists
  - Check env var format and length
  - Review Vercel build logs
- **Solutions**:
  - Set environment variables in Vercel dashboard
  - Use `@` prefix in vercel.json for secret references
  - Ensure correct casing and naming
  - Avoid NEXT_PUBLIC_ prefix for private API keys

#### 2. Serverless vs Edge Runtime Context Differences
- **Symptom**: Environment variables work in Edge Functions but not in Serverless Functions
- **Common Causes**:
  - Different environment handling between runtimes
  - `next.config.mjs` env setup not properly propagating to serverless
- **Diagnosis**:
  - Add explicit environment checks with detailed logging
  - Test with minimal API endpoint
- **Solutions**:
  - Configure environment in vercel.json
  - Force clean deployment with cache invalidation
  - Ensure proper env var mapping in both contexts

#### 3. Verifying Environment Variables in Production
To verify environment variables in production without exposing sensitive data:
- Log the existence and format of keys, not the values
- Check for expected key prefixes or patterns
- Monitor API responses for auth failures
- Use Vercel Logs to check environment variable presence

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js Middleware Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)