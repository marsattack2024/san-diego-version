import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiRateLimit, authRateLimit, aiRateLimit, rateLimit } from '@/lib/middleware/rate-limit';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { corsMiddleware } from '@/lib/middleware/cors';

/**
 * API middleware to handle:
 * 1. CORS headers for cross-origin requests
 * 2. Rate limiting based on endpoint type
 * 3. Authentication verification for protected endpoints
 * 4. Request logging and error handling
 */
export async function apiMiddleware(request: NextRequest) {
  const startTime = Date.now();
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get('x-request-id') || `req_${Date.now().toString(36)}`;
  
  try {
    // Apply CORS middleware first
    const corsResponse = await corsMiddleware(request);
    
    // Handle OPTIONS requests (preflight)
    if (corsResponse && request.method === 'OPTIONS') {
      return corsResponse;
    }
    
    // Special handling for history endpoint which may be getting spammed
    if (pathname.startsWith('/api/history')) {
      // Get auth headers to apply different rate limits based on auth state
      const userId = request.headers.get('x-supabase-auth');
      const isAuthValid = request.headers.get('x-auth-valid') === 'true';
      const isAuthenticated = userId && userId !== 'anonymous' && isAuthValid;
      
      // Apply different rate limits based on authentication state
      // Authenticated users get higher limits (25/min), unauthenticated get lower (5/min)
      const historyLimiter = rateLimit(
        isAuthenticated ? 25 : 5,  // Requests per minute based on auth
        60 * 1000,                 // 1 minute window
        (req) => {
          // Include auth state in the rate limit key to separate auth vs unauth limits
          const baseId = req.headers.get('x-forwarded-for') || 
                        req.headers.get('x-real-ip') || 
                        'unknown-ip';
          return `${baseId}|${isAuthenticated ? 'auth' : 'unauth'}`;
        }
      );
      
      const historyResponse = await historyLimiter(request);
      
      if (historyResponse) {
        edgeLogger.warn('History API rate limit exceeded', {
          userId: userId || 'anonymous',
          ipHash: getIpHash(request),
          path: pathname,
          requestId,
          isAuthenticated
        });
        
        // Return the rate limit response
        return historyResponse;
      }
      
      // Skip detailed logging for history endpoints to reduce noise
      request.headers.set('x-skip-detailed-logging', 'true');
    } else {
      // Apply normal rate limiting based on API route type
      let rateLimitResponse = null;
      
      if (pathname.startsWith('/api/auth/')) {
        // Apply stricter rate limits for auth endpoints
        rateLimitResponse = await authRateLimit(request);
      } else if (pathname.startsWith('/api/chat/') || pathname.includes('/ai/')) {
        // Apply special limits for AI-related endpoints
        rateLimitResponse = await aiRateLimit(request);
      } else {
        // Apply standard API rate limits
        rateLimitResponse = await apiRateLimit(request);
      }
      
      // If rate limit was exceeded, return the 429 response
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    // Check for protected API routes
    const isProtectedApi = !pathname.startsWith('/api/auth/') && 
                         !pathname.startsWith('/api/public/');
    
    if (isProtectedApi) {
      // The authentication is now handled in the main middleware.ts via updateSession
      // Here we just check if user headers were added by the main middleware
      const userId = request.headers.get('x-supabase-auth');
      const isAuthValid = request.headers.get('x-auth-valid') === 'true';
      
      if (!userId || !isAuthValid) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        );
      }
      
      // For admin-only endpoints
      if (pathname.startsWith('/api/admin/')) {
        const isAdmin = request.headers.get('x-is-admin') === 'true';
        
        if (!isAdmin) {
          edgeLogger.warn('Unauthorized admin API access attempt', {
            userId,
            path: pathname,
            requestId
          });
          
          return NextResponse.json(
            { error: 'Forbidden', message: 'Admin access required' },
            { status: 403 }
          );
        }
      }
    }
    
    // Apply standard headers to all API responses via Next middleware
    const response = NextResponse.next();
    response.headers.set('x-api-processed', 'true');
    response.headers.set('x-processing-time', `${Date.now() - startTime}`);
    
    return response;
  } catch (error) {
    // Log error
    edgeLogger.error('API middleware error', {
      path: pathname,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId
    });
    
    // Return a generic error response
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  } finally {
    // Log API request (only if not a ping/health endpoint)
    if (!pathname.includes('/health') && !pathname.includes('/ping')) {
      const duration = Date.now() - startTime;
      
      // Only log if:
      // 1. Processing took more than 50ms to reduce noise, or
      // 2. It's a non-history endpoint, or
      // 3. It's a history endpoint but the request is slow (>200ms)
      if ((duration > 50 && !pathname.startsWith('/api/history')) || 
          (pathname.startsWith('/api/history') && duration > 200)) {
        
        // Use info level for normal requests, debug level for history to reduce noise
        const logLevel = pathname.startsWith('/api/history') ? 'debug' : 'info';
        const logMethod = logLevel === 'debug' ? edgeLogger.debug : edgeLogger.info;
        
        logMethod('API request processed', {
          path: pathname,
          method: request.method,
          durationMs: duration,
          requestId
        });
      }
    }
  }
}

/**
 * Helper function to create a middleware that combines our apiMiddleware with additional checks
 */
export function createApiMiddleware(additionalMiddleware?: (_req: NextRequest) => Promise<NextResponse | null>) {
  return async function(request: NextRequest) {
    // First apply our standard API middleware
    const response = await apiMiddleware(request);
    
    // If the response is not a "next" response, return it (e.g., rate limit or auth failure)
    if (response.status !== 200 || !additionalMiddleware) {
      return response;
    }
    
    // Apply additional middleware if provided
    try {
      const additionalResponse = await additionalMiddleware(request);
      return additionalResponse || response;
    } catch (error) {
      edgeLogger.error('Additional API middleware error', {
        path: request.nextUrl.pathname,
        error: error instanceof Error ? error.message : String(error),
        requestId: request.headers.get('x-request-id') || 'unknown'
      });
      
      return response;
    }
  };
}

/**
 * Helper function to get a hashed IP for logging purposes
 * Preserves privacy while still allowing identification of patterns
 */
function getIpHash(request: NextRequest): string {
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
             
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return `ip_${Math.abs(hash).toString(16).substring(0, 8)}`;
}