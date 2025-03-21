import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiRateLimit, authRateLimit, aiRateLimit } from '@/lib/middleware/rate-limit';
import { createServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { corsMiddleware, CorsOptions } from '@/lib/middleware/cors';

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
  
  try {
    // Apply CORS middleware first
    const corsResponse = await corsMiddleware(request);
    
    // Handle OPTIONS requests (preflight)
    if (corsResponse && request.method === 'OPTIONS') {
      return corsResponse;
    }
    
    // Apply rate limiting based on API route type
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
    
    // Get Supabase client for auth checks
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Configuration error', message: 'API authentication is not configured' },
        { status: 500 }
      );
    }
    
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // For API routes, we don't need to set cookies
          },
        },
      }
    );
    
    // Check for protected API routes
    const isProtectedApi = !pathname.startsWith('/api/auth/') && 
                         !pathname.startsWith('/api/public/');
    
    if (isProtectedApi) {
      // Get the current user
      const { data, error } = await supabase.auth.getUser();
      const user = data?.user;
      
      if (error || !user) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        );
      }
      
      // For admin-only endpoints
      if (pathname.startsWith('/api/admin/')) {
        // First check admin status from metadata if available
        const isAdminMetadata = user.user_metadata?.is_admin === true;
        let isAdmin = isAdminMetadata;
        
        if (!isAdminMetadata) {
          // Check admin status using RPC function
          const { data: adminCheck, error: adminError } = await supabase.rpc('is_admin', { uid: user.id });
          isAdmin = !!adminCheck;
        }
        
        if (!isAdmin) {
          edgeLogger.warn('Unauthorized admin API access attempt', {
            userId: user.id,
            path: pathname
          });
          
          return NextResponse.json(
            { error: 'Forbidden', message: 'Admin access required' },
            { status: 403 }
          );
        }
      }
      
      // Add user info to request headers for use in API route handlers
      const requestWithUser = new Request(request.url, {
        method: request.method,
        headers: new Headers(request.headers),
        body: request.body,
        referrer: request.referrer,
        referrerPolicy: request.referrerPolicy,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        integrity: request.integrity,
        keepalive: request.keepalive,
        signal: request.signal,
      });
      
      // Add user ID to the request headers
      requestWithUser.headers.set('x-user-id', user.id);
      
      // If admin, add admin flag
      if (pathname.startsWith('/api/admin/')) {
        requestWithUser.headers.set('x-is-admin', 'true');
      }
      
      return NextResponse.next({
        request: requestWithUser,
      });
    }
    
    return NextResponse.next();
  } catch (error) {
    // Log error
    edgeLogger.error('API middleware error', {
      path: pathname,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Return a generic error response
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  } finally {
    // Log API request (only if not a ping/health endpoint)
    if (!pathname.includes('/health') && !pathname.includes('/ping')) {
      edgeLogger.info('API request', {
        path: pathname,
        method: request.method,
        processingTime: `${Date.now() - startTime}ms`
      });
    }
  }
}

/**
 * Helper function to create a middleware that combines our apiMiddleware with additional checks
 */
export function createApiMiddleware(additionalMiddleware?: (req: NextRequest) => Promise<NextResponse | null>) {
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
        error: error instanceof Error ? error.message : String(error)
      });
      
      return response;
    }
  };
} 