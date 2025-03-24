import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { edgeLogger } from '@/lib/logger/edge-logger';
import { createServerClient } from '@/lib/supabase/server';
import { authCache } from '@/lib/auth/auth-cache';
import { LRUCache } from 'lru-cache';

// Request-specific auth cache (short TTL)
const requestCache = new LRUCache<string, any>({
  max: 100,
  ttl: process.env.NODE_ENV === 'development' 
    ? 1000 * 60 * 5   // 5 minutes in development
    : 1000 * 10       // 10 seconds in production
});

/**
 * Get the currently authenticated user with caching
 * @param ttlMs Cache TTL in milliseconds (defaults to 60 seconds)
 */
export async function getCachedUser(ttlMs: number = 60000) {
  // Development fast path, only do this check once per minute
  const DEV_FAST_PATH_ENABLED = process.env.NODE_ENV === 'development' && 
                              process.env.NEXT_PUBLIC_SKIP_AUTH_CHECKS === 'true';
  
  if (DEV_FAST_PATH_ENABLED) {
    // For development fast path, we can use a static mock user
    // Check if we have it in local cache first
    const devUser = authCache.get(ttlMs);
    if (devUser) {
      return devUser;
    }
    
    // Create a mock user for development with a valid UUID format
    const mockUser = {
      id: '00000000-0000-4000-a000-000000000000', // Valid UUID format for dev mode
      email: 'dev@example.com',
      user_metadata: {
        has_profile: true
      },
      app_metadata: {
        provider: 'dev'
      }
    };
    
    // Cache the mock user
    authCache.set(mockUser);
    
    return mockUser;
  }
  
  // Check if we have a valid cached user
  const cachedUser = authCache.get(ttlMs);
  if (cachedUser) {
    console.log('Using cached user');
    return cachedUser;
  }
  
  // Cache miss - fetch from Supabase
  try {
    console.log('Fetching fresh user data');
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) throw error;
    
    if (user) {
      // Store user in cache
      authCache.set(user);
    }
    
    return user;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

/**
 * Helper function to get authenticated user for API routes
 * Minimizes duplicate auth code across API handlers
 * 
 * @param request The Next.js request object
 * @returns Object containing user, supabase client, and error response if auth failed
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const requestPath = request.nextUrl.pathname;
  const requestMethod = request.method;
  const cacheKey = `${requestPath}:${requestMethod}`;
  
  // Development fast path
  const DEV_FAST_PATH_ENABLED = process.env.NODE_ENV === 'development' && 
                              process.env.NEXT_PUBLIC_SKIP_AUTH_CHECKS === 'true';
  
  if (DEV_FAST_PATH_ENABLED) {
    // Check if we have a dev auth result cached
    const cachedDevResult = requestCache.get('dev-auth-result');
    if (cachedDevResult) {
      return cachedDevResult;
    }
    
    // Create a mock auth result for development
    const serverClient = await createServerClient();
    const mockUser = {
      id: '00000000-0000-4000-a000-000000000000', // Valid UUID format for dev mode
      email: 'dev@example.com',
      user_metadata: {
        has_profile: true
      },
      app_metadata: {
        provider: 'dev'
      }
    };
    
    const mockResult = {
      user: mockUser,
      serverClient,
      errorResponse: null
    };
    
    // Cache the mock auth result
    requestCache.set('dev-auth-result', mockResult);
    requestCache.set(cacheKey, mockResult);
    
    return mockResult;
  }
  
  // Check request-level cache first
  const cachedResult = requestCache.get(cacheKey);
  if (cachedResult) {
    edgeLogger.debug('Using cached auth result', { path: requestPath, cacheHit: true });
    return cachedResult;
  }
  
  // Start measuring execution time
  const startTime = performance.now();
  
  try {
    // Initialize server client using cookies from request
    const cookieStore = await cookies();
    
    // Simplified cookie check - just check for auth cookie presence
    const allCookies = cookieStore.getAll();
    const authCookie = allCookies.find(c => c.name.includes('auth-token'));
    
    // Only log cookie debug info in development
    if (process.env.NODE_ENV === 'development') {
      edgeLogger.debug('Cookie information in getAuthenticatedUser', {
        cookieCount: allCookies.length,
        hasCookies: allCookies.length > 0,
        hasAuthCookie: !!authCookie,
        path: requestPath,
        method: requestMethod
      });
    }
    
    if (!authCookie) {
      const errorResult = {
        user: null,
        serverClient: null,
        errorResponse: new Response(
          JSON.stringify({ 
            error: 'Not authenticated',
            message: 'Missing authentication cookies'
          }),
          { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        ),
      };
      
      // Cache the error result briefly
      requestCache.set(cacheKey, errorResult);
      return errorResult;
    }
    
    const supabase = createSupabaseServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch (e) {
              // Only log errors in development
              if (process.env.NODE_ENV === 'development') {
                edgeLogger.error('Error setting cookies in getAuthenticatedUser', {
                  error: e,
                  path: requestPath
                });
              }
            }
          },
        },
      }
    );
    
    // Fetch user information
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    
    if (userError) {
      edgeLogger.warn('Auth error while getting user', { 
        errorMessage: userError.message,
        path: requestPath
      });
    }
    
    if (!user) {
      const errorResult = {
        user: null,
        serverClient: null,
        errorResponse: new Response(
          JSON.stringify({ 
            error: 'Not authenticated',
            message: 'You must be logged in to access this endpoint'
          }),
          { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        ),
      };
      
      // Cache the error result briefly
      requestCache.set(cacheKey, errorResult);
      return errorResult;
    }
    
    // Add the user to the global auth cache
    authCache.set(user);
    
    // Create authenticated server client
    const serverClient = await createServerClient();
    
    // Create success result
    const result = {
      user,
      serverClient,
      errorResponse: null,
    };
    
    // Log authentication performance in development
    if (process.env.NODE_ENV === 'development') {
      const executionTime = Math.round(performance.now() - startTime);
      if (executionTime > 300) { // Only log slow auth operations
        edgeLogger.info('Auth performance', { 
          path: requestPath, 
          executionTimeMs: executionTime,
          wasSlow: true
        });
      }
    }
    
    // Cache successful result
    requestCache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    // Handle unexpected errors
    edgeLogger.error('Unexpected authentication error', { 
      error,
      path: requestPath,
      method: requestMethod,
      errorMessage: typeof error === 'object' ? (error as any).message : String(error)
    });
    
    const errorResult = {
      user: null,
      serverClient: null,
      errorResponse: new Response(
        JSON.stringify({ 
          error: 'Authentication error',
          message: 'An error occurred during authentication'
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      ),
    };
    
    // Don't cache error results from unexpected errors
    return errorResult;
  }
}