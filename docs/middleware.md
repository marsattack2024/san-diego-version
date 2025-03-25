# Authentication & Middleware Architecture

This document provides a comprehensive overview of the authentication and middleware architecture in the San Diego application.

## Overview

San Diego uses a layered middleware approach with several specialized middleware components that work together to handle:

1. **Authentication** - Session management and token validation via Supabase
2. **Route Protection** - Conditional access control based on auth state
3. **Rate Limiting** - Prevention of abuse through tiered throttling
4. **CORS** - Cross-Origin Resource Sharing policy enforcement
5. **API Processing** - Common headers, logging, and error handling
6. **URL Scraping** - Automatic content extraction for AI context enhancement
7. **Content Caching** - Performance optimization for AI responses

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
  
  // Set auth headers for authenticated users on BOTH request and response
  if (user) {
    const authHeaders = {
      'x-supabase-auth': user.id,
      'x-auth-valid': 'true',
      'x-auth-time': Date.now().toString()
    };
    
    // Set headers on both request and response objects
    Object.entries(authHeaders).forEach(([key, value]) => {
      request.headers.set(key, value);
      supabaseResponse.headers.set(key, value);
    });
    
    // Additional profile check...
  } 
  // For unauthenticated users, still set explicit headers for certain routes
  else if (pathname.startsWith('/api/history')) {
    // Set explicit "not authenticated" headers
    const unauthHeaders = {
      'x-supabase-auth': 'anonymous',
      'x-auth-valid': 'false',
      'x-auth-time': Date.now().toString(),
      'x-has-profile': 'false'
    };
    
    // Set on both request and response objects
    Object.entries(unauthHeaders).forEach(([key, value]) => {
      request.headers.set(key, value);
      supabaseResponse.headers.set(key, value);
    });
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

```typescript
// app/api/middleware.ts (partial)
export async function apiMiddleware(request: NextRequest) {
  const startTime = Date.now();
  const { pathname } = request.nextUrl;
  
  try {
    // Apply CORS middleware first
    const corsResponse = await corsMiddleware(request);
    
    // Handle preflight requests
    if (corsResponse && request.method === 'OPTIONS') {
      return corsResponse;
    }
    
    // Apply rate limiting based on endpoint type
    if (pathname.startsWith('/api/auth/')) {
      const rateLimitResponse = await authRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
    } else if (pathname.startsWith('/api/chat/')) {
      const rateLimitResponse = await aiRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
    } else {
      const rateLimitResponse = await apiRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
    }
    
    // Verify authentication for protected routes
    const isProtectedApi = !pathname.startsWith('/api/auth/') && 
                         !pathname.startsWith('/api/public/');
    
    if (isProtectedApi) {
      // Check headers set by the root middleware
      const userId = request.headers.get('x-supabase-auth');
      const isAuthValid = request.headers.get('x-auth-valid') === 'true';
      
      if (!userId || !isAuthValid) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        );
      }
    }
    
    // Continue with the request
    const response = NextResponse.next();
    response.headers.set('x-api-processed', 'true');
    
    return response;
  } catch (error) {
    // Error handling...
  }
}
```

### CORS Middleware (`lib/middleware/cors.ts`)

Handles Cross-Origin Resource Sharing policies:

- Sets appropriate CORS headers based on origin
- Handles preflight OPTIONS requests
- Supports development mode with relaxed restrictions

### Rate Limiting (`lib/middleware/rate-limit.ts`)

Prevents API abuse through intelligent throttling:

- `authRateLimit` - Stricter limits for auth endpoints (15/minute)
- `apiRateLimit` - Standard limits for most endpoints (120/minute)
- `aiRateLimit` - Lower limits for AI-intensive operations
- In-memory storage with automatic cleanup
- Development mode with higher thresholds

### URL Scraping Middleware (`lib/middleware/url-scraping-middleware.ts`)

Enhances AI context by automatically processing URLs:

- Detects URLs in messages
- Scrapes content using Puppeteer
- Caches results in Redis
- Formats content for optimal AI consumption

### AI Caching Middleware (`lib/cache/ai-middleware.ts`)

Improves performance by caching AI responses:

- Stores AI responses in Redis
- Handles both generate and stream operations
- Simulates streaming for cached responses
- Creates deterministic cache keys

## Client-Side Authentication Implementation

On the client side, Supabase authentication is implemented following the recommended patterns:

```typescript
// Example client-side fetch with auth
async function fetchProtectedResource() {
  // Critical: include credentials to send auth cookies
  const response = await fetch('/api/protected-resource', {
    method: 'GET',
    credentials: 'include', // This ensures cookies are sent
    cache: 'no-store',      // Prevents caching of authenticated requests
    headers: {
      'Cache-Control': 'no-cache' // Further ensures fresh results
    }
  });
  
  if (response.status === 401) {
    // Handle authentication failure
    redirectToLogin();
  }
  
  return await response.json();
}
```

For history API requests specifically, we ensure consistent authentication by always:
1. Including the `credentials: 'include'` option
2. Adding a timestamp parameter for consistent cache-busting
3. Using circuit breaker patterns to handle auth failures gracefully

```typescript
// Example from history-service.ts
const timestamp = Date.now();
const url = `/api/history?t=${timestamp}`;

const response = await fetch(url, {
  method: 'GET',
  headers,
  credentials: 'include', // Critical for authentication
  cache: 'no-store',
  signal: abortController.signal
});
```

## Authentication Flow

1. **Request Initiation**:
   - Browser sends request with cookies to Next.js server
   - Root middleware intercepts based on matcher configuration

2. **Session Refreshing**: 
   - `updateSession` creates Supabase client with cookie access
   - Auth token is refreshed via `supabase.auth.getUser()`
   - New tokens are set in cookies via response

3. **Header Propagation**:
   - Auth state is propagated via custom headers
   - Headers are set on both request and response objects
   - Explicit headers for unauthenticated states on certain routes

4. **Authentication Verification**:
   - API middleware verifies headers from root middleware
   - Dual-authentication for critical routes (header-based + direct Supabase)

5. **Client Authentication**:
   - Client includes cookies with all requests
   - All API requests use `credentials: 'include'` to send cookies
   - Timestamp parameter ensures consistent request patterns

## Alignment with Supabase Auth Best Practices

Our implementation follows the recommended Supabase Auth patterns with some customizations:

### Followed Recommendations

1. **Cookie-Based Auth**: Using the recommended cookie-based authentication flow with `createServerClient` and `createBrowserClient`.

2. **Middleware for Token Refresh**: Implementing middleware to handle token refreshing as recommended in the docs.

3. **Separation of Client Types**: Using the appropriate client type for each context:
   - `createBrowserClient` for client components 
   - `createServerClient` for server components and middleware

4. **Explicit Route Protection**: Using `supabase.auth.getUser()` for protected routes rather than relying on `getSession()`.

5. **Cookie Handling in Middleware**: The middleware properly handles cookie operations during session refresh.

### Customizations and Enhancements

1. **Dual Authentication Pattern**: Our implementation adds resilience through a dual-auth approach:
   - Header-based authentication from middleware
   - Direct Supabase authentication as fallback

2. **Explicit Headers for Unauthenticated States**: We explicitly set headers for unauthenticated users on specific routes to avoid ambiguity.

3. **Header Propagation to Response**: We set headers on both request and response objects to ensure consistency downstream.

4. **Circuit Breaker Pattern**: We implement a circuit breaker for auth failures to prevent cascading failures.

5. **Custom API Middleware**: We have a separate API middleware layer to handle additional concerns like rate limiting and CORS.

## Key Patterns and Best Practices

### Dual-Authentication

For critical routes like `/api/history`, we implement dual-authentication:

1. **Header-based auth**: Using headers set by the root middleware
2. **Direct Supabase auth**: Fallback using direct Supabase client authentication

This provides resilience against header propagation issues.

### Header Consistency

Authentication headers follow a consistent pattern:

```
x-supabase-auth: [user_id or "anonymous"]
x-auth-valid: ["true" or "false"]
x-auth-time: [timestamp]
x-has-profile: ["true" or "false"]
```

### Rate Limiting Tiers

Three tiers of rate limiting are applied:

1. **Auth endpoints**: Most restrictive (15/minute)
2. **AI endpoints**: Moderate (based on model complexity)
3. **General API**: Least restrictive (120/minute)

### Client-Side Authentication

Client-side code follows these patterns:

1. Include `credentials: 'include'` on all fetch requests
2. Add timestamp parameter for consistent request patterns
3. Use circuit breaker pattern for auth failures
4. Cache responses to prevent excessive polling

## Performance Considerations

The middleware architecture impacts performance in several ways:

### Optimization Strategies

1. **Selective Middleware Execution**: Not all middleware runs for every request. The matcher configuration ensures middleware only runs for relevant routes.

2. **Early Returns**: Special cases like the Perplexity API bypass avoid unnecessary processing.

3. **Reduced Logging Frequency**: History API requests are logged at a much lower frequency (1% or 5%) to reduce overhead.

4. **Redis Caching**: AI responses are cached in Redis to improve performance for repeated requests.

5. **Response Streaming**: AI responses use streaming to provide immediate feedback while processing continues.

6. **Intelligent Rate Limiting**: Rate limits are designed to prevent abuse while allowing legitimate use patterns.

### Performance Implications

1. **Middleware Overhead**: Each middleware layer adds processing time to requests. Our measurements show:
   - Root middleware: ~5-15ms overhead
   - API middleware: ~3-10ms additional overhead
   - Specialized middleware: Varies by function

2. **Auth Verification Cost**: Checking `supabase.auth.getUser()` adds ~100-200ms to initial auth checks, but subsequent checks can leverage the refreshed session.

3. **Caching Benefits**: Redis caching for AI responses can reduce response times from seconds to milliseconds for cached content.

4. **Client-Side Optimization**: Using circuit breakers and adaptive polling intervals reduces unnecessary requests during auth failures.

## Troubleshooting

### Common Authentication Issues

1. **401 Unauthorized Errors**:
   - Check middleware matcher includes relevant routes
   - Verify client includes credentials with requests 
   - Ensure timestamp parameter is consistently used
   - Check browser cookie state and expiration

2. **Header Propagation Issues**:
   - Verify updateSession sets headers on both request and response
   - Implement dual-authentication for critical routes
   - Use consistent header naming and format

3. **Rate Limiting Problems**:
   - Adjust thresholds based on actual usage patterns
   - Add request coalescing for bursts of similar requests
   - Implement client-side throttling to prevent lockouts

4. **CORS Issues**:
   - Check allowed origins in CORS middleware
   - Verify preflight requests are handled correctly
   - Test cross-origin requests with browser developer tools

## Conclusion

The middleware architecture in San Diego provides a robust, layered approach to authentication, security, and performance. By separating concerns into specialized middleware components that work together seamlessly, we ensure a more maintainable and scalable system.

For authentication specifically, the dual approach of middleware-based header propagation combined with direct Supabase auth provides resilience against common SSR authentication challenges.

## References

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js Middleware Documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Vercel Edge Runtime](https://vercel.com/docs/functions/edge-functions/edge-runtime)
- [Next.js Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
